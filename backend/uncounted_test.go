package main

import (
	"context"
	"net/http"
	"testing"
)

// Edwin, 2026-10-29: private reflection is ready at once, and adding to the
// shared totals is a clear choice. Until a phone says yes, its answers still
// reach its own mirror but add nothing to the totals (count: false).
func TestUncountedAnswers(t *testing.T) {
	no := false

	t.Run("an answer sent with count false reaches the phone's mirror and adds nothing to the totals", func(t *testing.T) {
		s := newTestServer()
		v := vote
		v.Count = &no
		expectStatus(t, postVote(t, s, v, "key-1"), http.StatusAccepted)
		if n := totalVotes(t, s, "q-dishes"); n != 0 {
			t.Fatalf("expected nothing counted, got %d", n)
		}
		answers, _, err := s.mirror.DeviceHistory(context.Background(), s.devices.mirrorKey(deviceIDFor(s, "voter-a")), "2026-01-01", "2026-12-31")
		if err != nil || len(answers) != 1 || answers[0].OptionID != "right-away" {
			t.Fatalf("expected the answer in the mirror, got %+v (%v)", answers, err)
		}
	})

	t.Run("an older phone that says nothing is counted as before", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "key-1"), http.StatusAccepted)
		if n := totalVotes(t, s, "q-dishes"); n != 1 {
			t.Fatalf("expected 1 counted, got %d", n)
		}
	})

	t.Run("one answer per question still holds when it is not counted", func(t *testing.T) {
		s := newTestServer()
		v := vote
		v.Count = &no
		expectStatus(t, postVote(t, s, v, "key-1"), http.StatusAccepted)
		v.OptionID = "when-full"
		expectError(t, postVote(t, s, v, "key-2"), http.StatusConflict, "duplicate_vote")
	})

	t.Run("a tap under a card sent with count false is not counted either", func(t *testing.T) {
		s := newTestServer()
		r := RatingRequest{QuestionID: "q-dishes", OptionID: "right-away", Verdict: verdictMe, VoterID: "a", Count: &no}
		expectStatus(t, postRating(t, s, r, "r1"), http.StatusAccepted)
		aggregate(t, s)
		got, err := s.votes.Counts(context.Background(), ratingKey("q-dishes"))
		if err != nil || len(got) != 0 {
			t.Fatalf("expected no rating counted, got %v (%v)", got, err)
		}
	})
}
