package main

import (
	"fmt"
	"net/http"
	"sync"
	"testing"
)

func TestResultsAggregation(t *testing.T) {
	t.Run("rounds percentages to one decimal place", func(t *testing.T) {
		s := newTestServer()
		for i, opt := range []string{"one", "two-three", "four-plus"} {
			v := VoteRequest{QuestionID: "q-alarm", OptionID: opt, VoterID: fmt.Sprintf("v%d", i)}
			expectStatus(t, postVote(t, s, v, "k"), http.StatusAccepted)
		}
		aggregate(t, s)
		res := decode[QuestionResults](t, get(t, s, "/api/questions/q-alarm/results"))
		for _, o := range res.Options {
			if o.Count != 1 || o.Percent != 33.3 {
				t.Fatalf("expected 1 vote at 33.3%%, got %+v", o)
			}
		}
	})

	t.Run("results lag until the worker runs, then catch up", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "k"), http.StatusAccepted)
		before := decode[QuestionResults](t, get(t, s, "/api/questions/q-dishes/results"))
		if before.TotalVotes != 0 {
			t.Fatalf("expected the published snapshot to be 0 before aggregation, got %d", before.TotalVotes)
		}
		if n := totalVotes(t, s, "q-dishes"); n != 1 {
			t.Fatalf("expected 1 after aggregation, got %d", n)
		}
	})

	t.Run("folds more events than one batch", func(t *testing.T) {
		s := newTestServer()
		n := aggregationBatch + 7
		for i := range n {
			v := VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: fmt.Sprintf("v%d", i)}
			expectStatus(t, postVote(t, s, v, "k"), http.StatusAccepted)
		}
		if got := totalVotes(t, s, "q-bill"); got != n {
			t.Fatalf("expected %d, got %d", n, got)
		}
	})

	t.Run("concurrent votes and worker runs lose and double count nothing", func(t *testing.T) {
		s := newTestServer()
		const voters = 200
		var wg sync.WaitGroup
		for i := range voters {
			wg.Add(2)
			go func() {
				defer wg.Done()
				v := VoteRequest{QuestionID: "q-dishes", OptionID: "end-of-day", VoterID: fmt.Sprintf("v%d", i)}
				postVote(t, s, v, "k")
			}()
			go func() {
				defer wg.Done()
				s.RunAggregation()
			}()
		}
		wg.Wait()
		if got := totalVotes(t, s, "q-dishes"); got != voters {
			t.Fatalf("expected %d, got %d", voters, got)
		}
	})
}
