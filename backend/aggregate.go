package main

import (
	"context"
	"math"
	"net/http"
	"sync"
	"time"
)

const aggregationBatch = 1000

// RunAggregation is the worker step: fold accepted votes into the tallies
// until none are left. Any number of instances can run it at once; the store
// guarantees each vote is counted exactly once.
func (s *Server) RunAggregation() error {
	_, err := s.tallyAll(context.Background(), s.clock())
	return err
}

// resultCache keeps each question's tallies in the instance for a moment, so
// a popular question costs one query per instance per resultCacheTTL however
// many requests get past the edge.
type resultCache struct {
	mu      sync.Mutex
	entries map[string]cachedCounts
}

type cachedCounts struct {
	counts map[string]int
	at     time.Time
}

const resultCacheTTL = 2 * time.Second

func (c *resultCache) get(questionID string, now time.Time) (map[string]int, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[questionID]
	if !ok || now.Sub(e.at) >= resultCacheTTL || now.Before(e.at) {
		return nil, false
	}
	return e.counts, true
}

func (c *resultCache) put(questionID string, counts map[string]int, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil || len(c.entries) > 10_000 {
		c.entries = map[string]cachedCounts{}
	}
	c.entries[questionID] = cachedCounts{counts: counts, at: now}
}

func (c *resultCache) clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = nil
}

func (s *Server) Results(w http.ResponseWriter, r *http.Request) {
	q, _, ok := s.findQuestion(r.PathValue("questionId"), resultsWindow)
	if !ok {
		writeError(w, http.StatusNotFound, "unknown_question")
		return
	}
	if q.Care == careIntimate {
		// Intimate answers are stored without the option (store.go), so there
		// is nothing to publish, and an even split would be made up.
		w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=3600")
		writeError(w, http.StatusForbidden, "private_question")
		return
	}

	counts, err := s.counts(r.Context(), q.ID)
	if err != nil {
		w.Header().Set("Cache-Control", "no-store")
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}

	res := QuestionResults{QuestionID: q.ID, Options: make([]OptionResult, 0, len(q.Options))}
	for _, o := range q.Options {
		n := counts[o.ID]
		res.Options = append(res.Options, OptionResult{OptionID: o.ID, Count: n})
		res.TotalVotes += n
	}
	for i := range res.Options {
		res.Options[i].Percent = percent(res.Options[i].Count, res.TotalVotes)
	}

	// Tallies change as the worker runs: the edge absorbs spikes for a few
	// seconds, while browsers revalidate so a voter sees their vote land.
	w.Header().Set("Cache-Control", "public, max-age=0, s-maxage=10")
	writeJSON(w, http.StatusOK, res)
}

// counts is a question's tallies, through the instance's short result cache.
func (s *Server) counts(ctx context.Context, questionID string) (map[string]int, error) {
	now := s.clock()
	if c, ok := s.resultCache.get(questionID, now); ok {
		return c, nil
	}
	c, err := s.votes.Counts(ctx, questionID)
	if err != nil {
		return nil, err
	}
	s.resultCache.put(questionID, c, now)
	return c, nil
}

// percent rounds to one decimal place. With no votes it is a real 0, not an estimate.
func percent(n, total int) float64 {
	if total == 0 {
		return 0
	}
	return math.Round(float64(n)*1000/float64(total)) / 10
}
