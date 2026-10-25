package main

import (
	"fmt"
	"net/http"
	"testing"
)

// Growing Together (Edwin, 2026-10-25): anonymous totals for today's
// questions, so a person sees they are not the only one. Real counts only,
// and a question's split only once enough people have answered.
func TestGrowingTogether(t *testing.T) {
	t.Run("counts today's answers and shows no split below the minimum", func(t *testing.T) {
		s := newTestServer()
		for i := range 3 {
			expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-alarm", OptionID: "one", VoterID: fmt.Sprintf("v%d", i)}, fmt.Sprintf("k%d", i)), http.StatusAccepted)
		}
		aggregate(t, s)
		g := decode[Growing](t, get(t, s, "/api/growing?date="+today))
		if g.Answers != 3 {
			t.Fatalf("expected 3 answers today, got %d", g.Answers)
		}
		if len(g.Questions) != 0 {
			t.Fatalf("expected no split below %d answers, got %+v", growingMin, g.Questions)
		}
		if g.Min != growingMin {
			t.Fatalf("expected the minimum to be sent, got %d", g.Min)
		}
	})

	t.Run("shows a question's split once enough people have answered", func(t *testing.T) {
		s := newTestServer()
		for i := range growingMin {
			opt := "one"
			if i%4 == 0 {
				opt = "four-plus"
			}
			expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-alarm", OptionID: opt, VoterID: fmt.Sprintf("v%d", i)}, fmt.Sprintf("k%d", i)), http.StatusAccepted)
		}
		aggregate(t, s)
		g := decode[Growing](t, get(t, s, "/api/growing?date="+today))
		if len(g.Questions) != 1 || g.Questions[0].QuestionID != "q-alarm" || g.Questions[0].TotalVotes != growingMin {
			t.Fatalf("expected q-alarm with %d answers, got %+v", growingMin, g.Questions)
		}
		var one OptionResult
		for _, o := range g.Questions[0].Options {
			if o.OptionID == "one" {
				one = o
			}
		}
		if one.Count != 15 || one.Percent != 75 {
			t.Fatalf("expected 15 at 75%%, got %+v", one)
		}
	})

	t.Run("folds an answer fewer than five people chose, so no one stands out", func(t *testing.T) {
		s := newTestServer()
		for i := range 24 {
			opt := "one"
			if i < 3 {
				opt = "four-plus"
			}
			expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-alarm", OptionID: opt, VoterID: fmt.Sprintf("v%d", i)}, fmt.Sprintf("k%d", i)), http.StatusAccepted)
		}
		aggregate(t, s)
		g := decode[Growing](t, get(t, s, "/api/growing?date="+today))
		if len(g.Questions) != 1 {
			t.Fatalf("expected q-alarm, got %+v", g.Questions)
		}
		q := g.Questions[0]
		if q.TotalVotes != 21 {
			t.Fatalf("the folded three must not be countable from the question's total, got %d", q.TotalVotes)
		}
		for _, o := range q.Options {
			switch o.OptionID {
			case "four-plus":
				if !o.Few || o.Count != 0 || o.Percent != 0 {
					t.Fatalf("expected four-plus folded, got %+v", o)
				}
			case "one":
				if o.Few || o.Count != 21 || o.Percent != 100 {
					t.Fatalf("expected 21 at 100%%, got %+v", o)
				}
			}
		}
	})

	t.Run("hides a question whose unfolded answers fall below the minimum", func(t *testing.T) {
		s := newTestServer()
		for i := range growingMin {
			opt := "one"
			if i < 2 {
				opt = "four-plus"
			}
			expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-alarm", OptionID: opt, VoterID: fmt.Sprintf("v%d", i)}, fmt.Sprintf("k%d", i)), http.StatusAccepted)
		}
		aggregate(t, s)
		if g := decode[Growing](t, get(t, s, "/api/growing?date="+today)); len(g.Questions) != 0 {
			t.Fatalf("18 shown answers is below %d, got %+v", growingMin, g.Questions)
		}
	})

	t.Run("refuses a date that is not open", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, get(t, s, "/api/growing?date=2020-01-01"), http.StatusBadRequest)
	})
}
