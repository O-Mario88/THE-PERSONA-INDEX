package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// API contracts. The acceptance tests in api_test.go pin these shapes.

type Option struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type Question struct {
	ID      string   `json:"id"`
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
// VoterID is a PLACEHOLDER identity. The duplicate-vote rule is not decided yet
// (browser/day, account, or privacy-preserving token). Until it is, the tests
// assume one vote per question per VoterID.
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
// unknown_option, duplicate_vote.
type APIError struct {
	Error string `json:"error"`
}

// QuestionBank is the source of editorial question sets, keyed by YYYY-MM-DD.
type QuestionBank interface {
	GetSet(date string) (DailySet, bool)
}

type emptyBank struct{}

func (emptyBank) GetSet(string) (DailySet, bool) { return DailySet{}, false }

var ErrNotImplemented = errors.New("not implemented")

// Server holds the API's dependencies. Handlers are stateless over HTTP; vote
// state lives behind the server so tests can use an in-memory store.
type Server struct {
	clock func() time.Time
	bank  QuestionBank
}

func NewServer(clock func() time.Time, bank QuestionBank) *Server {
	return &Server{clock: clock, bank: bank}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", HealthCheckHandler)
	mux.HandleFunc("GET /api/questions/today", s.TodayQuestions)
	mux.HandleFunc("POST /api/votes", s.CastVote)
	mux.HandleFunc("GET /api/questions/{questionId}/results", s.Results)
	return mux
}

// todayDate is the current question day. Days roll over at midnight UTC for now.
func (s *Server) todayDate() string {
	return s.clock().UTC().Format("2006-01-02")
}

func (s *Server) TodayQuestions(w http.ResponseWriter, r *http.Request) {
	set, ok := s.bank.GetSet(s.todayDate())
	if !ok {
		// Short shared cache so a set published later in the day shows up quickly.
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=30")
		writeError(w, http.StatusNotFound, "no_questions_today")
		return
	}
	// The set only changes at the day boundary, so the edge can hold it for a while.
	w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=300")
	writeJSON(w, http.StatusOK, set)
}

func (s *Server) CastVote(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

func (s *Server) Results(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
}

// RunAggregation is the worker step: fold accepted vote events into the
// published result snapshots.
func (s *Server) RunAggregation() error {
	return ErrNotImplemented
}

func notImplemented(w http.ResponseWriter) {
	writeError(w, http.StatusNotImplemented, "not_implemented")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, APIError{Error: code})
}
