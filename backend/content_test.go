package main

import (
	"encoding/json"
	"maps"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

var shipped struct {
	once sync.Once
	bank contentBank
	err  error
}

// shippedBank is the bank and schedule the server ships, loaded once: banks
// are never changed after loading.
func shippedBank(t *testing.T) contentBank {
	t.Helper()
	shipped.once.Do(func() { shipped.bank, shipped.err = loadShippedBank() })
	if shipped.err != nil {
		t.Fatal(shipped.err)
	}
	return shipped.bank
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
		card := func(reveal, otherSide string) bankInsight {
			return bankInsight{Reveal: reveal, OtherSide: otherSide, Strength: "none", Step: "Next time it happens, notice what you do first."}
		}
		cited := func(in bankInsight) bankInsight {
			in.Research, in.Source, in.Strength = "People who strongly prefer a reward now over a bigger one later tend to carry more credit card debt.", "meier2010", "moderate"
			return in
		}
		return bankQuestion{ID: "money-test", Theme: "money", Prompt: "Payday arrives. What goes first?", Options: []bankOption{
			{ID: "bills", Label: "Bills", Depth: 1, Insight: card("Your worries go first, then the fun. You probably tidy before guests arrive and answer the hard email first, and a treat tastes better once nothing is hanging over you.", "When money is tight, you may skip every treat, and a month with no small joy in it is harder to keep going.")},
			{ID: "savings", Label: "Savings", Depth: 2, Insight: cited(card("You trust your future self. You likely plan trips early, and you're often the calm one when a surprise bill lands on everyone at once.", "Saving can turn into never spending, even on the things that would make your life easier now."))},
			{ID: "treat", Label: "Something for me", Depth: 3, Insight: card("The week took more out of you than you let on. You give a lot at work, and you rarely notice you need a break, so payday becomes the break.", "If payday is your only break, the bills you put off can come back as a bigger worry later in the month.")},
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
		{"verdict on the person", func(q *bankQuestion) {
			q.Options[2].Insight.Reveal = "You're a people-pleaser at heart. You give a lot at work, and you rarely notice you need a break, so payday becomes the break."
		}, "banned word"},
		{"light answer marked heavy", func(q *bankQuestion) { q.Options[0].Heavy = true }, "can be heavy"},
		{"intimate answer marked heavy", func(q *bankQuestion) { q.Theme, q.Options[2].Heavy = "intimacy", true }, "can be heavy"},
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
		// Every answer has an other side, the healthiest-looking included.
		{"no other side", func(q *bankQuestion) { q.Options[0].Insight.OtherSide = "" }, "other side: 0 characters"},
		{"other side not to the reader", func(q *bankQuestion) {
			q.Options[1].Insight.OtherSide = "Savers can turn saving into never spending, even on things that would make life easier now."
		}, "other side: must speak to the reader"},
		{"other side cites research", func(q *bankQuestion) {
			q.Options[1].Insight.OtherSide = "Studies show saving can turn into never spending, even on what would make your life easier."
		}, "other side: makes a research claim"},
		{"other side states a statistic", func(q *bankQuestion) {
			q.Options[2].Insight.OtherSide = "Around 40% of the time, the bills you put off come back as a bigger worry for you."
		}, "other side: states a statistic"},
		{"other side repeats the reveal", func(q *bankQuestion) {
			q.Options[2].Insight.OtherSide = "You give a lot at work, and you rarely notice you need a break, so payday becomes the break."
		}, "repeats the reveal"},
		{"early evidence said as fact", func(q *bankQuestion) {
			in := &q.Options[0].Insight
			in.Research, in.Source, in.Strength = "Early evidence, standing in here to test the soft-wording rule.", "andrews2015", "early"
			in.Reveal = "Your worries go first, then the fun. You tidy before guests arrive and answer the hard email first, and a treat tastes better once nothing is hanging over you."
		}, "the evidence is early, so say it softly"},
		{"the app calls itself a therapist", func(q *bankQuestion) {
			q.Options[2].Insight.Step = "Like a good therapist would say, take one quiet evening for you this week, and notice how payday feels after it."
		}, "banned word"},
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

	t.Run("every question day for two years: dated ids and an insight card on every option", func(t *testing.T) {
		// How many a day, and from which areas: see TestTheWeek.
		for d := range 730 {
			date := fixedNow.AddDate(0, 0, d).Format("2006-01-02")
			set, ok := b.GetSet(date)
			if !ok || set.Date != date || (len(set.Questions) == 0) != set.Review {
				t.Fatalf("%s: expected questions or a review day, got %+v", date, set)
			}
			for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
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

// Heavy answers reach the phone marked, so it can point to people instead of
// showing an insight, and only the answers content review marked are heavy.
func TestHeavyAnswersReachThePhone(t *testing.T) {
	b := shippedBank(t)
	var heavy []string
	for _, q := range b.byID {
		for _, o := range b.dailyQuestion(*q, "2026-10-12").Options {
			if o.Heavy {
				heavy = append(heavy, q.ID+"/"+o.ID)
			}
		}
	}
	slices.Sort(heavy)
	want := []string{
		"happiness-joy-lately/hard-to-say",
		"happiness-mornings/heavy-feeling",
		"quality-quantity-3am-call/handle-alone",
		"quality-quantity-group-chats/no-real-talk",
		"sadness-stress-bad-day/replay-in-bed",
		"sadness-stress-disappointed/low-alone",
		"sadness-stress-most-alone/good-news-alone",
		"sadness-stress-most-alone/with-close-people",
		"sadness-stress-quiet-phone/forgotten",
	}
	if !slices.Equal(heavy, want) {
		t.Errorf("heavy answers = %v, want %v", heavy, want)
	}
	raw, err := json.Marshal(b.dailyQuestion(*b.byID["sadness-stress-quiet-phone"], "2026-10-12"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"id":"forgotten","label":"I wonder if people have forgotten me","depth":4,"heavy":true`) {
		t.Errorf("the API shape does not carry heavy: %s", raw)
	}
}
