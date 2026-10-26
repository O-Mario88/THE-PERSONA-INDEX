package main

import (
	"net/http"
	"time"
)

// notAloneDays is how far back Insights' "You're not alone" looks: the
// questions of the last 30 days, today included.
const notAloneDays = 30

// NotAlone is GET /api/not-alone: for every question of the last 30 days,
// how many people chose each answer, once at least growingMin have answered.
// It is the same for everyone and carries no device pass, so asking for it
// tells the server nothing about which questions a phone answered; the phone
// picks out its own answers. Counts only, never percentages or estimates;
// an answer fewer than growingFew chose is folded, as in Growing Together.
type NotAlone struct {
	Date      string             `json:"date"`
	Days      int                `json:"days"`
	Min       int                `json:"min"`
	Questions []NotAloneQuestion `json:"questions"`
}

type NotAloneQuestion struct {
	QuestionID string           `json:"questionId"`
	Total      int              `json:"total"` // the answers counted, the folded few left out
	Options    []NotAloneOption `json:"options"`
}

type NotAloneOption struct {
	OptionID string `json:"optionId"`
	Count    int    `json:"count"`
	Few      bool   `json:"few,omitempty"` // chosen by a few: no count is given
}

func (s *Server) NotAloneCounts(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if !s.isOpenDate(date) {
		w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=3600")
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	day, _ := time.Parse("2006-01-02", date)
	out := NotAlone{Date: date, Days: notAloneDays, Min: growingMin, Questions: []NotAloneQuestion{}}
	seen := map[string]bool{}
	for i := range notAloneDays {
		set, ok := s.bank.GetSet(day.AddDate(0, 0, -i).Format("2006-01-02"))
		if !ok {
			continue
		}
		for _, q := range setQuestions(set) {
			if seen[q.ID] || q.Care == careIntimate {
				continue // intimate answers are stored without the option: nothing honest to count
			}
			seen[q.ID] = true
			counts, err := s.counts(r.Context(), q.ID)
			if err != nil {
				w.Header().Set("Cache-Control", "no-store")
				writeError(w, http.StatusServiceUnavailable, "unavailable")
				return
			}
			if shown := foldFew(tally(q, counts)); shown.TotalVotes >= growingMin {
				out.Questions = append(out.Questions, notAloneQuestion(shown))
			}
		}
	}
	w.Header().Set("Cache-Control", "public, max-age=0, s-maxage=300")
	writeJSON(w, http.StatusOK, out)
}

// setQuestions is every question an edition offered: both sittings and the pool.
func setQuestions(set DailySet) []Question {
	return append(append(append([]Question{}, set.Questions...), set.Evening...), set.Pool...)
}

// tally is a question's counts in the order of its options.
func tally(q Question, counts map[string]int) QuestionResults {
	res := QuestionResults{QuestionID: q.ID, Options: make([]OptionResult, 0, len(q.Options))}
	for _, o := range q.Options {
		res.Options = append(res.Options, OptionResult{OptionID: o.ID, Count: counts[o.ID]})
		res.TotalVotes += counts[o.ID]
	}
	return res
}

func notAloneQuestion(res QuestionResults) NotAloneQuestion {
	q := NotAloneQuestion{QuestionID: res.QuestionID, Total: res.TotalVotes, Options: make([]NotAloneOption, 0, len(res.Options))}
	for _, o := range res.Options {
		q.Options = append(q.Options, NotAloneOption{OptionID: o.OptionID, Count: o.Count, Few: o.Few})
	}
	return q
}
