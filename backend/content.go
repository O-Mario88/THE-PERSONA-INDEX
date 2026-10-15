package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"regexp"
	"slices"
	"strings"
	"time"
)

// The question bank: every question, answer option and insight card the app
// can show, shipped inside the binary. Each day three questions are picked
// automatically (see contentBank.GetSet), and validateBank is the automated
// quality gate that replaces manual approval: the server refuses to start and
// the tests fail if any card breaks a content rule.

//go:embed content/questions.json
var questionsJSON []byte

// Insight is the card shown right after someone taps an option.
type Insight struct {
	Reveal      string `json:"reveal"`
	Research    string `json:"research,omitempty"`
	SourceTitle string `json:"sourceTitle,omitempty"`
	SourceURL   string `json:"sourceUrl,omitempty"`
	Strength    string `json:"strength,omitempty"` // strong | moderate | early; absent when there is no research
	Step        string `json:"step"`
}

// FollowUp is the evening question that goes back to a morning one: how did
// today actually go? Its answers stay on the phone and are never sent, so a
// person's morning and evening answers are never joined anywhere but there.
type FollowUp struct {
	Prompt  string           `json:"prompt"`
	Options []FollowUpOption `json:"options"`
}

type FollowUpOption struct {
	ID         string         `json:"id"`
	Label      string         `json:"label"`
	Traits     map[string]int `json:"traits,omitempty"`
	Reflection string         `json:"reflection"` // shown after the tap, in place of an insight card
}

type bankFile struct {
	Questions []bankQuestion `json:"questions"`
}

type bankQuestion struct {
	ID       string       `json:"id"`
	Theme    string       `json:"theme"`
	Prompt   string       `json:"prompt"`
	Options  []bankOption `json:"options"`
	FollowUp FollowUp     `json:"followUp"`
}

type bankOption struct {
	ID      string         `json:"id"`
	Label   string         `json:"label"`
	Depth   int            `json:"depth"` // 1 = light answer, 4 = most revealing; ordered shallow to deep
	Traits  map[string]int `json:"traits,omitempty"`
	Insight bankInsight    `json:"insight"`
}

type bankInsight struct {
	Reveal   string `json:"reveal"`
	Research string `json:"research"`
	Source   string `json:"source"`
	Strength string `json:"strength"`
	Step     string `json:"step"`
}

// Care levels. Intimate questions are held back from the daily set until the
// 18+ opt-in exists in the app.
const (
	careEveryday = "everyday"
	carePersonal = "personal"
	careIntimate = "intimate"
)

type themeInfo struct{ area, care string }

// Each theme's display name, icon and colors live in frontend/src/themes.ts;
// TestThemesMatchTheFrontend keeps the two lists in step.
var themes = map[string]themeInfo{
	"habits":           {"everyday", careEveryday},
	"sleep-health":     {"everyday", careEveryday},
	"money":            {"everyday", careEveryday},
	"work-career":      {"everyday", careEveryday},
	"learning":         {"everyday", careEveryday},
	"school":           {"everyday", careEveryday},
	"home":             {"everyday", careEveryday},
	"food":             {"everyday", careEveryday},
	"phone":            {"everyday", careEveryday},
	"getting-around":   {"everyday", careEveryday},
	"body":             {"everyday", careEveryday},
	"friendship":       {"people", carePersonal},
	"family":           {"people", carePersonal},
	"relatives":        {"people", carePersonal},
	"parenting":        {"people", carePersonal},
	"partnership":      {"people", carePersonal},
	"dating":           {"people", carePersonal},
	"neighbours":       {"people", carePersonal},
	"colleagues":       {"people", carePersonal},
	"helping":          {"people", carePersonal},
	"happiness":        {"inner", carePersonal},
	"sadness-stress":   {"inner", carePersonal},
	"anger":            {"inner", carePersonal},
	"honesty":          {"inner", carePersonal},
	"faith":            {"inner", carePersonal},
	"confidence":       {"inner", carePersonal},
	"quality-quantity": {"desire", careEveryday},
	"wealth-luxury":    {"desire", careEveryday},
	"ambition-desire":  {"desire", careEveryday},
	"celebrations":     {"desire", careEveryday},
	"plans":            {"desire", careEveryday},
	"rest":             {"desire", careEveryday},
	"intimacy":         {"desire", careIntimate},
}

// areas is the fixed order the daily set follows.
var areas = []string{"everyday", "people", "inner", "desire"}

// source is one entry of the citation library (content/sources.json): the
// only research a card may cite. Each entry was checked against its source;
// cards restate the claim, never add to it. The library is built from the
// shared evidence library, so it holds only what the cards cite.
type source struct {
	Title    string `json:"title"`
	URL      string `json:"url"`
	Strength string `json:"strength"` // strong | moderate | early
}

//go:embed content/sources.json
var sourcesJSON []byte

var sources = func() map[string]source {
	var m map[string]source
	if err := decodeStrict(sourcesJSON, &m); err != nil {
		panic(fmt.Sprintf("citation library: %v", err))
	}
	return m
}()

var traitKeys = map[string]bool{
	"openness": true, "conscientiousness": true, "extraversion": true, "agreeableness": true,
	"neuroticism": true, "honesty_humility": true, "attachment_anxiety": true,
	"attachment_avoidance": true, "present_bias": true, "rumination": true, "materialism": true,
}

var (
	idPattern     = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	bannedPattern = regexp.MustCompile(`(?i)\b(disorder|depressed|depression|narcissist\w*|psychopath\w*|sociopath\w*|bipolar|adhd|autism|autistic|ocd|trauma\w*|toxic|diagnos\w*|clinical|` +
		// The app is a guide for self-reflection and never presents itself as a clinician.
		`therap(y|ies|ists?)|psychologists?|psychiatrists?|counsell?ors?)\b`)
	// The app never feels like a survey: no agree/disagree answers, no rating scales.
	surveyLabel  = regexp.MustCompile(`(?i)^\s*((strongly\s+)?(agree|disagree)|neutral|not sure)\s*$|on a scale`)
	surveyPrompt = regexp.MustCompile(`(?i)on a scale|do you agree|how much do you agree|rate yourself`)
	// Cards may not state statistics of their own: numbers with % only appear in cited research.
	statPattern     = regexp.MustCompile(`\d\s*%|\bpercent\b`)
	currencyPattern = regexp.MustCompile(`[$€£¥₹₦]`)
	readerPattern   = regexp.MustCompile(`(?i)\byou(r|rs|rself|'re|'ve|'d|'ll)?\b`)
	// Research is only ever stated in the research field, with its source.
	claimPattern = regexp.MustCompile(`(?i)\b(stud(y|ies)|research(ers)?|scientists?|experiments?|proven)\b`)
	// The card's first sentence is its headline (frontend/src/reveal.ts splits it the same way).
	headlinePattern = regexp.MustCompile(`(?s)^(.+?[.!?])\s+\S`)
	// Cards talk like a person, not a report: the old formula openers are gone for good.
	formulaPattern = regexp.MustCompile(`(?i)^(your (response|answer|choice) (indicates|points|suggests|reflects|shows)|this (answer|choice|response) (indicates|reflects|suggests|shows)|choosing this (suggests|shows))\b|\b(individuals with|this orientation)\b|(^|[.!?]\s+)people like (this|you) tend\b`)
)

// maxHeadline keeps the headline to one glanceable line on a phone.
const maxHeadline = 70

// minPerTheme keeps the daily mix varied; a theme thinner than this fails validation.
const minPerTheme = 5

// validateBank returns every content rule a bank breaks. An empty result means
// the bank is safe to serve without anyone reviewing it by hand.
func validateBank(b bankFile) []error {
	var errs []error
	fail := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }
	ids := map[string]bool{}
	perTheme := map[string]int{}
	followUpPrompts := map[string]string{}

	for _, q := range b.Questions {
		where := q.ID
		if !idPattern.MatchString(q.ID) || len(q.ID) > 40 {
			fail("%s: id must be kebab-case, at most 40 characters", where)
		}
		if ids[q.ID] {
			fail("%s: duplicate question id", where)
		}
		ids[q.ID] = true
		if _, ok := themes[q.Theme]; !ok {
			fail("%s: unknown theme %q", where, q.Theme)
		}
		perTheme[q.Theme]++
		checkText(fail, where+" prompt", q.Prompt, 10, 100)
		if surveyPrompt.MatchString(q.Prompt) {
			fail("%s: prompt reads like a survey scale", where)
		}
		if n := len(q.Options); n < 3 || n > 4 {
			fail("%s: needs 3 or 4 options, has %d", where, n)
		}

		optIDs := map[string]bool{}
		reveals := map[string]bool{}
		prevDepth, cited := 0, 0
		for i, o := range q.Options {
			ow := fmt.Sprintf("%s/%s", q.ID, o.ID)
			if !idPattern.MatchString(o.ID) || len(o.ID) > 24 {
				fail("%s: option id must be kebab-case, at most 24 characters", ow)
			}
			if optIDs[o.ID] {
				fail("%s: duplicate option id", ow)
			}
			optIDs[o.ID] = true
			checkText(fail, ow+" label", o.Label, 1, 60)
			if surveyLabel.MatchString(o.Label) {
				fail("%s: label reads like a survey scale", ow)
			}
			if o.Depth < 1 || o.Depth > 4 || o.Depth < prevDepth || (i == 0 && o.Depth != 1) {
				fail("%s: depth %d breaks the shallow-to-deep order", ow, o.Depth)
			}
			prevDepth = o.Depth
			if len(o.Traits) > 2 {
				fail("%s: at most 2 trait weights", ow)
			}
			for k, w := range o.Traits {
				if !traitKeys[k] || w == 0 || w < -2 || w > 2 {
					fail("%s: bad trait weight %s=%d", ow, k, w)
				}
			}

			in := o.Insight
			// A reveal reads the person's own answer back to them, then says how
			// people with that leaning tend to act, in two or three sentences.
			checkText(fail, ow+" reveal", in.Reveal, 120, 360)
			if !readerPattern.MatchString(in.Reveal) {
				fail("%s: reveal must speak to the reader (you, your)", ow)
			}
			if claimPattern.MatchString(in.Reveal) {
				fail("%s: reveal makes an uncited research claim; research belongs in the research field", ow)
			}
			if m := headlinePattern.FindStringSubmatch(in.Reveal); m == nil {
				fail("%s: reveal needs a short headline sentence and then more", ow)
			} else if n := len([]rune(m[1])); n > maxHeadline {
				fail("%s: headline is %d characters, at most %d", ow, n, maxHeadline)
			}
			if formulaPattern.MatchString(in.Reveal) {
				fail("%s: reveal uses a formula phrase; say it the way a person would", ow)
			}
			checkText(fail, ow+" step", in.Step, 20, 160)
			if reveals[in.Reveal] {
				fail("%s: reveal repeats another option's", ow)
			}
			reveals[in.Reveal] = true
			if statPattern.MatchString(in.Reveal) || statPattern.MatchString(in.Step) {
				fail("%s: states a statistic outside cited research", ow)
			}
			if in.Strength == "none" || in.Strength == "" {
				if in.Research != "" || in.Source != "" {
					fail("%s: research without a strength", ow)
				}
			} else {
				src, ok := sources[in.Source]
				switch {
				case !ok:
					fail("%s: cites %q, which is not in the citation library", ow, in.Source)
				case src.Strength != in.Strength:
					fail("%s: strength %q, library says %q", ow, in.Strength, src.Strength)
				}
				checkText(fail, ow+" research", in.Research, 20, 260)
				cited++
			}
		}
		if cited == 0 {
			fail("%s: no card cites the evidence library; every question needs at least one", where)
		}
		if prevDepth < 3 {
			fail("%s: the deepest option must reach depth 3 or 4", where)
		}

		validateFollowUp(fail, q.ID, q.FollowUp)
		if p := strings.TrimSpace(q.FollowUp.Prompt); p != "" {
			if other, ok := followUpPrompts[p]; ok {
				fail("%s: follow-up prompt repeats %s's; two could land on the same evening", where, other)
			}
			followUpPrompts[p] = q.ID
		}
	}

	for key, src := range sources {
		where := "source " + key
		if !idPattern.MatchString(strings.ReplaceAll(key, "_", "-")) {
			fail("%s: key must be lowercase letters, digits and dashes", where)
		}
		checkText(fail, where+" title", src.Title, 4, 80)
		if !strings.HasPrefix(src.URL, "https://") || strings.ContainsAny(src.URL, " \"<>") {
			fail("%s: url must be a plain https link", where)
		}
		if src.Strength != "strong" && src.Strength != "moderate" && src.Strength != "early" {
			fail("%s: strength %q is not strong, moderate or early", where, src.Strength)
		}
	}

	for name := range themes {
		if perTheme[name] < minPerTheme {
			fail("theme %s has %d questions, needs at least %d", name, perTheme[name], minPerTheme)
		}
	}
	return errs
}

// validateFollowUp checks a question's evening follow-up. It is lighter than
// the morning card: a short reflection that speaks to the reader, no research.
func validateFollowUp(fail func(string, ...any), qid string, f FollowUp) {
	where := qid + " follow-up"
	checkText(fail, where+" prompt", f.Prompt, 10, 120)
	if surveyPrompt.MatchString(f.Prompt) {
		fail("%s prompt reads like a survey scale", where)
	}
	if n := len(f.Options); n < 3 || n > 4 {
		fail("%s needs 3 or 4 options, has %d", where, n)
	}
	ids := map[string]bool{}
	reflections := map[string]bool{}
	for _, o := range f.Options {
		ow := fmt.Sprintf("%s/%s", where, o.ID)
		if !idPattern.MatchString(o.ID) || len(o.ID) > 24 {
			fail("%s: option id must be kebab-case, at most 24 characters", ow)
		}
		if ids[o.ID] {
			fail("%s: duplicate option id", ow)
		}
		ids[o.ID] = true
		checkText(fail, ow+" label", o.Label, 1, 60)
		if surveyLabel.MatchString(o.Label) {
			fail("%s: label reads like a survey scale", ow)
		}
		if len(o.Traits) > 2 {
			fail("%s: at most 2 trait weights", ow)
		}
		for k, w := range o.Traits {
			if !traitKeys[k] || w == 0 || w < -2 || w > 2 {
				fail("%s: bad trait weight %s=%d", ow, k, w)
			}
		}
		checkText(fail, ow+" reflection", o.Reflection, 100, 300)
		if !readerPattern.MatchString(o.Reflection) {
			fail("%s: reflection must speak to the reader (you, your)", ow)
		}
		if claimPattern.MatchString(o.Reflection) {
			fail("%s: reflection makes an uncited research claim", ow)
		}
		if statPattern.MatchString(o.Reflection) || statPattern.MatchString(o.Label) {
			fail("%s: states a statistic", ow)
		}
		if reflections[o.Reflection] {
			fail("%s: reflection repeats another option's", ow)
		}
		reflections[o.Reflection] = true
	}
}

// checkText applies the rules every visible string shares: length, no
// diagnostic labels, no currency (the audience is worldwide).
func checkText(fail func(string, ...any), where, s string, minLen, maxLen int) {
	n := len([]rune(strings.TrimSpace(s)))
	if n < minLen || n > maxLen {
		fail("%s: %d characters, want %d to %d", where, n, minLen, maxLen)
	}
	if m := bannedPattern.FindString(s); m != "" {
		fail("%s: uses banned word %q", where, m)
	}
	if currencyPattern.MatchString(s) {
		fail("%s: uses a currency symbol", where)
	}
}

// decodeStrict rejects unknown fields, so a misspelt key in the bank fails loudly.
func decodeStrict(raw []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

// contentBank serves daily sets from the question bank.
type contentBank struct {
	byArea   map[string][]bankQuestion // daily-eligible questions per area, sorted by id
	intimate []bankQuestion            // pool-only questions for adults who opted in, sorted by id
}

func loadContentBank(raw []byte) (contentBank, error) {
	var f bankFile
	if err := decodeStrict(raw, &f); err != nil {
		return contentBank{}, fmt.Errorf("question bank: %w", err)
	}
	if errs := validateBank(f); len(errs) > 0 {
		return contentBank{}, fmt.Errorf("question bank fails %d checks, first: %w", len(errs), errs[0])
	}
	b := contentBank{byArea: map[string][]bankQuestion{}}
	for _, q := range f.Questions {
		t := themes[q.Theme]
		if t.care == careIntimate {
			b.intimate = append(b.intimate, q)
			continue
		}
		b.byArea[t.area] = append(b.byArea[t.area], q)
	}
	slices.SortFunc(b.intimate, func(x, y bankQuestion) int { return strings.Compare(x.ID, y.ID) })
	for _, a := range areas {
		slices.SortFunc(b.byArea[a], func(x, y bankQuestion) int { return strings.Compare(x.ID, y.ID) })
		if len(b.byArea[a]) == 0 {
			return contentBank{}, fmt.Errorf("question bank: area %s has no daily questions", a)
		}
	}
	return b, nil
}

// The week: Monday to Saturday bring three questions in the morning and three
// in the afternoon; Sunday brings none and is the day for the weekly mirror.
const halves = 2 // 0 the morning, 1 the afternoon

// questionDay numbers the days that bring questions, counting from
// 1970-01-01 (unix day 0), so a Sunday never uses up a question. It is -1 for
// a Sunday.
func questionDay(d int) int {
	if d < 0 || (d+4)%7 == 0 { // 1970-01-01 was a Thursday
		return -1
	}
	return d - (d+3)/7 // minus the Sundays before d
}

// GetSet picks the day's questions: three for the morning and three for the
// afternoon. The pick is random-looking but deterministic: the same date
// always gives the same set, so every server instance and every player sees
// the same edition. Each half draws from three of the four life areas, the
// two halves resting different areas, so every area comes up every day; within
// an area no question repeats until every question in that area has been used.
func (b contentBank) GetSet(date string) (DailySet, bool) {
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return DailySet{}, false
	}
	d := int(day.Unix() / 86400)
	if d < 0 {
		return DailySet{}, false
	}
	set := DailySet{Date: date}
	k := questionDay(d)
	if k < 0 {
		set.Review, set.Questions = true, []Question{} // an empty list, never null, for the phone
		return set, true
	}
	for h, half := range []*[]Question{&set.Questions, &set.Afternoon} {
		for ai, area := range areas {
			if i, ok := b.mainPick(ai, k, h); ok {
				q := b.dailyQuestion(b.byArea[area][i], date)
				*half = append(*half, q)
				set.Pool = append(set.Pool, q)
			}
		}
	}
	set.Pool = append(set.Pool, b.poolExtras(k, date)...)
	return set, true
}

// rests reports whether area ai sits out half h of question day k.
func rests(ai, k, h int) bool { return (k+2*h)%len(areas) == ai }

// mainPick is the index (into byArea) of area ai's default question for half
// h of question day k, or false when the area rests then.
func (b contentBank) mainPick(ai, k, h int) (int, bool) {
	if k < 0 || rests(ai, k, h) {
		return 0, false
	}
	n := len(areas)
	// Question days in [0, k) on which j%n == r.
	before := func(r int) int { return (k - r + n - 1) / n }
	// Draws of this area before day k: two halves a day, less the rests.
	slot := halves*k - before(ai) - before((ai+n-2)%n)
	if h == 1 && !rests(ai, k, 0) {
		slot++ // the morning drew first
	}
	qs := b.byArea[areas[ai]]
	// One fixed order per area, repeated cycle after cycle: a fresh shuffle per
	// cycle could put a question last in one cycle and first in the next.
	return shuffled(len(qs), areas[ai], 0)[slot%len(qs)], true
}

// The edition pool: both halves' defaults plus extras, so each phone can
// pick its own three for each half by the player's interests (computed on
// the phone). Extras come from a second fixed rotation per area, poolPerArea
// slots a day; an extra that is a default question within poolSpacing
// question days is dropped, so nobody sees a question twice in a week.
const (
	poolPerArea = 4
	poolSpacing = 6
)

func (b contentBank) poolExtras(k int, date string) []Question {
	var out []Question
	for ai, area := range areas {
		qs := b.byArea[area]
		want := poolPerArea
		near := map[int]bool{}
		for kk := k - poolSpacing; kk <= k+poolSpacing; kk++ {
			for h := range halves {
				if i, ok := b.mainPick(ai, kk, h); ok {
					near[i] = true
					if kk == k {
						want--
					}
				}
			}
		}
		order := shuffled(len(qs), area+"/pool", 0)
		for j := range want {
			if i := order[(poolPerArea*k+j)%len(qs)]; !near[i] {
				out = append(out, b.dailyQuestion(qs[i], date))
			}
		}
	}
	if len(b.intimate) > 0 {
		order := shuffled(len(b.intimate), "intimate/pool", 0)
		out = append(out, b.dailyQuestion(b.intimate[order[k%len(b.intimate)]], date))
	}
	return out
}

// shuffled is a fixed permutation of 0..n-1 for one area and cycle.
func shuffled(n int, area string, cycle int) []int {
	h := fnv.New64a()
	fmt.Fprintf(h, "%s/%d", area, cycle)
	r := rand.New(rand.NewPCG(h.Sum64(), 0x5045525341))
	return r.Perm(n)
}

// dailyQuestion turns a bank question into the API shape. Ids carry the date,
// so a question that comes round again starts with fresh votes.
func (contentBank) dailyQuestion(q bankQuestion, date string) Question {
	followUp := q.FollowUp
	out := Question{ID: date + "-" + q.ID, Theme: q.Theme, Care: themes[q.Theme].care, Prompt: q.Prompt, FollowUp: &followUp}
	for _, o := range q.Options {
		in := &Insight{Reveal: o.Insight.Reveal, Step: o.Insight.Step}
		if src, ok := sources[o.Insight.Source]; ok {
			in.Research, in.SourceTitle, in.SourceURL, in.Strength = o.Insight.Research, src.Title, src.URL, o.Insight.Strength
		}
		out.Options = append(out.Options, Option{ID: o.ID, Label: o.Label, Depth: o.Depth, Traits: o.Traits, Insight: in})
	}
	return out
}
