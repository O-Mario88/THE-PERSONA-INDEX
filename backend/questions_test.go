package main

import (
	"testing"
	"time"
)

func TestRotatingBank(t *testing.T) {
	bank := rotatingBank{sets: editorialSets}

	t.Run("every day for a year has 3 well-formed questions with unique ids", func(t *testing.T) {
		seen := map[string]bool{}
		for d := range 365 {
			date := fixedNow.AddDate(0, 0, d).Format("2006-01-02")
			set, ok := bank.GetSet(date)
			if !ok || set.Date != date || len(set.Questions) != 3 {
				t.Fatalf("%s: expected a set of 3, got %+v", date, set)
			}
			for _, q := range set.Questions {
				if seen[q.ID] {
					t.Fatalf("question id %s repeats", q.ID)
				}
				seen[q.ID] = true
				if q.Prompt == "" || len(q.Options) < 2 {
					t.Fatalf("question %s needs a prompt and 2+ options", q.ID)
				}
				opt := map[string]bool{}
				for _, o := range q.Options {
					if o.ID == "" || o.Label == "" || opt[o.ID] {
						t.Fatalf("question %s has a blank or repeated option", q.ID)
					}
					opt[o.ID] = true
				}
			}
		}
	})

	t.Run("rejects a malformed date", func(t *testing.T) {
		if _, ok := bank.GetSet("not-a-date"); ok {
			t.Fatal("expected no set")
		}
	})

	t.Run("serves the API end to end", func(t *testing.T) {
		s := NewServer(func() time.Time { return fixedNow }, bank)
		set := decode[DailySet](t, get(t, s, "/api/questions/today"))
		q := set.Questions[0]
		v := VoteRequest{QuestionID: q.ID, OptionID: q.Options[0].ID, VoterID: "device-1"}
		expectStatus(t, postVote(t, s, v, "k1"), 202)
		if n := totalVotes(t, s, q.ID); n != 1 {
			t.Fatalf("expected 1, got %d", n)
		}
	})
}
