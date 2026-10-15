package main

import (
	"maps"
	"os"
	"reflect"
	"regexp"
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
		cited := func(in bankInsight) bankInsight {
			in.Research, in.Source, in.Strength = "People who strongly prefer a reward now over a bigger one later tend to carry more credit card debt.", "meier2010", "moderate"
			return in
		}
		return bankQuestion{ID: "money-test", Theme: "money", Prompt: "Payday arrives. What goes first?", Options: []bankOption{
			{ID: "bills", Label: "Bills", Depth: 1, Insight: card("Worries go first, then the fun. You probably tidy before guests arrive and answer the hard email first, and a treat tastes better once nothing is hanging over you.")},
			{ID: "savings", Label: "Savings", Depth: 2, Insight: cited(card("You trust your future self more than most. You likely plan trips early, and you're often the calm one when a surprise bill lands on everyone at once."))},
			{ID: "treat", Label: "Something for me", Depth: 3, Insight: card("The week took more out of you than you let on. You give a lot at work, and you're often the last to notice you need a break, so payday becomes the break.")},
		}, FollowUp: FollowUp{Prompt: "Did money come in or go out today? What did you do first?", Options: []FollowUpOption{
			{ID: "paid-bills", Label: "I paid what was due", Traits: map[string]int{"conscientiousness": 1}, Reflection: "Paying what was due first suggests you like a clear head before anything else. Tomorrow, you might notice how that calm feels, and give yourself one small treat for it."},
			{ID: "treated-myself", Label: "I bought something for me", Reflection: "A treat on a money day may mean you needed a lift. That is allowed. Tomorrow, you could check whether it still feels good, which tends to show what was really worth it."},
			{ID: "no-money", Label: "Money didn't come up today", Reflection: "No money moments today, and that is fine. Quiet days with your money often leave room to think about what you want it to do for you next."},
		}}}
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
		{"no cited card", func(q *bankQuestion) {
			q.Options[1].Insight.Research, q.Options[1].Insight.Source, q.Options[1].Insight.Strength = "", "", "none"
		}, "at least one"},
		{"formula opener", func(q *bankQuestion) {
			q.Options[0].Insight.Reveal = "Your response indicates a strong regard for order. You probably tidy before guests arrive and answer the hard email first."
		}, "formula"},
		{"formula phrase mid-card", func(q *bankQuestion) {
			q.Options[2].Insight.Reveal = "The week took more out of you than you let on. Individuals with this orientation give a lot at work and rarely notice they need a break."
		}, "formula"},
		{"long headline", func(q *bankQuestion) {
			q.Options[0].Insight.Reveal = "Worries go first and then the fun, every single payday without fail, as you know. You probably tidy before guests arrive."
		}, "headline"},
		{"one sentence, no headline", func(q *bankQuestion) {
			q.Options[0].Insight.Reveal = "Worries go first and then the fun for you, and you probably tidy before guests arrive and answer the hard email first"
		}, "headline"},
		{"deep before shallow", func(q *bankQuestion) { q.Options[0].Depth, q.Options[1].Depth = 2, 1 }, "shallow-to-deep"},
		{"copied reveal", func(q *bankQuestion) { q.Options[1].Insight.Reveal = q.Options[0].Insight.Reveal }, "repeats"},
		{"currency", func(q *bankQuestion) { q.Options[2].Label = "Spend $50 on me" }, "currency"},
		{"too few options", func(q *bankQuestion) { q.Options = q.Options[:2] }, "3 or 4 options"},
		{"unknown trait", func(q *bankQuestion) { q.Options[0].Traits = map[string]int{"zodiac": 1} }, "trait"},
		{"thin reveal", func(q *bankQuestion) {
			q.Options[0].Insight.Reveal = "You like to pay your bills before anything else."
		}, "characters"},
		{"reveal about other people only", func(q *bankQuestion) {
			q.Options[1].Insight.Reveal = "Savers tend to plan holidays early, keep spare batteries in a drawer and are often the calm ones when a surprise bill lands on everyone at once."
		}, "speak to the reader"},
		{"uncited research claim in a reveal", func(q *bankQuestion) {
			q.Options[2].Insight.Reveal = "Your answer suggests you are tired. Studies show people like you tend to give a lot at work and are often the last to notice they need a break."
		}, "uncited research"},
		{"no evening follow-up", func(q *bankQuestion) { q.FollowUp = FollowUp{} }, "follow-up prompt"},
		{"follow-up with too few options", func(q *bankQuestion) { q.FollowUp.Options = q.FollowUp.Options[:2] }, "follow-up needs 3 or 4 options"},
		{"follow-up survey answer", func(q *bankQuestion) { q.FollowUp.Options[0].Label = "Strongly agree" }, "survey"},
		{"thin reflection", func(q *bankQuestion) { q.FollowUp.Options[1].Reflection = "You treated yourself today." }, "characters"},
		{"reflection about other people only", func(q *bankQuestion) {
			q.FollowUp.Options[1].Reflection = "People who treat themselves on payday tend to be tired by the end of the week, and a small treat is often how they keep going until the weekend comes."
		}, "speak to the reader"},
		{"reflection with an uncited claim", func(q *bankQuestion) {
			q.FollowUp.Options[1].Reflection = "Research shows a treat on payday lifts your mood for the week, so you made a sound choice and you can enjoy it without any worry at all tonight."
		}, "uncited research"},
		{"the app calls itself a therapist", func(q *bankQuestion) {
			q.FollowUp.Options[2].Reflection = "Like a good therapist would say, quiet money days are a chance for you to rest. Tomorrow, you might think about what you want your money to do for you."
		}, "banned word"},
		{"copied reflection", func(q *bankQuestion) { q.FollowUp.Options[1].Reflection = q.FollowUp.Options[0].Reflection }, "repeats"},
		{"bad follow-up trait", func(q *bankQuestion) { q.FollowUp.Options[0].Traits = map[string]int{"luck": 1} }, "trait"},
		{"duplicate follow-up option id", func(q *bankQuestion) { q.FollowUp.Options[1].ID = q.FollowUp.Options[0].ID }, "duplicate"},
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

	t.Run("no two questions share an evening prompt", func(t *testing.T) {
		a, b := good(), good()
		b.ID = "money-test-two"
		var found bool
		for _, err := range validateBank(bankFile{Questions: []bankQuestion{a, b}}) {
			found = found || strings.Contains(err.Error(), "follow-up prompt repeats")
		}
		if !found {
			t.Fatal("expected a repeated follow-up prompt to fail")
		}
	})

	t.Run("a good question passes every per-question rule", func(t *testing.T) {
		for _, err := range validateBank(bankFile{Questions: []bankQuestion{good()}}) {
			if !strings.HasPrefix(err.Error(), "theme ") { // only the bank-size rule may fire
				t.Fatal(err)
			}
		}
	})
}

func TestCitationLibrary(t *testing.T) {
	t.Run("every shipped source is a plain https link with a known strength", func(t *testing.T) {
		if len(sources) < 16 {
			t.Fatalf("expected the citation library to load, got %d sources", len(sources))
		}
		for _, err := range validateBank(bankFile{}) {
			if strings.HasPrefix(err.Error(), "source ") {
				t.Error(err)
			}
		}
	})

	broken := map[string]source{
		"plainhttp2001": {"Someone, 2001", "http://example.org/paper", "strong"},
		"vague2002":     {"Someone, 2002", "https://example.org/paper", "solid"},
		"untitled2003":  {"", "https://example.org/paper", "early"},
	}
	saved := maps.Clone(sources)
	maps.Copy(sources, broken)
	t.Cleanup(func() { sources = saved })
	var got []string
	for _, err := range validateBank(bankFile{}) {
		got = append(got, err.Error())
	}
	for key, want := range map[string]string{"plainhttp2001": "https", "vague2002": "strength", "untitled2003": "title"} {
		found := false
		for _, e := range got {
			found = found || (strings.HasPrefix(e, "source "+key) && strings.Contains(e, want))
		}
		if !found {
			t.Errorf("expected source %s to fail on %s, got %v", key, want, got)
		}
	}
}

// The frontend keeps each theme's name, icon, colors and area. A theme added on
// one side only would show up nameless or never be served.
func TestThemesMatchTheFrontend(t *testing.T) {
	raw, err := os.ReadFile("../frontend/src/themes.ts")
	if err != nil {
		t.Fatal(err)
	}
	entry := regexp.MustCompile(`(?m)^  '?([a-z0-9-]+)'?: \{ name: .*\barea: '([a-z]+)' \},$`)
	front := map[string]string{}
	for _, m := range entry.FindAllStringSubmatch(string(raw), -1) {
		front[m[1]] = m[2]
	}
	back := map[string]string{}
	for slug, th := range themes {
		back[slug] = th.area
	}
	if !maps.Equal(front, back) {
		for slug, area := range back {
			if front[slug] != area {
				t.Errorf("theme %s: backend area %q, frontend %q", slug, area, front[slug])
			}
		}
		for slug := range front {
			if _, ok := back[slug]; !ok {
				t.Errorf("theme %s is in the frontend only", slug)
			}
		}
	}
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
		s := NewServer(func() time.Time { return fixedNow }, b, newMemoryStore(), newDeviceSigner(testSecret))
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
