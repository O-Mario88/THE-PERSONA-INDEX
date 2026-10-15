package main

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCastVoteRules(t *testing.T) {
	t.Run("reusing an Idempotency-Key for a different answer is rejected with 422", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "key-1"), http.StatusAccepted)
		other := vote
		other.OptionID = "when-full"
		expectError(t, postVote(t, s, other, "key-1"), http.StatusUnprocessableEntity, "idempotency_key_reused")
	})

	t.Run("idempotency keys are scoped per device and question, so the same key on another question is its own vote", func(t *testing.T) {
		// The server deliberately keeps no device-wide key (see voterHash).
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "key-1"), http.StatusAccepted)
		other := VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: vote.VoterID}
		expectStatus(t, postVote(t, s, other, "key-1"), http.StatusAccepted)
		if n := totalVotes(t, s, "q-bill"); n != 1 {
			t.Fatalf("expected 1 vote on q-bill, got %d", n)
		}
	})

	t.Run("idempotency keys are scoped to the voter", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "key-1"), http.StatusAccepted)
		b := vote
		b.VoterID = "voter-b"
		w := postVote(t, s, b, "key-1")
		expectStatus(t, w, http.StatusAccepted)
		if decode[VoteAccepted](t, w).EventID == "" {
			t.Fatal("expected a new event for a different voter")
		}
	})

	t.Run("errors are never cached", func(t *testing.T) {
		w := postVote(t, newTestServer(), vote, "")
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("expected Cache-Control no-store, got %q", cc)
		}
	})

	t.Run("rejects voter ids that are not server-issued device tokens, and badly shaped keys", func(t *testing.T) {
		s := newTestServer()
		bad := vote
		bad.VoterID = "has spaces"
		expectError(t, postRaw(t, s, bad, "key-1"), http.StatusUnauthorized, "invalid_device")
		bad.VoterID = strings.Repeat("a", 129)
		expectError(t, postRaw(t, s, bad, "key-2"), http.StatusUnauthorized, "invalid_device")
		expectError(t, postVote(t, s, vote, "bad key!"), http.StatusBadRequest, "invalid_request")
	})

	t.Run("rejects oversized bodies", func(t *testing.T) {
		big := fmt.Sprintf(`{"questionId":"q-dishes","optionId":"right-away","voterId":"a","pad":"%s"}`, strings.Repeat("x", 8<<10))
		expectError(t, postVote(t, newTestServer(), big, "key-1"), http.StatusBadRequest, "invalid_request")
	})

	t.Run("questions from other days do not accept votes", func(t *testing.T) {
		s := newTestServer()
		// Two days on, Oct 12 is over in every time zone.
		s.clock = func() time.Time { return fixedNow.AddDate(0, 0, 2) }
		expectError(t, postVote(t, s, vote, "key-1"), http.StatusNotFound, "unknown_question")
	})

	t.Run("concurrent votes from one voter on one question count once", func(t *testing.T) {
		s := newTestServer()
		var wg sync.WaitGroup
		codes := make(chan int, 20)
		for i := range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				codes <- postVote(t, s, vote, fmt.Sprintf("key-%d", i)).Code
			}()
		}
		wg.Wait()
		close(codes)
		accepted := 0
		for c := range codes {
			if c == http.StatusAccepted {
				accepted++
			} else if c != http.StatusConflict {
				t.Fatalf("unexpected status %d", c)
			}
		}
		if accepted != 1 {
			t.Fatalf("expected exactly 1 accepted vote, got %d", accepted)
		}
	})
}
