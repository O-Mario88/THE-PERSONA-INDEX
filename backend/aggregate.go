package main

import (
	"math"
	"net/http"
	"sync"
)

// resultSnapshots holds the published per-question counts. Results are read
// from here, never computed from the event log on request, so a popular
// question costs one map lookup and the edge can cache the answer.
type resultSnapshots struct {
	mu     sync.RWMutex
	cursor int64                     // Seq of the last folded event
	counts map[string]map[string]int // questionId -> optionId -> count
}

func newResultSnapshots() *resultSnapshots {
	return &resultSnapshots{counts: map[string]map[string]int{}}
}

func (r *resultSnapshots) count(questionID, optionID string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.counts[questionID][optionID]
}

const aggregationBatch = 1000

// RunAggregation is the worker step: fold accepted vote events into the
// published result snapshots. It resumes from a cursor, so running it again
// never counts an event twice.
func (s *Server) RunAggregation() error {
	s.aggMu.Lock() // one fold at a time; the cursor read and advance must not interleave
	defer s.aggMu.Unlock()
	for {
		s.results.mu.RLock()
		cursor := s.results.cursor
		s.results.mu.RUnlock()

		events := s.votes.EventsAfter(cursor, aggregationBatch)
		if len(events) == 0 {
			return nil
		}
		s.results.mu.Lock()
		for _, e := range events {
			byOption := s.results.counts[e.QuestionID]
			if byOption == nil {
				byOption = map[string]int{}
				s.results.counts[e.QuestionID] = byOption
			}
			byOption[e.OptionID]++
			s.results.cursor = e.Seq
		}
		s.results.mu.Unlock()
	}
}

func (s *Server) Results(w http.ResponseWriter, r *http.Request) {
	q, ok := s.findQuestion(r.PathValue("questionId"))
	if !ok {
		writeError(w, http.StatusNotFound, "unknown_question")
		return
	}

	res := QuestionResults{QuestionID: q.ID, Options: make([]OptionResult, 0, len(q.Options))}
	for _, o := range q.Options {
		n := s.results.count(q.ID, o.ID)
		res.Options = append(res.Options, OptionResult{OptionID: o.ID, Count: n})
		res.TotalVotes += n
	}
	for i := range res.Options {
		res.Options[i].Percent = percent(res.Options[i].Count, res.TotalVotes)
	}

	// Snapshots change as the worker runs; a short shared cache absorbs spikes.
	w.Header().Set("Cache-Control", "public, max-age=5, s-maxage=10")
	writeJSON(w, http.StatusOK, res)
}

// percent rounds to one decimal place. With no votes it is a real 0, not an estimate.
func percent(n, total int) float64 {
	if total == 0 {
		return 0
	}
	return math.Round(float64(n)*1000/float64(total)) / 10
}
