package main

// The seven needs an answer can reach for (the proposal of 2026-10-24, "What
// you're reaching for", and docs/writing-guide.md, "Tagging an answer
// option"). Every bank option carries one, chosen by the guide's fixed rules;
// the gate refuses an option without one. The phone names them in everyday
// words (frontend/src/needs.ts) and TestNeedsMatchTheFrontend keeps the two
// lists in step.
//
// needSteps is the second step a card can offer beside its own: one small,
// outward thing that serves the need the answer reached for, from the
// research's table of steps by need. The person picks one of the two, or
// writes their own. Each is possible without money or much time.
var needSteps = map[string]string{
	"freedom":    "Choose when messages and news reach you today: turn one alert off until the evening.",
	"belonging":  "Message one person today, or share one good moment with someone.",
	"respect":    "Say what you think in one plain, kind sentence today, and notice how it lands.",
	"competence": "Add one thing to your day: ask one person's advice, or learn one small thing.",
	"security":   "Look at one thing you've been putting off, like a bill or a message. Just look; nothing has to be fixed today.",
	"calm":       "If something knocks you back today, talk to yourself the way you'd talk to a good friend.",
	"understood": "Tell one person one true thing about how your day really went.",
}

func validNeed(n string) bool {
	_, ok := needSteps[n]
	return ok
}
