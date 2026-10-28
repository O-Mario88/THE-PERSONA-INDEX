package main

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"log"
	"maps"
	"net/http"
	"slices"
)

// What Helped (Insights Release 2, 2026-10-26). After someone saves
// "Something you could try", they may say how it went, if they want to:
// tried and it helped a lot, helped a little, no change, or didn't try.
//
//   - The reports are their own dataset, apart from votes and the mirror:
//     one row per phone per step, under helpedKey, a keyed hash the vote and
//     mirror tables never use, so a report cannot be joined to either.
//     Sending again changes the phone's report; it never adds one.
//   - Only a step from an answer the phone gave, never from a private one.
//   - A report keeps the Monday of its week, never the day or the moment.
//   - "Delete everything" (and deleting the account) takes the phone's
//     reports, and its old pass adds no more.
//   - GET /api/what-helped is the same for everyone and carries no pass.
//     Counts only, never percentages: a step shows once whatHelpedMin
//     reports stand after folding, and an outcome fewer than whatHelpedFew
//     gave is folded, with no number, and left out of the total, so it
//     cannot be worked out by subtraction.
//
// The people who report back chose to, so the totals lean towards those who
// stuck with a step. The app says so wherever it shows them.

const (
	whatHelpedMin = 50
	whatHelpedFew = 10
)

// Outcomes, in the order they are shown.
const (
	helpedLot      = "helped_lot"
	helpedLittle   = "helped_little"
	helpedNoChange = "no_change"
	helpedNotTried = "not_tried"
)

var helpedOutcomes = []string{helpedLot, helpedLittle, helpedNoChange, helpedNotTried}

// HelpedRequest is the body of POST /api/what-helped.
type HelpedRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	Outcome    string `json:"outcome"`
	Date       string `json:"date"` // the phone's date
	VoterID    string `json:"voterId"`
}

// HelpedReport is one phone's report on one step, as it is kept.
type HelpedReport struct {
	ReporterKey string // helpedKey
	QuestionID  string
	OptionID    string
	Outcome     string
	Week        string // the Monday of the report's week, YYYY-MM-DD
}

// HelpedStepKey names a step: the answer whose card offered it.
type HelpedStepKey struct {
	QuestionID string
	OptionID   string
}

// WhatHelped is the response of GET /api/what-helped.
type WhatHelped struct {
	Min   int              `json:"min"`
	Few   int              `json:"few"`
	Steps []WhatHelpedStep `json:"steps"`
}

type WhatHelpedStep struct {
	QuestionID string        `json:"questionId"`
	OptionID   string        `json:"optionId"`
	Total      int           `json:"total"` // the reports counted, the folded few left out
	Outcomes   []HelpedCount `json:"outcomes"`
}

type HelpedCount struct {
	Outcome string `json:"outcome"`
	Count   int    `json:"count"`
	Few     bool   `json:"few,omitempty"` // fewer than whatHelpedFew: no number is given
}

// HelpedStore keeps the reports. The memory and Postgres stores implement it.
type HelpedStore interface {
	// SaveHelped keeps a phone's report on a step, replacing its earlier one.
	// lockKey is the phone's mirror key: the write waits on the phone's lock,
	// and a phone that deleted everything gets ErrDeviceForgotten.
	SaveHelped(ctx context.Context, lockKey string, r HelpedReport) error
	// HelpedTallies counts the reports: step -> outcome -> count.
	HelpedTallies(ctx context.Context) (map[HelpedStepKey]map[string]int, error)
	// ForgetHelped deletes one phone's reports and says how many went.
	ForgetHelped(ctx context.Context, reporterKey string) (int, error)
	// HelpedReports returns one phone's reports, for "What I keep" and its
	// export, by question.
	HelpedReports(ctx context.Context, reporterKey string) ([]HelpedReport, error)
}

// SaveHelped is POST /api/what-helped.
func (s *Server) SaveHelped(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var req HelpedRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxVoteBodyBytes)).Decode(&req); err != nil ||
		req.QuestionID == "" || req.OptionID == "" || req.VoterID == "" {
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
	if !slices.Contains(helpedOutcomes, req.Outcome) || !s.isOpenDate(req.Date) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	lockKey := s.devices.mirrorKey(deviceID)
	known, err := s.answeredStep(r.Context(), lockKey, req.QuestionID, req.OptionID)
	if err != nil {
		log.Printf("what helped: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if !known {
		writeError(w, http.StatusNotFound, "unknown_answer")
		return
	}
	report := HelpedReport{ReporterKey: s.devices.helpedKey(deviceID), QuestionID: req.QuestionID, OptionID: req.OptionID,
		Outcome: req.Outcome, Week: mondayOf(req.Date)}
	if err := s.helped.SaveHelped(r.Context(), lockKey, report); errors.Is(err, ErrDeviceForgotten) {
		writeError(w, http.StatusGone, "device_forgotten")
		return
	} else if err != nil {
		log.Printf("what helped: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// answeredStep says whether the phone gave this answer, not privately, and
// its card offered a step.
func (s *Server) answeredStep(ctx context.Context, mirrorKey, questionID, optionID string) (bool, error) {
	answers, _, err := s.mirror.DeviceHistory(ctx, mirrorKey, "0001-01-01", "9999-12-31")
	if err != nil {
		return false, err
	}
	return slices.ContainsFunc(answers, func(a MirrorAnswer) bool {
		return a.QuestionID == questionID && a.OptionID == optionID && !a.Private() && s.stepFor(a, false) != ""
	}), nil
}

// GetWhatHelped is GET /api/what-helped.
func (s *Server) GetWhatHelped(w http.ResponseWriter, r *http.Request) {
	tallies, err := s.helped.HelpedTallies(r.Context())
	if err != nil {
		log.Printf("what helped: %v", err)
		w.Header().Set("Cache-Control", "no-store")
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=0, s-maxage=300")
	writeJSON(w, http.StatusOK, whatHelpedFrom(tallies))
}

// whatHelpedFrom folds the tallies and keeps the steps with enough counted.
func whatHelpedFrom(tallies map[HelpedStepKey]map[string]int) WhatHelped {
	out := WhatHelped{Min: whatHelpedMin, Few: whatHelpedFew, Steps: []WhatHelpedStep{}}
	for key, counts := range tallies {
		st := WhatHelpedStep{QuestionID: key.QuestionID, OptionID: key.OptionID, Outcomes: make([]HelpedCount, 0, len(helpedOutcomes))}
		for _, o := range helpedOutcomes {
			n := counts[o]
			if n > 0 && n < whatHelpedFew {
				st.Outcomes = append(st.Outcomes, HelpedCount{Outcome: o, Few: true})
				continue
			}
			st.Outcomes = append(st.Outcomes, HelpedCount{Outcome: o, Count: n})
			st.Total += n
		}
		if st.Total >= whatHelpedMin {
			out.Steps = append(out.Steps, st)
		}
	}
	slices.SortFunc(out.Steps, func(a, b WhatHelpedStep) int {
		return cmp.Or(cmp.Compare(a.QuestionID, b.QuestionID), cmp.Compare(a.OptionID, b.OptionID))
	})
	return out
}

// forgetDevice deletes everything one device id kept: its mirror, its votes
// and its What Helped reports.
func (s *Server) forgetDevice(ctx context.Context, deviceID, today string) (Forgotten, error) {
	f, err := s.mirror.ForgetDevice(ctx, s.devices.mirrorKey(deviceID), s.deviceVoteHashes(deviceID), today)
	if err != nil {
		return Forgotten{}, err
	}
	f.Reports, err = s.helped.ForgetHelped(ctx, s.devices.helpedKey(deviceID))
	return f, err
}

// The in-memory store's side, under the memory store's lock.

func (m *memoryStore) SaveHelped(_ context.Context, lockKey string, r HelpedReport) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.mirror.forgotten[lockKey] != "" {
		return ErrDeviceForgotten
	}
	byStep := m.helped[r.ReporterKey]
	if byStep == nil {
		byStep = map[HelpedStepKey]HelpedReport{}
		m.helped[r.ReporterKey] = byStep
	}
	byStep[HelpedStepKey{r.QuestionID, r.OptionID}] = r
	return nil
}

func (m *memoryStore) HelpedTallies(_ context.Context) (map[HelpedStepKey]map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[HelpedStepKey]map[string]int{}
	for _, byStep := range m.helped {
		for key, r := range byStep {
			if out[key] == nil {
				out[key] = map[string]int{}
			}
			out[key][r.Outcome]++
		}
	}
	return out, nil
}

func (m *memoryStore) HelpedReports(_ context.Context, reporterKey string) ([]HelpedReport, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := slices.Collect(maps.Values(m.helped[reporterKey]))
	slices.SortFunc(out, func(a, b HelpedReport) int {
		return cmp.Or(cmp.Compare(a.QuestionID, b.QuestionID), cmp.Compare(a.OptionID, b.OptionID))
	})
	return out, nil
}

func (m *memoryStore) ForgetHelped(_ context.Context, reporterKey string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := len(m.helped[reporterKey])
	delete(m.helped, reporterKey)
	return n, nil
}
