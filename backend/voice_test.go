package main

import (
	"fmt"
	"strings"
	"testing"
)

// voiceQuestion is a question in the voice the bank wants, the starting point
// each case below breaks (or leaves alone) in one way.
func voiceQuestion() bankQuestion {
	card := func(reveal, step string) bankInsight {
		return bankInsight{Reveal: reveal, Strength: "none", Step: step}
	}
	return bankQuestion{ID: "voice-test", Theme: "money", Prompt: "Payday arrives. What goes first?", Options: []bankOption{
		{ID: "bills", Label: "Bills", Depth: 1, Insight: card(
			"Your worries go first, then the fun. You probably tidy before guests arrive and answer the hard email first, and a treat tastes better once nothing is hanging over you.",
			"Next time it happens, notice what you do first.")},
		{ID: "savings", Label: "Savings", Depth: 2, Insight: card(
			"You trust your future self. You plan trips early, and a surprise bill lands on you as a nuisance rather than a crisis.",
			"This week, put one small amount aside and give it a name.")},
		{ID: "treat", Label: "Something for me", Depth: 3, Insight: card(
			"The week took more out of you than you let on. You give a lot at work, and payday becomes the break you didn't take.",
			"Tonight, ask yourself: what would actually help?")},
	}}
}

func voiceErrors(q bankQuestion) []error {
	return checkVoice(bankFile{Questions: []bankQuestion{q}})
}

func TestCheckVoiceCatchesOffVoiceCards(t *testing.T) {
	reveal := func(i int, s string) func(q *bankQuestion) {
		return func(q *bankQuestion) { q.Options[i].Insight.Reveal = s }
	}
	step := func(i int, s string) func(q *bankQuestion) {
		return func(q *bankQuestion) { q.Options[i].Insight.Step = s }
	}
	label := func(i int, s string) func(q *bankQuestion) {
		return func(q *bankQuestion) { q.Options[i].Label = s }
	}
	cases := []struct {
		name   string
		break_ func(q *bankQuestion)
		want   string
	}{
		// Never against other people.
		{"better than most", reveal(1, "You trust your future self more than most. You plan trips early and rarely panic."), `compares you with other people ("than most")`},
		{"easier for you than for others", reveal(1, "You trust your future self. Saving comes easier to you than for others."), `("than for others")`},
		{"people at large", reveal(1, "You trust your future self. Most people never get there, and you did."), `("Most people")`},
		{"few people", reveal(1, "You trust your future self. Few people plan this far ahead."), `("Few people")`},
		{"we all", reveal(1, "You trust your future self. We all count our own part bigger, and you know it."), `("We all")`},
		{"people like you", reveal(1, "You trust your future self. People like you plan trips early."), `("People like you")`},
		{"everyone else", reveal(1, "You trust your future self, while everyone else is still deciding."), `("everyone else")`},
		{"before anyone else does", reveal(1, "You trust your future self. You spot the bill before anyone else does."), `("before anyone else does")`},
		{"details others miss", reveal(1, "You trust your future self. You catch the small print others miss."), `("others miss")`},
		{"calm while others panic", reveal(1, "You trust your future self, and you stay calm while others panic."), `("while others")`},
		{"one of the most", reveal(1, "You trust your future self. You're one of the most careful savers around."), `("one of the most")`},
		{"rarer than it sounds", reveal(1, "You trust your future self, which is rarer than it sounds."), `("rarer than")`},
		{"a rare skill", reveal(1, "You trust your future self, and you have a rare skill for waiting."), `("a rare skill")`},
		{"louder colleagues", reveal(1, "You trust your future self, and you save more than louder colleagues."), `("than louder colleagues")`},
		{"than it bugs anyone else", reveal(1, "You trust your future self. A late bill bugs you more than it bugs anyone else."), `("than it bugs anyone else")`},
		{"than they rattle the people", reveal(1, "You trust your future self. Bills rattle you less than they rattle the people who never plan."), `("than they rattle the people")`},
		{"than tidier people", reveal(1, "You trust your future self, and it works more often than tidier people expect."), `("than tidier people")`},
		{"planners like you", reveal(1, "You trust your future self. Planners like you book trips early."), `("Planners like you")`},
		{"other people miss", reveal(1, "You trust your future self, and you notice costs other people miss."), `("other people miss")`},
		{"nobody else would", reveal(1, "You trust your future self. You spot the costs nobody else would see."), `("nobody else would")`},
		{"the first to show up", reveal(1, "You trust your future self. When a friend is short, you're the first to show up."), `("first to show up")`},
		{"the calmest in the room", reveal(1, "You trust your future self. On payday you're the calmest person in the room."), `("the calmest person in the room")`},
		{"does for others", reveal(1, "You trust your future self. Saving does for you what spending does for others."), `("does for others")`},
		{"comparison in a step", step(0, "Pay the bills before everyone else does."), "bills step: compares you with other people"},

		// Notice more, guess less.
		{"two hedges", reveal(0, "Your worries go first, then the fun. You probably tidy before guests arrive, and you likely answer the hard email first."), "reveal hedges 2 times (probably, likely)"},
		{"tends to and may", reveal(0, "Your worries go first, then the fun. You tend to tidy early, and you may answer the hard email first."), "reveal hedges 2 times"},
		{"chances are", reveal(0, "Your worries go first, then the fun. Chances are you tidy before guests arrive and answer the hard email first."), `guesses with "Chances are"`},
		{"odds are", reveal(0, "Your worries go first, then the fun. Odds are you tidy before guests arrive."), `guesses with "Odds are"`},
		{"no doubt opener", reveal(0, "Your worries go first, then the fun. No doubt you tidy before guests arrive."), `guesses with "No doubt"`},
		{"an invented drawer", reveal(0, "Your worries go first, then the fun. Somewhere in your home there's a drawer of paid bills."), "invents a detail of your life"},
		{"there's probably", reveal(0, "Your worries go first, then the fun. There's probably a spreadsheet for everything."), `invents a detail of your life ("There's probably")`},
		{"a phone full of", reveal(0, "Your worries go first, then the fun. Your phone is full of payment reminders."), "invents a detail of your life"},
		{"a guess at what you keep", reveal(0, "Your worries go first, then the fun. You probably keep spare batteries."), `invents a detail of your life ("You probably keep")`},
		{"a guess at what you once did", reveal(0, "Your worries go first, then the fun. You've probably missed a last bus or two."), `invents a detail of your life ("You've probably missed")`},
		{"a guess at what you own", reveal(0, "Your worries go first, then the fun. You may own a notebook of lists."), `invents a detail of your life ("You may own")`},

		// Speak to the reader, plainly.
		{"headline about nobody", reveal(0, "Worries go first, then the fun. You tidy before guests arrive and answer the hard email first."), "headline must speak to the reader"},
		{"tag question", reveal(0, "Your worries go first, then the fun. A treat tastes better once nothing is hanging over you, doesn't it?"), `tag question ("doesn't it?")`},
		{"right?", reveal(0, "Your worries go first, then the fun. A treat tastes better after that, right?"), `tag question ("right?")`},
		{"tag question in a step", step(2, "Tonight, take the evening off. You've earned it, haven't you?"), "treat step: ends on a tag question"},

		// UK English, and no okay.
		{"okay", reveal(1, "You trust your future self, and it's okay to spend a little too."), `says "okay"`},
		{"OK in a label", label(2, "Something for me, OK"), `treat label: says "OK"`},
		{"US spelling", reveal(1, "You trust your future self. Your favorite trips are planned early."), `US spelling "favorite"`},
		{"-ize spelling", reveal(1, "You trust your future self, and you realize what a cushion is worth."), `US spelling "realize"`},
		{"toward in a step", step(1, "This week, put one small amount toward a trip."), `US spelling "toward"`},
		{"US spelling in a prompt", func(q *bankQuestion) { q.Prompt = "Payday arrives. What's your favorite first move?" }, `voice-test prompt: uses the US spelling "favorite"`},

		// Plain labels.
		{"loaded adverb", label(0, "Pay them calmly"), `label uses the loaded word "calmly"`},
		{"forever", label(1, "Save it and trust it forever"), `loaded word "forever"`},
		{"a kind way", label(2, "Find a kind way to say no"), `loaded word "kind way"`},
		{"a polite excuse", label(2, "Find a polite excuse"), `loaded word "polite excuse"`},

		// Don't assume a partner.
		{"your partner", func(q *bankQuestion) { q.Prompt = "Payday arrives. What do you and your partner pay first?" }, `prompt presumes a partner ("your partner")`},
		{"your relationship", func(q *bankQuestion) { q.Prompt = "In your relationship, who handles payday?" }, `prompt presumes a partner ("your relationship")`},

		// What the research of 2026-10-24 rules out (docs/writing-guide.md).
		{"a changed life", reveal(1, "You trust your future self. Saving like this will change your life."), `promises too much ("change your life")`},
		{"everything will be all right", step(2, "Remember that everything will be all right."), `treat step: promises too much ("everything will be all right")`},
		{"a silver lining", reveal(1, "You trust your future self. Every bill has a silver lining."), `forced cheer ("silver lining")`},
		{"which religion", func(q *bankQuestion) { q.Prompt = "Payday arrives. Which religion are you, and does it guide you?" }, `asks which group someone belongs to ("Which religion are")`},
		{"which party", func(q *bankQuestion) { q.Prompt = "Which party do you vote for on payday?" }, `asks which group someone belongs to`},
		{"why am I like this", func(q *bankQuestion) { q.Prompt = "Payday again. Why am I like this?" }, `asks an abstract why`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			q := voiceQuestion()
			c.break_(&q)
			var got []string
			for _, err := range voiceErrors(q) {
				got = append(got, err.Error())
			}
			if !containsAny(strings.Join(got, "\n"), c.want) {
				t.Fatalf("expected an error containing %q, got %q", c.want, got)
			}
		})
	}

	t.Run("validateBank runs the voice rules", func(t *testing.T) {
		q := voiceQuestion()
		q.Options[1].Insight.Reveal = "You trust your future self more than most. You plan trips early and rarely panic."
		var found bool
		for _, err := range validateBank(bankFile{Questions: []bankQuestion{q}}) {
			found = found || strings.Contains(err.Error(), "compares you with other people")
		}
		if !found {
			t.Fatal("expected validateBank to report the comparison")
		}
	})
}

func TestCheckVoiceLetsGoodCardsThrough(t *testing.T) {
	reveal := func(i int, s string) func(q *bankQuestion) {
		return func(q *bankQuestion) { q.Options[i].Insight.Reveal = s }
	}
	label := func(i int, s string) func(q *bankQuestion) {
		return func(q *bankQuestion) { q.Options[i].Label = s }
	}
	cases := []struct {
		name string
		edit func(q *bankQuestion)
	}{
		{"the clean question", func(*bankQuestion) {}},
		{"one hedge", reveal(0, "Your worries go first, then the fun. You probably tidy before guests arrive and answer the hard email first.")},
		{"other people as part of your life", reveal(1, "You trust your future self. When a friend is short at the end of the month, you're the person they ring.")},
		{"a few people of your own", reveal(1, "You trust your future self, and a few people close to you have learned to do the same.")},
		{"are we all right?", reveal(2, "The week took more out of you than you let on. After a row you ask 'are we all right?', and you mean it.")},
		{"before anyone else can", reveal(2, "The week took more out of you than you let on. You judge yourself before anyone else can, and payday is the break.")},
		{"more than you'd guess", reveal(2, "The week took more out of you than you'd guess. You give a lot at work, and payday becomes the break.")},
		{"no doubt mid-sentence", reveal(2, "The week took more out of you than you let on. You give a lot, and you have no doubt it's worth it.")},
		{"a real question in a step", func(q *bankQuestion) { q.Options[2].Insight.Step = "Tonight, ask yourself: what would actually help?" }},
		{"someone else in the room, in a step", func(q *bankQuestion) {
			q.Options[2].Insight.Step = "At the next meeting, ask the quietest person in the room what they think."
		}},
		{"nobody else, as part of your life", reveal(1, "You trust your future self, and you check the bills so nobody else has to.")},
		{"a guess at how you act, not what you own", reveal(1, "You trust your future self. You own a mistake fast, and you may keep waiting for the perfect moment.")},
		{"owning up is not owning things", reveal(1, "You trust your future self. You probably own a mistake fast.")},
		{"UK spellings and -ize words that are UK too", reveal(1, "You trust your future self. You realise a cushion is worth more than a prize, whatever its size, and you save towards your favourite trips.")},
		{"plain labels", func(q *bankQuestion) {
			q.Options[0].Label = "Talk to them about it later"
			q.Options[1].Label = "Say nothing, and trust them less from then on"
			q.Options[2].Label = "Quietly spend it on someone else"
		}},
		{"a kind word in a reveal is fine", reveal(1, "You trust your future self, and you treat money kindly, calmly and properly.")},
		{"a label that only sounds like a loaded one", label(2, "Be friendly, but wait and see")},
		{"a partner, with a way out", func(q *bankQuestion) { q.Prompt = "With a partner, how do you handle payday, or how would you?" }},
		{"life changes are not promises", reveal(1, "You trust your future self, so when life changes you have a cushion.")},
		{"a party you go to", func(q *bankQuestion) { q.Prompt = "What party do you go to after payday?" }},
		{"a why about a moment", func(q *bankQuestion) { q.Prompt = "Payday arrives. Why does the first thing you buy matter to you?" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			q := voiceQuestion()
			c.edit(&q)
			for _, err := range voiceErrors(q) {
				t.Error(err)
			}
		})
	}
}

func TestPhraseCaps(t *testing.T) {
	// bank holds n cards that use the phrase, plus a label that does too.
	bank := func(phrase string, n int) bankFile {
		q := bankQuestion{ID: "cap-test", Theme: "money", Prompt: "Payday arrives. What goes first?"}
		for i := 0; i < n; i++ {
			q.Options = append(q.Options, bankOption{ID: fmt.Sprintf("o%d", i), Label: "Quietly, " + phrase, Insight: bankInsight{
				Reveal: fmt.Sprintf("Your card number %d says it: %s.", i, phrase),
				Step:   "Next time it happens, notice what you do first.",
			}})
		}
		return bankFile{Questions: []bankQuestion{q}}
	}
	for _, c := range phraseCaps {
		t.Run(c.phrase, func(t *testing.T) {
			for _, err := range checkVoice(bank(c.phrase, c.max)) {
				t.Errorf("%d cards should be allowed: %v", c.max, err)
			}
			want := fmt.Sprintf("%q appears in %d cards, at most %d", c.phrase, c.max+1, c.max)
			var found bool
			for _, err := range checkVoice(bank(c.phrase, c.max+1)) {
				found = found || strings.Contains(err.Error(), want)
			}
			if !found {
				t.Fatalf("expected %q", want)
			}
		})
	}

	t.Run("a step counts, and a card counts once", func(t *testing.T) {
		b := bank("a fresh phrase", 30)
		for i := range b.Questions[0].Options {
			b.Questions[0].Options[i].Insight.Step = "Say it out loud, out loud, once."
		}
		var found bool
		for _, err := range checkVoice(b) {
			found = found || strings.Contains(err.Error(), `"out loud" appears in 30 cards`)
		}
		if !found {
			t.Fatal(`expected "out loud" in 30 steps to count as 30 cards`)
		}
	})

	t.Run("labels are not counted", func(t *testing.T) {
		// Each label in bank says "Quietly"; no reveal or step does.
		for _, err := range checkVoice(bank("a fresh phrase", 40)) {
			t.Error(err)
		}
	})
}
