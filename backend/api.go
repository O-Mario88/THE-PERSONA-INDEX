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

// APIError codes: invalid_request, missing_idempotency_key, unknown_question,
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

func (s *Server) TodayQuestions(w http.ResponseWriter, r *http.Request) {
	notImplemented(w)
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(APIError{Error: "not_implemented"})
}
