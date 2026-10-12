package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const today = "2026-10-12"

var fixedNow = time.Date(2026, 10, 12, 10, 0, 0, 0, time.UTC)

var todaySet = DailySet{
	Date: today,
	Questions: []Question{
		{ID: "q-dishes", Prompt: "When do you wash the dishes?", Options: []Option{
			{ID: "right-away", Label: "Right after eating"},
			{ID: "end-of-day", Label: "At the end of the day"},
			{ID: "when-full", Label: "When the sink is full"},
		}},
		{ID: "q-bill", Prompt: "Dinner with friends: how do you split the bill?", Options: []Option{
			{ID: "even", Label: "Split it evenly"},
			{ID: "itemised", Label: "Everyone pays for what they ordered"},
		}},
		{ID: "q-alarm", Prompt: "How many alarms do you set in the morning?", Options: []Option{
			{ID: "one", Label: "One"},
			{ID: "two-three", Label: "Two or three"},
			{ID: "four-plus", Label: "Four or more"},
		}},
	},
}

type fixtureBank struct{}

func (fixtureBank) GetSet(date string) (DailySet, bool) {
	if date == today {
		return todaySet, true
	}
	return DailySet{}, false
}

// newTestServer gives each test a fresh server: fixed clock, fixture
// questions, in-memory state. No live database.
func newTestServer() *Server {
	return NewServer(func() time.Time { return fixedNow }, fixtureBank{})
}

func do(t *testing.T, s *Server, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)
	return w
}

func get(t *testing.T, s *Server, path string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, s, httptest.NewRequest(http.MethodGet, path, nil))
}

// postVote sends body (a VoteRequest, any value, or a raw string) with an
// optional Idempotency-Key.
func postVote(t *testing.T, s *Server, body any, idempotencyKey string) *httptest.ResponseRecorder {
	t.Helper()
	var raw []byte
	if str, ok := body.(string); ok {
		raw = []byte(str)
	} else {
		var err error
		if raw, err = json.Marshal(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/api/votes", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	return do(t, s, req)
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("response is not valid JSON (%v): %s", err, w.Body.String())
	}
	return v
}

func expectStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("expected status %d, got %d: %s", want, w.Code, w.Body.String())
	}
}

func expectError(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	expectStatus(t, w, status)
	if got := decode[APIError](t, w).Error; got != code {
		t.Fatalf("expected error %q, got %q", code, got)
	}
}

func expectPublicCache(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	cc := w.Header().Get("Cache-Control")
	if !strings.Contains(cc, "public") || !strings.Contains(cc, "s-maxage=") {
		t.Fatalf("expected public edge-cacheable Cache-Control with s-maxage, got %q", cc)
	}
}

func aggregate(t *testing.T, s *Server) {
	t.Helper()
	if err := s.RunAggregation(); err != nil {
		t.Fatalf("aggregation failed: %v", err)
	}
}

func totalVotes(t *testing.T, s *Server, questionID string) int {
	t.Helper()
	aggregate(t, s)
	w := get(t, s, "/api/questions/"+questionID+"/results")
	expectStatus(t, w, http.StatusOK)
	return decode[QuestionResults](t, w).TotalVotes
}
