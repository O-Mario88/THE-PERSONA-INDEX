package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Acceptance tests for the tap under insight cards: "That's me", "Partly" or
// "Not me". Ratings are anonymous counts per card, like votes, and feed which
// cards get rewritten or retired.

func postRating(t *testing.T, s *Server, r RatingRequest, key string) *httptest.ResponseRecorder {
	t.Helper()
	r.VoterID = tokenFor(s, r.VoterID)
	raw, _ := json.Marshal(r)
	req := httptest.NewRequest(http.MethodPost, "/api/ratings", bytes.NewReader(raw))
	req.Header.Set("Idempotency-Key", key)
	return do(t, s, req)
}

func TestCardRatings(t *testing.T) {
	me := RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", Verdict: verdictMe, VoterID: "a"}

	t.Run("accepts one rating per card and counts each verdict", func(t *testing.T) {
		s := newTestServer()
		w := postRating(t, s, me, "r1")
		expectStatus(t, w, http.StatusAccepted)
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("expected no-store, got %q", cc)
		}
		for i, verdict := range []string{verdictPartly, verdictNotMe, verdictNotMe} {
			other := me
			other.VoterID = string(rune('b' + i))
			other.Verdict = verdict
			expectStatus(t, postRating(t, s, other, "r1"), http.StatusAccepted)
		}
		aggregate(t, s)
		got, err := s.votes.Counts(context.Background(), ratingKey("q-dishes"))
		want := map[string]int{"right-away/me": 1, "right-away/partly": 1, "right-away/not": 2}
		if err != nil || len(got) != len(want) {
			t.Fatalf("expected %v, got %v (%v)", want, got, err)
		}
		for k, n := range want {
			if got[k] != n {
				t.Fatalf("expected %v, got %v", want, got)
			}
		}
	})

	t.Run("an app from before verdicts still rates with learned", func(t *testing.T) {
		s := newTestServer()
		yes, no := true, false
		for i, learned := range []*bool{&yes, &no} {
			old := RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", Learned: learned, VoterID: string(rune('a' + i))}
			expectStatus(t, postRating(t, s, old, "r1"), http.StatusAccepted)
		}
		aggregate(t, s)
		got, err := s.votes.Counts(context.Background(), ratingKey("q-dishes"))
		if err != nil || got["right-away/me"] != 1 || got["right-away/not"] != 1 {
			t.Fatalf("expected learned read as me and not as not_me, got %v (%v)", got, err)
		}
	})

	t.Run("a verdict wins over the old learned field", func(t *testing.T) {
		s := newTestServer()
		yes := true
		both := RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", Verdict: verdictPartly, Learned: &yes, VoterID: "a"}
		expectStatus(t, postRating(t, s, both, "r1"), http.StatusAccepted)
		aggregate(t, s)
		if got, _ := s.votes.Counts(context.Background(), ratingKey("q-dishes")); got["right-away/partly"] != 1 {
			t.Fatalf("expected the verdict counted, got %v", got)
		}
	})

	t.Run("refuses a missing or unknown verdict, and keeps nothing", func(t *testing.T) {
		s := newTestServer()
		for i, bad := range []RatingRequest{
			{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "a"},
			{QuestionID: "q-dishes", OptionID: "right-away", Verdict: "learned", VoterID: "a"},
			{QuestionID: "q-dishes", OptionID: "right-away", Verdict: "ME", VoterID: "a"},
		} {
			expectError(t, postRating(t, s, bad, "r"+string(rune('1'+i))), http.StatusBadRequest, "unknown_verdict")
		}
		// The refused taps used nothing up: the phone can still rate the card.
		expectStatus(t, postRating(t, s, me, "r9"), http.StatusAccepted)
	})

	t.Run("a second rating from one device on one question is a 409", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postRating(t, s, me, "r1"), http.StatusAccepted)
		again := me
		again.Verdict = verdictNotMe
		expectError(t, postRating(t, s, again, "r2"), http.StatusConflict, "duplicate_vote")
	})

	t.Run("a rating does not use up the device's vote", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postRating(t, s, me, "r1"), http.StatusAccepted)
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "a"}, "v1"), http.StatusAccepted)
	})

	t.Run("rejects unknown questions and options, and forged devices", func(t *testing.T) {
		s := newTestServer()
		bad := me
		bad.QuestionID = "q-nope"
		expectError(t, postRating(t, s, bad, "r1"), http.StatusNotFound, "unknown_question")
		bad = me
		bad.OptionID = "even"
		expectError(t, postRating(t, s, bad, "r2"), http.StatusBadRequest, "unknown_option")

		raw, _ := json.Marshal(RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", Verdict: verdictMe, VoterID: "made-up"})
		req := httptest.NewRequest(http.MethodPost, "/api/ratings", bytes.NewReader(raw))
		req.Header.Set("Idempotency-Key", "r3")
		expectError(t, do(t, s, req), http.StatusUnauthorized, "invalid_device")
	})

	t.Run("rating keys never collide with question ids", func(t *testing.T) {
		if k := ratingKey("q-dishes"); !strings.HasPrefix(k, "rating/") {
			t.Fatalf("unexpected rating key %q", k)
		}
	})
}
