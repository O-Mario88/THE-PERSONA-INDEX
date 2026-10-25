package main

import (
	"net/http"
)

// growingMin is how many answers a question needs before its split is
// shown, the Human Pulse threshold (frontend/src/pulse.ts PULSE_MIN): with
// fewer, a split can point at a person.
const growingMin = 20

// Growing is GET /api/growing: anonymous totals for a date's questions.
type Growing struct {
	Date      string            `json:"date"`
	Answers   int               `json:"answers"` // answers to the date's questions so far
	Min       int               `json:"min"`
	Questions []QuestionResults `json:"questions"` // only those with at least Min answers
}

func (s *Server) GrowingTogether(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if !s.isOpenDate(date) {
		w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=3600")
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	set, ok := s.bank.GetSet(date)
	if !ok {
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=30")
		writeError(w, http.StatusNotFound, "no_edition")
		return
	}
	out := Growing{Date: date, Min: growingMin, Questions: []QuestionResults{}}
	for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
		if q.Care == careIntimate {
			continue // stored without the option: nothing honest to split
		}
		counts, err := s.counts(r.Context(), q.ID)
		if err != nil {
			w.Header().Set("Cache-Control", "no-store")
			writeError(w, http.StatusServiceUnavailable, "unavailable")
			return
		}
		res := QuestionResults{QuestionID: q.ID, Options: make([]OptionResult, 0, len(q.Options))}
		for _, o := range q.Options {
			res.Options = append(res.Options, OptionResult{OptionID: o.ID, Count: counts[o.ID]})
			res.TotalVotes += counts[o.ID]
		}
		out.Answers += res.TotalVotes
		if res.TotalVotes < growingMin {
			continue
		}
		for i := range res.Options {
			res.Options[i].Percent = percent(res.Options[i].Count, res.TotalVotes)
		}
		out.Questions = append(out.Questions, res)
	}
	w.Header().Set("Cache-Control", "public, max-age=0, s-maxage=30")
	writeJSON(w, http.StatusOK, out)
}
