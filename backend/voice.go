package main

import (
	"fmt"
	"regexp"
	"strings"
)

// The voice rules (Edwin, 2026-10-15). The Persona Index is a private
// companion that speaks to "you" like a warm, honest person: never a game,
// never a survey, never a therapist. validateBank's other rules keep cards the
// right shape; these keep them in that voice. Each one is a habit the bank
// had picked up:
//
//   - It never compares you with other people ("faster than anyone", "most
//     people", "details others miss"). It says the same thing about you alone.
//     Other people may appear as part of your life ("you notice what a friend
//     needs"); they are never the measure.
//   - It guesses less and notices more: at most one hedge a card, no "Chances
//     are" or "Odds are", and no made-up details of your life ("there's
//     probably a drawer of manuals somewhere in your home").
//   - The headline, the card's first sentence, speaks to you, and no card
//     fishes for agreement with a tag question ("doesn't it?").
//   - Answer labels are plain: no word that gives away the "good" answer.
//   - A prompt never presumes a partner.
//   - UK English throughout, and no "ok" or "okay".
//   - A few phrases had been used so often that the cards began to sound
//     alike; each now has a cap across the whole bank.
//
// The research of 2026-10-24 (docs/research/what-people-crave.md, distilled
// in docs/writing-guide.md) added the rules below promisePattern: no
// promises, no forced cheer, no prompt that asks which group someone belongs
// to or why they are "like this", and (bannedPattern in content.go) no
// labels for who someone is.
//
// frontend/src/voice.ts holds the same rules for the mirror, the day close
// and the reads (voice.test.ts runs them); keep the two in step.

// comparisonPattern finds the ways a card had of measuring the reader against
// other people, or of talking about people at large instead of the reader.
var comparisonPattern = regexp.MustCompile(`(?i)` + strings.Join([]string{
	// Ranking: "better than most", "faster than anyone", "than people expect",
	// "easier for you than for others".
	`\bthan (for |to |with |off |in )?(most|many|anyone|anybody|everyone|everybody|others|other people|people|friends|someone|somebody|those|the people|average)\b`,
	// "longer than they do for others", "earn less than louder colleagues".
	`\bthan (they|it|we) (do|does|did|would) for\b`,
	`\bthan (\w+ )?(colleagues|classmates|peers|siblings|neighbours|strangers)\b`,
	`\bthan we (fear|think|expect|plan|imagine|realise)\b`,
	// "bugs you more than it bugs anyone else", "rattle you less than they
	// rattle the people who...", "more often than tidier people expect".
	`\bthan [^.,;!?]*\b(anyone|anybody|everyone|everybody) else\b`,
	`\bthan (it|they|he|she) \w+ (the people|other people|others|most people)\b`,
	`\bthan \w+er (people|folk)\b`,
	// People at large in place of the reader: "most people", "many people
	// quit", "plenty of people never get there". ("A few people" is a small
	// circle in the reader's own life, and is fine; see comparisonExceptions,
	// which also holds "we all".)
	`\b(most|many|some|plenty of|lots of) (people|partners|couples|adults|grown-ups|players|guests)\b`,
	`\b(most|many|some|few|all|none) of us\b`,
	`\bwe (tend|compare)\b`,
	`\b(nearly|almost) (everyone|everybody)\b`,
	`\bnot (everyone|everybody)\b`,
	// "people like you", "peacekeepers like you".
	`\b(people|folk|\w+ers) like (you|us)\b`,
	`\b(people|anyone|those) who [^.!?;,]*\b(like this|like you|this way|for this)\b`, // "people who eat like this"
	`\bunlike (most|many|others|other people|everyone|anyone|people)\b`,
	`\b(everyone|everybody) else\b`,
	`\bthe rest of us\b`,
	// "You spot jobs before anyone else does"; but "you judge yourself before
	// anyone else can" is about you alone, and is fine.
	`\bbefore (anyone|anybody|everyone|everybody) else('s\b|\s+(does|do|is|has|thinks|notices|sees|and)\b|\s*[.,;!?]|\s*$)`,
	// The reader set against others: "details others miss", "calm when others
	// panic", "long before others do".
	`\b(while|whilst|when|where|before) (others|other people|most people)\b`,
	`\b(others|other people) (still |often |usually |just |all |simply )?(miss|missed|overlook|overlooked|skip|drop|dread|swallow|shrug off|rush past|walk past|give up|forget|forgot|forgotten|would|call|stopped|only|drift|grab|panic|stall|scramble|talk themselves|feel too)\b`,
	`\bdoes for (others|other people|most people|everyone else)\b`, // "does for you what sleep does for others"
	`\b(nobody|no one) else (would|could|will|can|does|did|sees|saw|notices|noticed|spots|thinks|thought)\b`,
	// Ranking: "one of the most", "the most patient person", "the first to
	// show up". ("The calmest person in the room" is in comparisonExceptions.)
	`\bone of the (most|least|best|worst|first|last|few|\w+est)\b`,
	`\bthe (most|least) \w+ (person|one|people)\b`,
	`\b(first|last) (one )?to (notice|see|spot|sense|show up|be asked|be heard|speak up|help|offer|arrive|step in)\b`,
	// Rarity is a ranking too: "rarer than it sounds", "a rare skill".
	`\brarer than\b`,
	`\brarest\b`,
	`\b(is|that's|it's|that is|it is) (\w+ )?rare\b`,
	`\b(a|an) (rare|unusual|uncommon) (skill|gift|quality|trait|talent|knack|ability|strength|kind|patience|calm|ease)\b`,
	`\bsomething rare\b`,
}, "|"))

// comparisonExceptions are comparisons that RE2 cannot tell from their
// harmless look-alikes without lookaround. Each matches either way, and the
// match counts only when its first group is empty:
//
//   - "few people fill a gap as fast as you", but not "a few people", the
//     reader's own small circle;
//   - "we all count our own part bigger", but not "are we all right?";
//   - "you're the calmest person in the room", but not a step's "ask the
//     quietest person in the room what they think".
var comparisonExceptions = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(\ba )?\bfew people\b`),
	regexp.MustCompile(`(?i)\bwe all\b( right\b)?`),
	regexp.MustCompile(`(?i)(\b(?:ask|invite|asking|inviting) )?\bthe (?:most \w+|least \w+|\w+est) (?:\w+ )?in (?:the|any|every) (?:room|team|group|office|class|family)\b`),
}

// hedgePattern finds the guesses. One is honest ("you probably plan ahead");
// a card with two or three is guessing rather than noticing.
var hedgePattern = regexp.MustCompile(`(?i)\b(probably|likely|tends? to|tended to|may|might|perhaps|maybe|chances are|odds are|there's a good chance|it wouldn't be surprising)\b`)

// maxHedges is how many hedges one card may use.
const maxHedges = 1

// guessOpenerPattern finds the stock openers of a guess. "Chances are" and
// "Odds are" are banned anywhere; "No doubt" where it opens a sentence.
var guessOpenerPattern = regexp.MustCompile(`(?i)\b(chances|odds) are\b|(^|[.!?:;]\s+)no doubt\b`)

// inventedPattern finds made-up details of the reader's life: a hedged
// "there's probably a ...", "somewhere in your home there's ...", a drawer of
// something, a phone or home "full of" something the answer never said, and
// a guess at what you keep or own or once did ("you probably keep spare
// batteries", "you've probably missed a last bus", "you may own a notebook").
var inventedPattern = regexp.MustCompile(`(?i)` + strings.Join([]string{
	`\bthere(?:'s| is| are) (probably|likely|almost certainly|no doubt|a good chance)\b`,
	`\bsomewhere (in your|you keep|there's|there is|there are)\b`,
	`\bdrawers? (of|full of)\b`,
	`\byour (phone|camera roll|home|house|flat|bag|desk|cupboards?|wardrobe|fridge|saved posts|notes app|inbox) (is|are) (probably |likely )?(full of|stuffed with|packed with|filled with|stocked)\b`,
	`\b(is|are) (probably|likely) (in|on) your\b`,
	`\byou(?:'ve| have)? (probably|likely) (keep|kept|have|taken|bought|missed|fed|rewritten|written|caught)\b`,
	`\byou (may|might) own\b`,
}, "|"))

// tagQuestionPattern finds a question tacked on to fish for agreement:
// "..., doesn't it?", "..., hadn't you?", "..., right?".
var tagQuestionPattern = regexp.MustCompile(`(?i),\s*((isn't|aren't|wasn't|weren't|doesn't|don't|didn't|hasn't|haven't|hadn't|won't|wouldn't|can't|couldn't|shouldn't|is|are|was|were|does|do|did|has|have|had|will|would|can|could|should)\s+(it|you|they|we|he|she|there|that|i)|right|eh)\s*\?`)

// okayPattern: the bank says "all right", "fine" or "safe" instead.
var okayPattern = regexp.MustCompile(`(?i)\b(ok|okay)\b`)

// usSpellingPattern finds the common American spellings; the bank is UK
// English. -ize words are found by usIzePattern.
var usSpellingPattern = regexp.MustCompile(`(?i)\b(` + strings.Join([]string{
	`colors?|colored|colorful|favors?|favored|favoring|favorites?|flavors?|flavored|honors?|honored|humor|humored|labors?|labored`,
	`neighbors?|neighborhoods?|neighborly|rumors?|behaviors?|behavioral|harbors?|savor|savored|endeavors?|odors?|armor|parlor|vapor`,
	`centers?|centered|theaters?|fibers?|liters?|somber|meager`,
	`traveled|traveling|travelers?|canceled|canceling|labeled|labeling|modeled|modeling|fueled|fueling|jeweler|marvelous|signaled|dialed|dialing|leveled|quarreled|woolen`,
	`\w+yz(e|es|ed|ing)`,
	`defense|offense|pretense|catalog|gray|moms?|math|toward|afterward|pajamas|cozy|aluminum|skeptic(al|ism)?|jewelry|plow|mold|moldy|mustache`,
	`practicing|practiced|fulfill|fulfillment|enroll|enrollment|installment|skillful|willful|judgment|acknowledgment|aging|gotten`,
}, "|") + `)\b`)

// usIzePattern finds -ize spellings ("realize", "apologizing"); the bank
// uses -ise. notIze lists the words that are -ize in UK English too.
var usIzePattern = regexp.MustCompile(`(?i)\b[a-z]+iz(e|es|ed|ing|ation|ations)\b`)

var notIze = map[string]bool{
	"size": true, "sizes": true, "sized": true, "sizing": true, "resize": true, "resized": true,
	"downsize": true, "downsized": true, "downsizing": true, "oversize": true, "oversized": true, "outsize": true, "outsized": true,
	"prize": true, "prizes": true, "prized": true, "seize": true, "seizes": true, "seized": true, "seizing": true,
	"capsize": true, "capsized": true, "capsizing": true,
}

// loadedLabelPattern finds answer labels that tell you which answer is the
// good one: "Mention it calmly", "Say no, kindly", "trust them less
// forever", "Find a kind way to say no". The label names what you do; the
// card says what it means.
var loadedLabelPattern = regexp.MustCompile(`(?i)\b(calmly|kindly|gently|politely|properly|warmly|wisely|patiently|healthily|sensibly|maturely|respectfully|responsibly|gracefully|graciously|tactfully|thoughtfully|considerately|generously|bravely|nicely|sweetly|lovingly|forever)\b|` +
	`\b(kind|polite|gentle|calm|friendly|proper|healthy|sensible|mature)\s+(way|word|words|no|look|reminder|message|excuse|reason)\b`)

// partnerPromptPattern finds a prompt that presumes the reader has a
// partner. Ask about "a partner", or offer a way out ("or how would you?").
var partnerPromptPattern = regexp.MustCompile(`(?i)\byour (partner|relationship|spouse|husband|wife|boyfriend|girlfriend|other half)\b`)

// promisePattern finds a promise the evidence cannot keep. Every effect in
// the research is small, so a card promises noticing and small shifts,
// never a changed life, a guarantee, happiness or that everything will be
// all right (the "40% of happiness" figure is disowned by its own authors).
var promisePattern = regexp.MustCompile(`(?i)\b(change (your|you|their) life|life[- ]changing|transform(s|ed|ing|ation|ative)?|guarantee[sd]?|everything will be (all right|alright|fine)|it will all work out|(will|'ll) (make you|be) happier|unlock (your|the)|rewire[sd]?|fix yourself|the secret (is|to)|40 ?(%|per ?cent) of (your )?happiness)\b`)

// cheerPattern finds forced cheer. Silver linings and affirmations hurt the
// people who are already low; accepting a feeling protects them.
var cheerPattern = regexp.MustCompile(`(?i)\b(everything happens for a reason|silver linings?|look on the bright side|stay positive|good vibes( only)?|what doesn't kill you)\b`)

// identityPromptPattern finds a prompt that asks which group someone belongs
// to. The app asks what people did, never which religion, party, ethnicity
// or nationality they hold, and never stores it.
var identityPromptPattern = regexp.MustCompile(`(?i)\b(which|what) (religion|political party|ethnicity|race|nationality|caste|tribe|denomination) (are|do|is|were|did|does)\b|\b(which|what) party do you (vote|support|back)\b`)

// broodingPromptPattern finds the abstract "why am I like this?" that the
// research ties to brooding in people who are already low. Ask about a
// moment instead.
var broodingPromptPattern = regexp.MustCompile(`(?i)\b(why am i like this|why are you like this|what'?s wrong with (you|me))\b`)

// phraseCaps are phrases the cards had leaned on until they all began to
// sound alike. Each may appear in at most max insight cards (reveal and
// step together) across the whole bank. Labels are not counted.
var phraseCaps = []struct {
	phrase string
	max    int
}{
	{"the one who", 15},    // was in 64 cards: "you're the one who ..."
	{"quietly", 25},        // was in 91
	{"out loud", 15},       // was in 60
	{"the friend who", 10}, // was in 19: the obvious stand-in for "the one who"
	{"you're the one", 20}, // was in 35: the other one
}

// phraseCapPatterns matches each capped phrase as whole words, in any case.
var phraseCapPatterns = func() []*regexp.Regexp {
	out := make([]*regexp.Regexp, len(phraseCaps))
	for i, c := range phraseCaps {
		out[i] = regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(c.phrase) + `\b`)
	}
	return out
}()

// checkVoice returns every voice rule a bank breaks.
func checkVoice(b bankFile) []error {
	var errs []error
	fail := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }
	capped := make([]int, len(phraseCaps))

	for _, q := range b.Questions {
		checkWording(fail, q.ID+" prompt", q.Prompt)
		if m := partnerPromptPattern.FindString(q.Prompt); m != "" {
			fail("%s: prompt presumes a partner (%q); ask about \"a partner\" or offer a way out", q.ID, m)
		}
		if m := identityPromptPattern.FindString(q.Prompt); m != "" {
			fail("%s: prompt asks which group someone belongs to (%q); ask what they did instead", q.ID, m)
		}
		if m := broodingPromptPattern.FindString(q.Prompt); m != "" {
			fail("%s: prompt asks an abstract why (%q); ask about a moment instead", q.ID, m)
		}
		for _, o := range q.Options {
			ow := q.ID + "/" + o.ID
			in := o.Insight

			checkWording(fail, ow+" label", o.Label)
			if m := loadedLabelPattern.FindString(o.Label); m != "" {
				fail("%s: label uses the loaded word %q; name what you do and let the card say what it means", ow, m)
			}

			for _, f := range []struct{ name, text string }{{"reveal", in.Reveal}, {"other side", in.OtherSide}, {"step", in.Step}} {
				where, s := ow+" "+f.name, f.text
				checkWording(fail, where, s)
				if m := findComparison(s); m != "" {
					fail("%s: compares you with other people (%q); say it about you alone", where, m)
				}
				if m := guessOpenerPattern.FindString(s); m != "" {
					fail("%s: guesses with %q; say what the answer shows instead", where, strings.TrimLeft(m, ".!?:; "))
				}
				if m := tagQuestionPattern.FindString(s); m != "" {
					fail("%s: ends on a tag question (%q); say it plainly", where, strings.TrimLeft(m, ", "))
				}
			}

			if n := len(hedgePattern.FindAllString(in.Reveal, -1)); n > maxHedges {
				fail("%s: reveal hedges %d times (%s); notice more, guess less: at most %d", ow, n,
					strings.Join(hedgePattern.FindAllString(in.Reveal, -1), ", "), maxHedges)
			}
			if n := len(hedgePattern.FindAllString(in.OtherSide, -1)); n > maxHedges {
				fail("%s: other side hedges %d times; at most %d", ow, n, maxHedges)
			}
			if m := inventedPattern.FindString(in.Reveal + " " + in.OtherSide); m != "" {
				fail("%s: reveal invents a detail of your life (%q); stay with what the answer shows", ow, m)
			}
			if m := headlinePattern.FindStringSubmatch(in.Reveal); m != nil && !readerPattern.MatchString(m[1]) {
				fail("%s: headline must speak to the reader (you, your): %q", ow, m[1])
			}

			card := in.Reveal + "\n" + in.OtherSide + "\n" + in.Step
			for i, p := range phraseCapPatterns {
				if p.MatchString(card) {
					capped[i]++
				}
			}
		}
	}

	for i, c := range phraseCaps {
		if capped[i] > c.max {
			fail("bank: %q appears in %d cards, at most %d; find a fresher way to say it", c.phrase, capped[i], c.max)
		}
	}
	return errs
}

// checkWording applies the rules every visible string shares: UK spelling and
// no "ok" or "okay".
func checkWording(fail func(string, ...any), where, s string) {
	if m := okayPattern.FindString(s); m != "" {
		fail("%s: says %q; say \"all right\" or \"fine\"", where, m)
	}
	if m := usSpelling(s); m != "" {
		fail("%s: uses the US spelling %q; the bank is UK English", where, m)
	}
	if m := promisePattern.FindString(s); m != "" {
		fail("%s: promises too much (%q); promise noticing and small shifts", where, m)
	}
	if m := cheerPattern.FindString(s); m != "" {
		fail("%s: forced cheer (%q); accept the feeling instead", where, m)
	}
}

// findComparison returns the first phrase in s that measures the reader
// against other people, or "".
func findComparison(s string) string {
	if m := comparisonPattern.FindString(s); m != "" {
		return m
	}
	for _, p := range comparisonExceptions {
		for _, m := range p.FindAllStringSubmatch(s, -1) {
			if m[1] == "" {
				return m[0]
			}
		}
	}
	return ""
}

// usSpelling returns the first American spelling in s, or "".
func usSpelling(s string) string {
	if m := usSpellingPattern.FindString(s); m != "" {
		return m
	}
	for _, m := range usIzePattern.FindAllString(s, -1) {
		if !notIze[strings.ToLower(m)] {
			return m
		}
	}
	return ""
}
