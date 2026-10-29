package main

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"regexp"
	"slices"
	"strings"
	"sync"
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
	OtherSide   string `json:"otherSide,omitempty"` // what this answer can cost, said kindly
	Research    string `json:"research,omitempty"`
	SourceTitle string `json:"sourceTitle,omitempty"`
	SourceURL   string `json:"sourceUrl,omitempty"`
	Strength    string `json:"strength,omitempty"` // strong | moderate | early; absent when there is no research
	Step        string `json:"step"`
	// NeedStep is the second step on offer: one that serves the need the
	// answer reached for (needs.go). The person picks one, or writes their own.
	NeedStep string `json:"needStep,omitempty"`
}

type bankFile struct {
	Questions []bankQuestion `json:"questions"`
}

type bankQuestion struct {
	ID      string       `json:"id"`
	Theme   string       `json:"theme"`
	Prompt  string       `json:"prompt"`
	Options []bankOption `json:"options"`
}

type bankOption struct {
	ID      string         `json:"id"`
	Label   string         `json:"label"`
	Depth   int            `json:"depth"` // 1 = light answer, 4 = most revealing; ordered shallow to deep
	Traits  map[string]int `json:"traits,omitempty"`
	Insight bankInsight    `json:"insight"`
	// Heavy marks an answer that says the person is hopeless, left out or
	// alone with something hard. Its card stops being clever: the phone shows
	// a plain acknowledgement, the person's own people and a helpline instead
	// of the insight (the proposal of 2026-10-24, "Heavy answers point to
	// people"). Set by content review, never inferred.
	Heavy bool `json:"heavy,omitempty"`
	// Need is what the answer reaches for, one of the seven in needs.go,
	// tagged by the fixed rules in docs/writing-guide.md.
	Need string `json:"need"`
}

type bankInsight struct {
	Reveal string `json:"reveal"`
	// OtherSide is the kind sentence on what this answer can cost. Every
	// answer has one, the healthiest-looking included, so honesty is even-handed
	// (improvement proposal, 2026-10-15).
	OtherSide string `json:"otherSide,omitempty"`
	Research  string `json:"research"`
	Source    string `json:"source"`
	Strength  string `json:"strength"`
	Step      string `json:"step"`
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
		`therap(y|ies|ists?)|psychologists?|psychiatrists?|counsell?ors?|` +
		// Nor does it hand down verdicts on who someone is: it describes what
		// they did (the proposal of 2026-10-24, "How the app speaks to you").
		`people[- ]pleas\w*|scarcity mindset|burn-?out|anxious attachment|avoidant|codependen\w*|neurotic|workaholics?|control freaks?|perfectionists?|introverts?|extroverts?|commitment[- ]phob\w*|gaslight\w*)\b`)
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

	for _, q := range b.Questions {
		perTheme[q.Theme]++
		checkQuestion(fail, q, ids)
	}

	checkSources(fail)

	for need, step := range needSteps {
		checkText(fail, "need step "+need, step, 20, 160)
	}

	for name := range themes {
		if perTheme[name] < minPerTheme {
			fail("theme %s has %d questions, needs at least %d", name, perTheme[name], minPerTheme)
		}
	}
	errs = append(errs, checkVoice(b)...)
	return errs
}

// checkSources holds every entry of the citation library to its format.
func checkSources(fail func(string, ...any)) {
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
}

// checkQuestion applies every rule one question and its cards must pass. ids
// holds the question ids seen so far, across every bank checked together.
const (
	minOptions = 3
	maxOptions = 6
)

func checkQuestion(fail func(string, ...any), q bankQuestion, ids map[string]bool) {
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
	checkText(fail, where+" prompt", q.Prompt, 10, 100)
	if surveyPrompt.MatchString(q.Prompt) {
		fail("%s: prompt reads like a survey scale", where)
	}
	// Three to six answers (Edwin, 2026-10-25: "the questions can have more
	// than 3 answer options"). Friend questions keep exactly four (friends.go).
	if n := len(q.Options); n < minOptions || n > maxOptions {
		fail("%s: needs %d to %d options, has %d", where, minOptions, maxOptions, n)
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
		if o.Heavy && (o.Depth < 3 || themes[q.Theme].care == careIntimate) {
			fail("%s: only a deep answer outside intimacy can be heavy", ow)
		}
		if !validNeed(o.Need) {
			fail("%s: need %q is not one of the seven in needs.go", ow, o.Need)
		}
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
		checkOtherSide(fail, ow, in)
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

// softPattern finds the words that keep a claim modest.
var softPattern = regexp.MustCompile(`(?i)\b(probably|likely|tends? to|tended to|may|might|perhaps|maybe|can|could|often|sometimes|for some|some people)\b`)

// checkOtherSide holds an answer's other side to the card rules: one or two
// short sentences to the reader, no research claim, nothing the reveal
// already says, and soft wording when the card's evidence is early.
func checkOtherSide(fail func(string, ...any), ow string, in bankInsight) {
	where := ow + " other side"
	checkText(fail, where, in.OtherSide, 40, 200)
	if !readerPattern.MatchString(in.OtherSide) {
		fail("%s: must speak to the reader (you, your)", where)
	}
	if claimPattern.MatchString(in.OtherSide) {
		fail("%s: makes a research claim; research belongs in the research field", where)
	}
	if statPattern.MatchString(in.OtherSide) {
		fail("%s: states a statistic", where)
	}
	if t := strings.TrimSpace(in.OtherSide); t != "" && strings.Contains(in.Reveal, t) {
		fail("%s: repeats the reveal; say what the answer can cost", where)
	}
	if in.Strength == "early" && !softPattern.MatchString(in.Reveal) {
		fail("%s reveal: the evidence is early, so say it softly (can, may, often, tends to)", ow)
	}
}

// decodeStrict rejects unknown fields, so a misspelt key in the bank fails loudly.
func decodeStrict(raw []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

// contentBank serves daily sets from the question bank, dealt by the frozen
// schedule (schedule.go).
type contentBank struct {
	byArea   map[string][]bankQuestion // daily-eligible questions per area, sorted by id
	order    map[string][]int          // each area's fixed draw order, indexes into byArea
	intimate []bankQuestion            // pool-only questions for adults who opted in, sorted by id
	byID     map[string]*bankQuestion  // every question, pointing into byArea and intimate

	plan      []planDay      // consecutive question days from the epoch
	planIndex map[string]int // date -> index into plan
	fileEnd   time.Time      // the last date the committed schedule freezes
}

// loadContentBank loads the bank and its schedule (nil: deal every date
// afresh, for test banks). The server refuses to start on any error.
func loadContentBank(raw, schedule []byte) (contentBank, error) {
	b, err := parseContentBank(raw)
	if err != nil {
		return contentBank{}, err
	}
	if err := b.applySchedule(schedule); err != nil {
		return contentBank{}, err
	}
	return b, nil
}

// loadShippedBank is the bank and schedule built into the binary.
func loadShippedBank() (contentBank, error) { return loadContentBank(questionsJSON, scheduleJSON) }

// passedGate remembers, by SHA-256, the bank files that have passed the
// quality gate, so a process that loads the same bank more than once (the
// schedule command, the tests) checks it once. The gate reads only the file
// and the embedded sources, so the same bytes always get the same answer.
var passedGate sync.Map

// parseContentBank checks the bank against the quality gate and indexes it,
// without dealing any dates.
func parseContentBank(raw []byte) (contentBank, error) {
	var f bankFile
	if err := decodeStrict(raw, &f); err != nil {
		return contentBank{}, fmt.Errorf("question bank: %w", err)
	}
	sum := sha256.Sum256(raw)
	if _, ok := passedGate.Load(sum); !ok {
		if errs := validateBank(f); len(errs) > 0 {
			return contentBank{}, fmt.Errorf("question bank fails %d checks, first: %w", len(errs), errs[0])
		}
		passedGate.Store(sum, true)
	}
	return indexBank(f)
}

// indexBank indexes a bank that has passed the gate.
func indexBank(f bankFile) (contentBank, error) {
	b := contentBank{byArea: map[string][]bankQuestion{}, order: map[string][]int{}, byID: map[string]*bankQuestion{}}
	for _, q := range f.Questions {
		t := themes[q.Theme]
		if t.care == careIntimate {
			b.intimate = append(b.intimate, q)
			continue
		}
		b.byArea[t.area] = append(b.byArea[t.area], q)
	}
	slices.SortFunc(b.intimate, func(x, y bankQuestion) int { return strings.Compare(x.ID, y.ID) })
	for i := range b.intimate {
		b.byID[b.intimate[i].ID] = &b.intimate[i]
	}
	for _, a := range areas {
		qs := b.byArea[a]
		slices.SortFunc(qs, func(x, y bankQuestion) int { return strings.Compare(x.ID, y.ID) })
		if len(qs) == 0 {
			return contentBank{}, fmt.Errorf("question bank: area %s has no daily questions", a)
		}
		for i := range qs {
			b.byID[qs[i].ID] = &qs[i]
		}
		// One fixed order per area, repeated cycle after cycle: a fresh shuffle
		// per cycle could put a question last in one cycle and first in the next.
		b.order[a] = spreadThemes(shuffled(len(qs), a, 0), qs)
	}
	return b, nil
}

// The week: Monday to Saturday bring three questions for the morning (5 am to
// 4:30 pm on the phone) and three more for the evening (5 pm to midnight);
// Sunday brings none and is the day for the weekly mirror.

// questionDay numbers the days that bring questions, counting from
// 1970-01-01 (unix day 0), so a Sunday never uses up a question. It is -1 for
// a Sunday.
func questionDay(d int) int {
	if d < 0 || (d+4)%7 == 0 { // 1970-01-01 was a Thursday
		return -1
	}
	return d - (d+3)/7 // minus the Sundays before d
}

// rests reports whether area ai sits out half h of question day k. Each half
// draws from three of the four life areas, the two halves resting different
// areas, so every area comes up every day.
func rests(ai, k, h int) bool { return (k+2*h)%len(areas) == ai }

// GetSet is the date's questions as the schedule froze them: three for the
// morning, three for the evening, and the pool the phone picks its own from.
// Every server instance and every person sees the same edition. There is no
// set before edition 1.
func (b contentBank) GetSet(date string) (DailySet, bool) {
	day, err := time.Parse(dateLayout, date)
	if err != nil || day.Format(dateLayout) != date || date < editionEpoch {
		return DailySet{}, false
	}
	set := DailySet{Date: date}
	if day.Weekday() == time.Sunday {
		set.Review, set.Questions = true, []Question{} // an empty list, never null, for the phone
		return set, true
	}
	i, ok := b.planIndex[date]
	if !ok {
		return DailySet{}, false
	}
	p := b.plan[i]
	for _, q := range p.morning {
		set.Questions = append(set.Questions, b.dailyQuestion(*q, date))
	}
	for _, q := range p.evening {
		set.Evening = append(set.Evening, b.dailyQuestion(*q, date))
	}
	set.Pool = append(append(set.Pool, set.Questions...), set.Evening...)
	for _, q := range p.extras {
		set.Pool = append(set.Pool, b.dailyQuestion(*q, date))
	}
	if p.intimate != nil {
		set.Pool = append(set.Pool, b.dailyQuestion(*p.intimate, date))
	}
	return set, true
}

// Question finds a question by its dated id, whichever date's pool it came
// from, so a person's stored answers always find their question while the
// bank keeps it.
func (b contentBank) Question(id string) (Question, bool) {
	if len(id) < len(dateLayout)+2 || id[len(dateLayout)] != '-' {
		return Question{}, false
	}
	date, bankID := id[:len(dateLayout)], id[len(dateLayout)+1:]
	if d, err := time.Parse(dateLayout, date); err != nil || d.Format(dateLayout) != date {
		return Question{}, false
	}
	q := b.byID[bankID]
	if q == nil {
		return Question{}, false
	}
	return b.dailyQuestion(*q, date), true
}

// spreadThemes reorders a shuffled area so that neighbours never share a
// theme, the last and the first included: an area drawn in both halves of a
// day takes two neighbouring places, and the order repeats cycle after cycle.
// It takes the theme with the most questions left, other than the one just
// used; ties go to whichever comes first in the shuffle.
func spreadThemes(order []int, qs []bankQuestion) []int {
	left := map[string][]int{} // each theme's questions still to place, in shuffle order
	var themeOrder []string
	for _, i := range order {
		t := qs[i].Theme
		if len(left[t]) == 0 {
			themeOrder = append(themeOrder, t)
		}
		left[t] = append(left[t], i)
	}
	pos := make([]int, len(qs))
	for p, i := range order {
		pos[i] = p
	}
	out := make([]int, 0, len(order))
	prev := ""
	for len(out) < len(order) {
		best := ""
		for _, t := range themeOrder {
			if len(left[t]) == 0 || t == prev {
				continue
			}
			if best == "" || len(left[t]) > len(left[best]) ||
				(len(left[t]) == len(left[best]) && pos[left[t][0]] < pos[left[best][0]]) {
				best = t
			}
		}
		if best == "" { // only the theme just used is left
			best = prev
		}
		out = append(out, left[best][0])
		left[best] = left[best][1:]
		prev = best
	}
	// Close the circle: if the last shares the first's theme, move it to the
	// first gap between two other themes.
	theme := func(j int) string { return qs[out[j]].Theme }
	if n := len(out); n > 2 && theme(n-1) == theme(0) {
		t := theme(n - 1)
		for j := 1; j+1 < n-1; j++ {
			if theme(j) != t && theme(j+1) != t {
				last := out[n-1]
				out = slices.Insert(out[:n-1], j+1, last)
				break
			}
		}
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
	out := Question{ID: date + "-" + q.ID, Theme: q.Theme, Care: themes[q.Theme].care, Prompt: q.Prompt}
	for _, o := range q.Options {
		in := &Insight{Reveal: o.Insight.Reveal, OtherSide: o.Insight.OtherSide, Step: o.Insight.Step, NeedStep: needSteps[o.Need]}
		if src, ok := sources[o.Insight.Source]; ok {
			in.Research, in.SourceTitle, in.SourceURL, in.Strength = o.Insight.Research, src.Title, src.URL, o.Insight.Strength
		}
		out.Options = append(out.Options, Option{ID: o.ID, Label: o.Label, Depth: o.Depth, Heavy: o.Heavy, Need: o.Need, Traits: o.Traits, Insight: in})
	}
	return out
}
