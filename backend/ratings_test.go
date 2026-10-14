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

// Acceptance tests for the "I learned something" tap on insight cards. Ratings
// are anonymous counts per card, like votes, and feed which cards get rewritten
// or retired.

func postRating(t *testing.T, s *Server, r RatingRequest, key string) *httptest.ResponseRecorder {
	t.Helper()
	r.VoterID = tokenFor(s, r.VoterID)
	raw, _ := json.Marshal(r)
	req := httptest.NewRequest(http.MethodPost, "/api/ratings", bytes.NewReader(raw))
	req.Header.Set("Idempotency-Key", key)
	return do(t, s, req)
}

func TestCardRatings(t *testing.T) {
	learned := RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", Learned: true, VoterID: "a"}

	t.Run("accepts one rating per card and counts it", func(t *testing.T) {
		s := newTestServer()
		w := postRating(t, s, learned, "r1")
		expectStatus(t, w, http.StatusAccepted)
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("expected no-store, got %q", cc)
		}
		other := learned
		other.VoterID = "b"
		other.Learned = false
		expectStatus(t, postRating(t, s, other, "r1"), http.StatusAccepted)
		aggregate(t, s)
		got, err := s.votes.Counts(context.Background(), ratingKey("q-dishes", "right-away"))
		if err != nil || got["learned"] != 1 || got["not"] != 1 {
			t.Fatalf("expected 1 learned and 1 not, got %v (%v)", got, err)
		}
	})

	t.Run("a second rating from one device on one question is a 409", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postRating(t, s, learned, "r1"), http.StatusAccepted)
		again := learned
		again.Learned = false
		expectError(t, postRating(t, s, again, "r2"), http.StatusConflict, "duplicate_vote")
	})

	t.Run("a rating does not use up the device's vote", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postRating(t, s, learned, "r1"), http.StatusAccepted)
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "a"}, "v1"), http.StatusAccepted)
	})

	t.Run("rejects unknown questions and options, and forged devices", func(t *testing.T) {
		s := newTestServer()
		bad := learned
		bad.QuestionID = "q-nope"
		expectError(t, postRating(t, s, bad, "r1"), http.StatusNotFound, "unknown_question")
		bad = learned
		bad.OptionID = "even"
		expectError(t, postRating(t, s, bad, "r2"), http.StatusBadRequest, "unknown_option")

		raw, _ := json.Marshal(RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: "made-up"})
		req := httptest.NewRequest(http.MethodPost, "/api/ratings", bytes.NewReader(raw))
		req.Header.Set("Idempotency-Key", "r3")
		expectError(t, do(t, s, req), http.StatusUnauthorized, "invalid_device")
	})

	t.Run("rating keys never collide with question ids", func(t *testing.T) {
		if k := ratingKey("q-dishes", "right-away"); !strings.HasPrefix(k, "rating/") {
			t.Fatalf("unexpected rating key %q", k)
		}
	})
}
