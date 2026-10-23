package main

import (
	"cmp"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"
)

// Yours to keep (Phase 3 of the review of 2026-10-15): what the server does
// for the notebook that lives on the phone. Three things, each small:
//
//   - Plan checks. A plan's words never leave the phone; when the next
//     sitting asks how it went, "did it" or "not yet" comes here with the
//     phone's date, under its own random key (migrations/006_keep.sql).
//   - The export: everything the server holds for one phone, with each
//     question and answer written out, for "Download my book".
//   - The encrypted backup (vault.go).

// Plan check statuses. "Changed it" stays on the phone.
const (
	planDid    = "did"
	planNotYet = "not_yet"
)

// PlanCheck is one check of a plan, as the server keeps it.
type PlanCheck struct {
	DeviceKey string
	Key       string // the phone's random key for this one check
	Date      string // the phone's date, YYYY-MM-DD
	Status    string // planDid or planNotYet
}

// PlanCheckRequest is the body of POST /api/plans/checks. The
// Idempotency-Key header is the check's random key.
type PlanCheckRequest struct {
	Status  string `json:"status"`
	Date    string `json:"date"`
	VoterID string `json:"voterId"`
}

// SavePlanCheck is POST /api/plans/checks. Sending the same check again
// changes nothing.
func (s *Server) SavePlanCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	key := r.Header.Get("Idempotency-Key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "missing_idempotency_key")
		return
	}
	var req PlanCheckRequest
	if !tokenPattern.MatchString(key) ||
		json.NewDecoder(http.MaxBytesReader(w, r.Body, maxVoteBodyBytes)).Decode(&req) != nil || req.VoterID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	deviceID, ok := s.devices.Verify(req.VoterID)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	if (req.Status != planDid && req.Status != planNotYet) || !s.isOpenDate(req.Date) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	c := PlanCheck{DeviceKey: s.devices.mirrorKey(deviceID), Key: key, Date: req.Date, Status: req.Status}
	if err := s.mirror.SavePlanCheck(r.Context(), c); errors.Is(err, ErrDeviceForgotten) {
		writeError(w, http.StatusGone, "device_forgotten")
		return
	} else if err != nil {
		log.Printf("plan check: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// DeviceExport is the response of GET /api/device/export: every row the
// server holds for one phone, written out so a person can read it. A private
// answer was never kept with its question or option, so it reads as one.
type DeviceExport struct {
	Made       string            `json:"made"` // the server's date when it was made
	About      string            `json:"about"`
	KeptFor    Retention         `json:"keptFor"`
	Answers    []ExportAnswer    `json:"answers"`
	Steps      []ExportStep      `json:"steps"`
	PlanChecks []ExportPlanCheck `json:"planChecks"`
	Weeks      []ExportWeek      `json:"weeklyNotes"`
	Votes      []ExportVote      `json:"votes"`
}

type ExportAnswer struct {
	Date     string `json:"date"`
	Sitting  string `json:"sitting"` // morning | evening
	Theme    string `json:"theme"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Depth    int    `json:"depth,omitempty"`
	Verdict  string `json:"verdict,omitempty"` // me | partly | not_me
	Private  bool   `json:"private,omitempty"`
}

type ExportStep struct {
	Started  string `json:"started"`
	Question string `json:"question"`
	Step     string `json:"step"`
	Status   string `json:"status"`
}

type ExportPlanCheck struct {
	Date   string `json:"date"`
	Status string `json:"status"`
}

type ExportWeek struct {
	Week    string      `json:"week"` // its Monday
	Summary WeekSummary `json:"summary"`
}

// ExportVote is one raw vote or rating, kept until it is counted and
// retention passes; the counted totals are anonymous and stay.
type ExportVote struct {
	Hour     string `json:"hour"` // accepted, to the hour, UTC
	Kind     string `json:"kind"` // answer | rating
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

const (
	privateQuestionText = "A private question"
	privateAnswerText   = "A private answer"
	unknownQuestionText = "A question no longer in the bank"
	exportAbout         = "Everything the Persona Index server holds for this phone, as of the date above. " +
		"Your notebook, plans and own words are not here: they stay on your phone, and in your backup only if you turned it on."
)

var verdictWords = map[string]string{verdictMe: "That's me", verdictPartly: "Partly", verdictNotMe: "Not me"}

// ExportDevice is GET /api/device/export.
func (s *Server) ExportDevice(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	deviceID, ok := s.deviceFromHeader(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	e, err := s.buildExport(r, deviceID)
	if err != nil {
		log.Printf("export: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="persona-index-server-data.json"`)
	writeJSON(w, http.StatusOK, e)
}

func (s *Server) buildExport(r *http.Request, deviceID string) (DeviceExport, error) {
	ctx := r.Context()
	key := s.devices.mirrorKey(deviceID)
	e := DeviceExport{Made: s.clock().UTC().Format(dateLayout), About: exportAbout, KeptFor: s.retention(),
		Answers: []ExportAnswer{}, Steps: []ExportStep{}, PlanChecks: []ExportPlanCheck{}, Weeks: []ExportWeek{}, Votes: []ExportVote{}}

	answers, steps, err := s.mirror.DeviceHistory(ctx, key, "0001-01-01", "9999-12-31")
	if err != nil {
		return e, err
	}
	prompts := map[string]string{}
	for _, a := range s.resolve(answers) {
		x := ExportAnswer{Date: a.Date, Sitting: "morning", Theme: a.Theme, Verdict: a.Verdict, Depth: a.Depth}
		if a.Evening {
			x.Sitting = "evening"
		}
		switch {
		case a.Private():
			x.Question, x.Answer, x.Private = privateQuestionText, privateAnswerText, true
		case a.found:
			x.Question = a.q.Prompt
			if o := optionOf(a.q, a.OptionID); o != nil {
				x.Answer = o.Label
			}
			prompts[a.QuestionID] = a.q.Prompt
		default:
			x.Question, x.Answer = unknownQuestionText, a.OptionID
		}
		e.Answers = append(e.Answers, x)
	}
	byQuestion := map[string]MirrorAnswer{}
	for _, a := range answers {
		byQuestion[a.QuestionID] = a
	}
	for _, st := range steps {
		x := ExportStep{Started: st.Started, Status: st.Status, Question: cmp.Or(prompts[st.QuestionID], unknownQuestionText)}
		if a, ok := byQuestion[st.QuestionID]; ok {
			x.Step = s.stepText(a)
		}
		e.Steps = append(e.Steps, x)
	}

	checks, err := s.mirror.PlanChecks(ctx, key, "0001-01-01", "9999-12-31")
	if err != nil {
		return e, err
	}
	for _, c := range checks {
		e.PlanChecks = append(e.PlanChecks, ExportPlanCheck{Date: c.Date, Status: c.Status})
	}

	weeks, err := s.mirror.WeekSummaries(ctx, key, "0001-01-01", "9999-12-31")
	if err != nil {
		return e, err
	}
	for _, w := range weeks {
		e.Weeks = append(e.Weeks, ExportWeek{Week: w.Monday, Summary: w})
	}

	votes, err := s.mirror.DeviceVotes(ctx, s.deviceVoteHashes(deviceID))
	if err != nil {
		return e, err
	}
	for _, v := range votes {
		e.Votes = append(e.Votes, s.exportVote(v))
	}
	slices.SortStableFunc(e.Votes, func(x, y ExportVote) int { return strings.Compare(x.Hour, y.Hour) })
	return e, nil
}

// exportVote writes out one raw vote or rating.
func (s *Server) exportVote(v VoteEvent) ExportVote {
	x := ExportVote{Hour: v.AcceptedAt.UTC().Truncate(time.Hour).Format("2006-01-02T15:00Z"), Kind: "answer"}
	id, option := v.QuestionID, v.OptionID
	verdict := ""
	if rated, ok := strings.CutPrefix(id, "rating/"); ok {
		x.Kind, id = "rating", rated
		if i := strings.LastIndexByte(option, '/'); i >= 0 {
			option, verdict = option[:i], option[i+1:]
		}
	}
	q, found := Question{}, false
	if len(id) > len(dateLayout) {
		q, found = s.question(id[:len(dateLayout)], id)
	}
	switch {
	case option == privateOption:
		x.Question, x.Answer = privateQuestionText, privateAnswerText
		if found {
			x.Question = q.Prompt
		}
	case found:
		x.Question, x.Answer = q.Prompt, option
		if o := optionOf(q, option); o != nil {
			x.Answer = o.Label
		}
	default:
		x.Question, x.Answer = unknownQuestionText, option
	}
	if x.Kind == "rating" {
		w := verdictWords[verdict]
		if verdict == "not" {
			w = verdictWords[verdictNotMe]
		}
		x.Answer = x.Answer + ": " + cmp.Or(w, verdict)
	}
	return x
}
