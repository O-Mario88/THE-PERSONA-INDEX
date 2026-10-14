package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func shippedBank(t *testing.T) contentBank {
	t.Helper()
	b, err := loadContentBank(questionsJSON)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestShippedBankPassesTheQualityGate(t *testing.T) {
	var f bankFile
	if err := decodeStrict(questionsJSON, &f); err != nil {
		t.Fatal(err)
	}
	for _, err := range validateBank(f) {
		t.Error(err)
	}
	if len(f.Questions) < 100 {
		t.Errorf("expected a launch bank of 100+ questions, got %d", len(f.Questions))
	}
}

func TestValidateBankCatchesBrokenCards(t *testing.T) {
	good := func() bankQuestion {
		card := func(reveal string) bankInsight {
			return bankInsight{Reveal: reveal, Strength: "none", Step: "Next time it happens, notice what you do first."}
		}
		return bankQuestion{ID: "money-test", Theme: "money", Prompt: "Payday arrives. What goes first?", Options: []bankOption{
			{ID: "bills", Label: "Bills", Depth: 1, Insight: card("People who pay bills first often like to clear worries before they can enjoy anything.")},
			{ID: "savings", Label: "Savings", Depth: 2, Insight: card("Saving first suggests you trust your future self more than most people do.")},
			{ID: "treat", Label: "Something for me", Depth: 3, Insight: card("Treating yourself first often means the week took more out of you than you admit.")},
		}}
	}
	cases := []struct {
		name   string
		break_ func(q *bankQuestion)
		want   string
	}{
		{"survey answer", func(q *bankQuestion) { q.Options[0].Label = "Agree" }, "survey"},
		{"rating prompt", func(q *bankQuestion) { q.Prompt = "On a scale of 1 to 5, how tidy are you?" }, "survey"},
		{"invented statistic", func(q *bankQuestion) {
			q.Options[1].Insight.Reveal = "Only 12% of people save first, which makes you rare and quite disciplined."
		}, "statistic"},
		{"diagnostic word", func(q *bankQuestion) {
			q.Options[2].Insight.Reveal = "Treating yourself first can be a sign of depression, so watch your mood closely."
		}, "banned word"},
		{"unknown citation", func(q *bankQuestion) {
			q.Options[0].Insight.Research, q.Options[0].Insight.Source, q.Options[0].Insight.Strength = "A study says bill payers are happier people overall.", "madeup2024", "strong"
		}, "not in the citation library"},
		{"overstated strength", func(q *bankQuestion) {
			q.Options[0].Insight.Research, q.Options[0].Insight.Source, q.Options[0].Insight.Strength = "Present bias is linked to credit card debt.", "meier2010", "strong"
		}, "library says"},
		{"deep before shallow", func(q *bankQuestion) { q.Options[0].Depth, q.Options[1].Depth = 2, 1 }, "shallow-to-deep"},
		{"copied reveal", func(q *bankQuestion) { q.Options[1].Insight.Reveal = q.Options[0].Insight.Reveal }, "repeats"},
		{"currency", func(q *bankQuestion) { q.Options[2].Label = "Spend $50 on me" }, "currency"},
		{"too few options", func(q *bankQuestion) { q.Options = q.Options[:2] }, "3 or 4 options"},
		{"unknown trait", func(q *bankQuestion) { q.Options[0].Traits = map[string]int{"zodiac": 1} }, "trait"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			q := good()
			c.break_(&q)
			var found bool
			for _, err := range validateBank(bankFile{Questions: []bankQuestion{q}}) {
				if strings.Contains(err.Error(), c.want) {
					found = true
				}
			}
			if !found {
				t.Fatalf("expected an error containing %q", c.want)
			}
		})
	}

	t.Run("a good question passes every per-question rule", func(t *testing.T) {
		for _, err := range validateBank(bankFile{Questions: []bankQuestion{good()}}) {
			if !strings.HasPrefix(err.Error(), "theme ") { // only the bank-size rule may fire
				t.Fatal(err)
			}
		}
	})
}

func TestDailyPick(t *testing.T) {
	b := shippedBank(t)
	themeArea := func(q Question) string { return themes[q.Theme].area }

	t.Run("every day for two years: 3 questions from 3 different areas, never intimate", func(t *testing.T) {
		for d := range 730 {
			date := fixedNow.AddDate(0, 0, d).Format("2006-01-02")
			set, ok := b.GetSet(date)
			if !ok || set.Date != date || len(set.Questions) != 3 {
				t.Fatalf("%s: expected 3 questions, got %+v", date, set)
			}
			seen := map[string]bool{}
			for _, q := range set.Questions {
				if themes[q.Theme].care == careIntimate {
					t.Fatalf("%s: intimate question %s in the daily set", date, q.ID)
				}
				if seen[themeArea(q)] {
					t.Fatalf("%s: two questions from area %s", date, themeArea(q))
				}
				seen[themeArea(q)] = true
				if !strings.HasPrefix(q.ID, date+"-") {
					t.Fatalf("%s: id %s does not carry the date", date, q.ID)
				}
				for _, o := range q.Options {
					if o.Insight == nil || o.Insight.Reveal == "" || o.Insight.Step == "" {
						t.Fatalf("%s: option %s has no insight card", q.ID, o.ID)
					}
				}
			}
		}
	})

	t.Run("the same date always gives the same set", func(t *testing.T) {
		a, _ := b.GetSet("2027-03-09")
		again, _ := shippedBank(t).GetSet("2027-03-09")
		if !reflect.DeepEqual(a, again) {
			t.Fatal("expected a deterministic pick")
		}
	})

	t.Run("no question repeats in an area until the area is used up", func(t *testing.T) {
		draws := map[string][]string{}
		for d := range 1500 {
			set, _ := b.GetSet(time.Unix(0, 0).UTC().AddDate(0, 0, d).Format("2006-01-02"))
			for _, q := range set.Questions {
				a := themeArea(q)
				draws[a] = append(draws[a], strings.TrimPrefix(q.ID, set.Date+"-"))
			}
		}
		for a, ids := range draws {
			n := len(b.byArea[a])
			for start := 0; start+n <= len(ids); start += n {
				seen := map[string]bool{}
				for _, id := range ids[start : start+n] {
					if seen[id] {
						t.Fatalf("area %s repeats %s within one cycle", a, id)
					}
					seen[id] = true
				}
			}
		}
	})

	t.Run("rejects a malformed date", func(t *testing.T) {
		if _, ok := b.GetSet("not-a-date"); ok {
			t.Fatal("expected no set")
		}
	})

	t.Run("serves questions with insight cards, and votes on them, end to end", func(t *testing.T) {
		s := NewServer(func() time.Time { return fixedNow }, b)
		set := decode[DailySet](t, get(t, s, "/api/questions/today"))
		q := set.Questions[0]
		if q.Theme == "" || q.Options[0].Insight == nil {
			t.Fatalf("expected theme and insight in the payload, got %+v", q)
		}
		v := VoteRequest{QuestionID: q.ID, OptionID: q.Options[0].ID, VoterID: "device-1"}
		expectStatus(t, postVote(t, s, v, "k1"), 202)
		if n := totalVotes(t, s, q.ID); n != 1 {
			t.Fatalf("expected 1, got %d", n)
		}
	})
}
