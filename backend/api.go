package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

// API contracts. The acceptance tests in api_test.go pin these shapes.

type Option struct {
	ID      string   `json:"id"`
	Label   string   `json:"label"`
	Insight *Insight `json:"insight,omitempty"` // the card shown after this option is chosen
}

type Question struct {
	ID      string   `json:"id"`
	Theme   string   `json:"theme,omitempty"`
	Prompt  string   `json:"prompt"`
	Options []Option `json:"options"`
}

// DailySet is the response of GET /api/questions/today.
type DailySet struct {
	Date      string     `json:"date"` // YYYY-MM-DD, UTC for now
	Questions []Question `json:"questions"`
}

// VoteRequest is the body of POST /api/votes. The Idempotency-Key header is required.
//
// VoterID is the device token issued by POST /api/device (devicetoken.go).
// The duplicate-vote rule built on it lives in voterule.go.
type VoteRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	VoterID    string `json:"voterId"`
}

// VoteAccepted is the 202 body, returned only once the vote is durably accepted.
type VoteAccepted struct {
	Status  string `json:"status"` // "accepted"
	EventID string `json:"eventId"`
}

type OptionResult struct {
	OptionID string  `json:"optionId"`
	Count    int     `json:"count"`
	Percent  float64 `json:"percent"`
}

// QuestionResults is the response of GET /api/questions/{questionId}/results.
type QuestionResults struct {
	QuestionID string         `json:"questionId"`
	TotalVotes int            `json:"totalVotes"`
	Options    []OptionResult `json:"options"`
}

// APIError codes: no_questions_today, invalid_request, missing_idempotency_key, unknown_question,
// unknown_option, duplicate_vote, idempotency_key_reused, invalid_device, rate_limited, unavailable.
type APIError struct {
	Error string `json:"error"`
}

// QuestionBank is the source of editorial question sets, keyed by YYYY-MM-DD.
type QuestionBank interface {
	GetSet(date string) (DailySet, bool)
}

type emptyBank struct{}

func (emptyBank) GetSet(string) (DailySet, bool) { return DailySet{}, false }

// Server holds the API's dependencies. Handlers are stateless over HTTP; vote
// state lives behind the server so tests can use an in-memory store.
type Server struct {
	clock   func() time.Time
	bank    QuestionBank
	votes   VoteStore
	devices *deviceSigner

	resultCache resultCache
	voteLimit   *windowLimiter // per device
	deviceLimit *windowLimiter // per network address
	trustCF     bool           // read the client address from CF-Connecting-IP
}

func NewServer(clock func() time.Time, bank QuestionBank, votes VoteStore, devices *deviceSigner) *Server {
	return &Server{
		clock:       clock,
		bank:        bank,
		votes:       votes,
		devices:     devices,
		voteLimit:   newWindowLimiter(votesPerDevicePerMinute, time.Minute),
		deviceLimit: newWindowLimiter(devicesPerAddressPerHour, time.Hour),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", HealthCheckHandler)
	mux.HandleFunc("GET /api/questions/today", s.TodayQuestions)
	mux.HandleFunc("POST /api/device", s.IssueDevice)
	mux.HandleFunc("POST /api/votes", s.CastVote)
	mux.HandleFunc("GET /api/questions/{questionId}/results", s.Results)
	return mux
}

// todayDate is the current question day. Days roll over at midnight UTC: one
// global edition, the same moment everywhere.
func (s *Server) todayDate() string {
	return s.clock().UTC().Format("2006-01-02")
}

// Rollover. A phone that loaded the set just before midnight, or an edge copy
// a few seconds old, still holds yesterday's questions. Votes on those are
// accepted for rolloverGrace after midnight, and the cache lifetimes of
// today's set are capped at midnight and are always shorter than the grace.
const (
	rolloverGrace   = 10 * time.Minute
	todayEdgeTTL    = 5 * time.Minute
	todayBrowserTTL = time.Minute
)

// questionWindow says which days' questions a lookup may match.
type questionWindow int

const (
	voteWindow    questionWindow = iota // today, plus yesterday during the grace
	resultsWindow                       // today and yesterday ("yesterday's verdict")
)

func (s *Server) TodayQuestions(w http.ResponseWriter, r *http.Request) {
	set, ok := s.bank.GetSet(s.todayDate())
	if !ok {
		// Short shared cache so a set published later in the day shows up quickly.
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=30")
		writeError(w, http.StatusNotFound, "no_questions_today")
		return
	}
	// The set only changes at midnight, so the edge holds it until then and no longer.
	left := s.untilRollover()
	edge, browser := min(todayEdgeTTL, left), min(todayBrowserTTL, left)
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d", int(browser.Seconds()), int(edge.Seconds())))
	writeJSON(w, http.StatusOK, set)
}

func (s *Server) untilRollover() time.Duration {
	now := s.clock().UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	return midnight.Sub(now)
}

// findQuestion looks a question up in the sets the window allows.
func (s *Server) findQuestion(id string, window questionWindow) (Question, bool) {
	now := s.clock().UTC()
	days := []time.Time{now}
	sinceMidnight := now.Sub(now.Truncate(24 * time.Hour))
	if window == resultsWindow || sinceMidnight < rolloverGrace {
		days = append(days, now.AddDate(0, 0, -1))
	}
	for _, day := range days {
		set, ok := s.bank.GetSet(day.Format("2006-01-02"))
		if !ok {
			continue
		}
		for _, q := range set.Questions {
			if q.ID == id {
				return q, true
			}
		}
	}
	return Question{}, false
}

// IssueDevice mints a device token. It is the only way to get a vote-capable
// identity, so it carries the per-address limit.
func (s *Server) IssueDevice(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if ok, retry := s.deviceLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	writeJSON(w, http.StatusCreated, DeviceIssued{Token: s.devices.Issue()})
}

func rateLimited(w http.ResponseWriter, retry time.Duration) {
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()+0.5))))
	writeError(w, http.StatusTooManyRequests, "rate_limited")
}

const maxVoteBodyBytes = 4 << 10

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func (s *Server) CastVote(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	key := r.Header.Get("Idempotency-Key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "missing_idempotency_key")
		return
	}
	if !tokenPattern.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}

	var v VoteRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxVoteBodyBytes))
	if err := dec.Decode(&v); err != nil || v.QuestionID == "" || v.OptionID == "" || v.VoterID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	deviceID, ok := s.devices.Verify(v.VoterID)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}

	q, ok := s.findQuestion(v.QuestionID, voteWindow)
	if !ok {
		writeError(w, http.StatusNotFound, "unknown_question")
		return
	}
	if !hasOption(q, v.OptionID) {
		writeError(w, http.StatusBadRequest, "unknown_option")
		return
	}

	ballot := Vote{QuestionID: v.QuestionID, OptionID: v.OptionID, VoterHash: s.devices.voterHash(deviceID)}
	e, err := s.votes.Accept(r.Context(), key, ballot, s.clock())
	switch {
	case errors.Is(err, ErrDuplicateVote):
		writeError(w, http.StatusConflict, "duplicate_vote")
	case errors.Is(err, ErrIdempotencyKeyReuse):
		writeError(w, http.StatusUnprocessableEntity, "idempotency_key_reused")
	case err != nil:
		log.Printf("accept vote: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusAccepted, VoteAccepted{Status: "accepted", EventID: e.ID})
	}
}

func hasOption(q Question, optionID string) bool {
	for _, o := range q.Options {
		if o.ID == optionID {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, APIError{Error: code})
}
