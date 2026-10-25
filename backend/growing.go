package main

import (
	"net/http"
)

// growingMin is how many answers a question needs before its split is
// shown, the Human Pulse threshold (frontend/src/pulse.ts PULSE_MIN): with
// fewer, a split can point at a person.
const growingMin = 20

// growingFew is the small-group guard: an answer fewer people chose is
// folded, shown as "a few" with no count, and left out of the question's
// total, so the total cannot give it away either.
const growingFew = 5

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
		res := tally(q, counts)
		out.Answers += res.TotalVotes
		if shown := foldFew(res); shown.TotalVotes >= growingMin {
			out.Questions = append(out.Questions, shown)
		}
	}
	w.Header().Set("Cache-Control", "public, max-age=0, s-maxage=30")
	writeJSON(w, http.StatusOK, out)
}

// foldFew returns the question's split with the small answers folded and
// the percentages worked out over what is left.
func foldFew(res QuestionResults) QuestionResults {
	out := QuestionResults{QuestionID: res.QuestionID, Options: make([]OptionResult, 0, len(res.Options))}
	for _, o := range res.Options {
		if o.Count > 0 && o.Count < growingFew {
			out.Options = append(out.Options, OptionResult{OptionID: o.OptionID, Few: true})
			continue
		}
		out.Options = append(out.Options, o)
		out.TotalVotes += o.Count
	}
	for i := range out.Options {
		if !out.Options[i].Few {
			out.Options[i].Percent = percent(out.Options[i].Count, out.TotalVotes)
		}
	}
	return out
}
