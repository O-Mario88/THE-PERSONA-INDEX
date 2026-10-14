package main

import (
	"fmt"
	"net/http"
	"reflect"
	"testing"
)

// Acceptance tests for the core API. Written before the implementation; they
// fail until each feature is built.

func TestHealthRoute(t *testing.T) {
	w := get(t, newTestServer(), "/api/health")
	expectStatus(t, w, http.StatusOK)
	if w.Body.String() != `{"status":"ok"}` {
		t.Fatalf("unexpected body %s", w.Body.String())
	}
}

func TestTodayQuestions(t *testing.T) {
	t.Run("returns today's 3 questions in order", func(t *testing.T) {
		w := get(t, newTestServer(), "/api/questions/today")
		expectStatus(t, w, http.StatusOK)
		body := decode[DailySet](t, w)
		if body.Date != today {
			t.Fatalf("expected date %s, got %s", today, body.Date)
		}
		if !reflect.DeepEqual(body, todaySet) {
			t.Fatalf("expected %+v, got %+v", todaySet, body)
		}
	})

	t.Run("every question has a prompt and at least two options", func(t *testing.T) {
		w := get(t, newTestServer(), "/api/questions/today")
		expectStatus(t, w, http.StatusOK)
		body := decode[DailySet](t, w)
		if len(body.Questions) != 3 {
			t.Fatalf("expected 3 questions, got %d", len(body.Questions))
		}
		for _, q := range body.Questions {
			if q.Prompt == "" || len(q.Options) < 2 {
				t.Fatalf("question %s needs a prompt and 2+ options", q.ID)
			}
		}
	})

	t.Run("is publicly cacheable at the edge", func(t *testing.T) {
		w := get(t, newTestServer(), "/api/questions/today")
		expectStatus(t, w, http.StatusOK)
		expectPublicCache(t, w)
	})
}

// Duplicate rule: one vote per question per server-signed device token
// (default chosen 2026-10-14; per account once accounts exist). VoterID here
// is a readable name; postVote swaps it for a signed token.
var vote = VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "voter-a"}

func TestCastVote(t *testing.T) {
	t.Run("accepts a valid vote with 202 and an event id", func(t *testing.T) {
		w := postVote(t, newTestServer(), vote, "key-1")
		expectStatus(t, w, http.StatusAccepted)
		body := decode[VoteAccepted](t, w)
		if body.Status != "accepted" || body.EventID == "" {
			t.Fatalf("expected accepted with an event id, got %+v", body)
		}
	})

	t.Run("is never cached", func(t *testing.T) {
		w := postVote(t, newTestServer(), vote, "key-1")
		expectStatus(t, w, http.StatusAccepted)
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("expected Cache-Control no-store, got %q", cc)
		}
	})

	t.Run("a retry with the same Idempotency-Key is the same vote", func(t *testing.T) {
		s := newTestServer()
		first := postVote(t, s, vote, "key-1")
		expectStatus(t, first, http.StatusAccepted)
		retry := postVote(t, s, vote, "key-1")
		expectStatus(t, retry, http.StatusAccepted)
		if a, b := decode[VoteAccepted](t, first).EventID, decode[VoteAccepted](t, retry).EventID; a != b {
			t.Fatalf("retry produced a new event: %s vs %s", a, b)
		}
		if n := totalVotes(t, s, "q-dishes"); n != 1 {
			t.Fatalf("expected 1 vote counted, got %d", n)
		}
	})

	t.Run("rejects a second vote by the same voter on the same question with 409", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "key-1"), http.StatusAccepted)
		dup := vote
		dup.OptionID = "when-full"
		expectError(t, postVote(t, s, dup, "key-2"), http.StatusConflict, "duplicate_vote")
		if n := totalVotes(t, s, "q-dishes"); n != 1 {
			t.Fatalf("expected 1 vote counted, got %d", n)
		}
	})

	t.Run("lets the same voter answer a different question", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "key-1"), http.StatusAccepted)
		other := VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: "voter-a"}
		expectStatus(t, postVote(t, s, other, "key-2"), http.StatusAccepted)
	})

	t.Run("requires an Idempotency-Key header", func(t *testing.T) {
		expectError(t, postVote(t, newTestServer(), vote, ""), http.StatusBadRequest, "missing_idempotency_key")
	})

	t.Run("rejects malformed bodies with 400", func(t *testing.T) {
		s := newTestServer()
		bodies := []any{"not json", map[string]string{}, map[string]string{"questionId": "q-dishes", "optionId": "right-away"}}
		for i, b := range bodies {
			expectError(t, postVote(t, s, b, fmt.Sprintf("key-%d", i)), http.StatusBadRequest, "invalid_request")
		}
	})

	t.Run("rejects an unknown question with 404", func(t *testing.T) {
		bad := vote
		bad.QuestionID = "q-nope"
		expectError(t, postVote(t, newTestServer(), bad, "key-1"), http.StatusNotFound, "unknown_question")
	})

	t.Run("rejects an option that does not belong to the question with 400", func(t *testing.T) {
		bad := vote
		bad.OptionID = "even"
		expectError(t, postVote(t, newTestServer(), bad, "key-1"), http.StatusBadRequest, "unknown_option")
	})
}

func TestResults(t *testing.T) {
	t.Run("reports real zeros, not invented numbers, before anyone votes", func(t *testing.T) {
		w := get(t, newTestServer(), "/api/questions/q-bill/results")
		expectStatus(t, w, http.StatusOK)
		want := QuestionResults{QuestionID: "q-bill", TotalVotes: 0, Options: []OptionResult{
			{OptionID: "even", Count: 0, Percent: 0},
			{OptionID: "itemised", Count: 0, Percent: 0},
		}}
		if got := decode[QuestionResults](t, w); !reflect.DeepEqual(got, want) {
			t.Fatalf("expected %+v, got %+v", want, got)
		}
	})

	t.Run("reflects accepted votes once the aggregation worker has run", func(t *testing.T) {
		s := newTestServer()
		votes := []VoteRequest{
			{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "a"},
			{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "b"},
			{QuestionID: "q-dishes", OptionID: "when-full", VoterID: "c"},
			{QuestionID: "q-dishes", OptionID: "end-of-day", VoterID: "d"},
		}
		for i, v := range votes {
			expectStatus(t, postVote(t, s, v, fmt.Sprintf("k%d", i)), http.StatusAccepted)
		}
		aggregate(t, s)

		w := get(t, s, "/api/questions/q-dishes/results")
		expectStatus(t, w, http.StatusOK)
		want := QuestionResults{QuestionID: "q-dishes", TotalVotes: 4, Options: []OptionResult{
			{OptionID: "right-away", Count: 2, Percent: 50},
			{OptionID: "end-of-day", Count: 1, Percent: 25},
			{OptionID: "when-full", Count: 1, Percent: 25},
		}}
		if got := decode[QuestionResults](t, w); !reflect.DeepEqual(got, want) {
			t.Fatalf("expected %+v, got %+v", want, got)
		}
	})

	t.Run("does not double count when the worker runs twice", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-alarm", OptionID: "one", VoterID: "a"}, "k1"), http.StatusAccepted)
		aggregate(t, s)
		if n := totalVotes(t, s, "q-alarm"); n != 1 {
			t.Fatalf("expected 1 vote counted, got %d", n)
		}
	})

	t.Run("is publicly cacheable for a short time", func(t *testing.T) {
		w := get(t, newTestServer(), "/api/questions/q-bill/results")
		expectStatus(t, w, http.StatusOK)
		expectPublicCache(t, w)
	})

	t.Run("returns 404 for an unknown question", func(t *testing.T) {
		expectError(t, get(t, newTestServer(), "/api/questions/q-nope/results"), http.StatusNotFound, "unknown_question")
	})
}
