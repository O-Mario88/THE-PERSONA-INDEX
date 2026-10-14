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

var themes = map[string]themeInfo{
	"habits":           {"everyday", careEveryday},
	"sleep-health":     {"everyday", careEveryday},
	"money":            {"everyday", careEveryday},
	"work-career":      {"everyday", careEveryday},
	"learning":         {"everyday", careEveryday},
	"friendship":       {"people", carePersonal},
	"family":           {"people", carePersonal},
	"partnership":      {"people", carePersonal},
	"dating":           {"people", carePersonal},
	"helping":          {"people", carePersonal},
	"happiness":        {"inner", carePersonal},
	"sadness-stress":   {"inner", carePersonal},
	"anger":            {"inner", carePersonal},
	"honesty":          {"inner", carePersonal},
	"quality-quantity": {"desire", careEveryday},
	"wealth-luxury":    {"desire", careEveryday},
	"ambition-desire":  {"desire", careEveryday},
	"intimacy":         {"desire", careIntimate},
}

// areas is the fixed order the daily set follows.
var areas = []string{"everyday", "people", "inner", "desire"}

type source struct{ title, url, strength string }

// sources is the citation library: the only research a card may cite. Each
// entry was checked against its source; cards restate the claim, never add to it.
var sources = map[string]source{
	"roberts2007":       {"Roberts et al., 2007", "https://www.psychologicalscience.org/journals/perspectives/j.1745-6916.2007.00047.x/", "strong"},
	"soto2019":          {"Soto, 2019", "https://www.psychologicalscience.org/observer/new-replicability-project-bolsters-research-correlating-personality-traits-and-life-outcomes", "strong"},
	"vazire2010":        {"Vazire, 2010", "https://source.washu.edu/2010/03/others-may-know-us-better-than-we-know-ourselves-study-finds/", "moderate"},
	"ross1977":          {"Ross, Greene & House, 1977", "https://spsp.org/news-center/blog/pelham-false-consensus", "strong"},
	"fraley_ecr":        {"Fraley, adult attachment research", "https://labs.psychology.illinois.edu/~rcfraley/measures/measures.html", "strong"},
	"hexaco2005":        {"Lee, Ashton & de Vries, 2005", "https://research.vu.nl/en/publications/predicting-workplace-delinquency-and-integrity-with-the-hexaco-an/", "moderate"},
	"meier2010":         {"Meier & Sprenger, 2010", "https://www.newyorkfed.org/medialibrary/media/banking/MeierSlides_NYU.pdf", "moderate"},
	"gollwitzer2006":    {"Gollwitzer & Sheeran, 2006", "https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f", "strong"},
	"lally2010":         {"Lally et al., 2010", "https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit", "moderate"},
	"bushman2002":       {"Bushman, 2002", "https://journals.sagepub.com/doi/10.1177/0146167202289002", "moderate"},
	"muise2016":         {"Muise et al., 2016", "https://www.eurekalert.org/news-releases/654391", "moderate"},
	"gottman":           {"Gottman Institute", "https://www.gottman.com/blog/the-four-h", "moderate"},
	"vanboven2003":      {"Van Boven & Gilovich, 2003", "https://cdn.vanderbilt.edu/vu-wp0/wp-content/uploads/sites/59/2011/05/06143905/to-do-or-to-have.pdf", "moderate"},
	"dunn2008":          {"Dunn, Aknin & Norton, 2008", "https://www.nationalgeographic.com/science/article/money-can-buy-happiness-if-you-spend-it-on-other-people", "moderate"},
	"killingsworth2023": {"Killingsworth, Kahneman & Mellers, 2023", "https://sciencedaily.com/releases/2023/03/230306163006.htm", "strong"},
	"holtlunstad2010":   {"Holt-Lunstad et al., 2010", "https://journals.plos.org/plosmedicine/article/info:doi/10.1371/journal.pmed.1000316", "strong"},
}

var traitKeys = map[string]bool{
	"openness": true, "conscientiousness": true, "extraversion": true, "agreeableness": true,
	"neuroticism": true, "honesty_humility": true, "attachment_anxiety": true,
	"attachment_avoidance": true, "present_bias": true, "rumination": true, "materialism": true,
}

var (
	idPattern     = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	bannedPattern = regexp.MustCompile(`(?i)\b(disorder|depressed|depression|narcissist\w*|psychopath\w*|sociopath\w*|bipolar|adhd|autism|autistic|ocd|trauma\w*|toxic|diagnos\w*|clinical)\b`)
	// The app never feels like a survey: no agree/disagree answers, no rating scales.
	surveyLabel  = regexp.MustCompile(`(?i)^\s*((strongly\s+)?(agree|disagree)|neutral|not sure)\s*$|on a scale`)
	surveyPrompt = regexp.MustCompile(`(?i)on a scale|do you agree|how much do you agree|rate yourself`)
	// Cards may not state statistics of their own: numbers with % only appear in cited research.
	statPattern     = regexp.MustCompile(`\d\s*%|\bpercent\b`)
	currencyPattern = regexp.MustCompile(`[$€£¥₹₦]`)
)

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
		prevDepth := 0
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
			checkText(fail, ow+" reveal", in.Reveal, 40, 260)
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
				case src.strength != in.Strength:
					fail("%s: strength %q, library says %q", ow, in.Strength, src.strength)
				}
				checkText(fail, ow+" research", in.Research, 20, 260)
			}
		}
		if prevDepth < 3 {
			fail("%s: the deepest option must reach depth 3 or 4", where)
		}
	}

	for name := range themes {
		if perTheme[name] < minPerTheme {
			fail("theme %s has %d questions, needs at least %d", name, perTheme[name], minPerTheme)
		}
	}
	return errs
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
	byArea map[string][]bankQuestion // daily-eligible questions per area, sorted by id
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
			continue
		}
		b.byArea[t.area] = append(b.byArea[t.area], q)
	}
	for _, a := range areas {
		slices.SortFunc(b.byArea[a], func(x, y bankQuestion) int { return strings.Compare(x.ID, y.ID) })
		if len(b.byArea[a]) == 0 {
			return contentBank{}, fmt.Errorf("question bank: area %s has no daily questions", a)
		}
	}
	return b, nil
}

// GetSet picks the day's three questions. The pick is random-looking but
// deterministic: the same date always gives the same set, so every server
// instance and every player sees the same edition. Each day draws from three
// of the four life areas (a different one rests each day), and within an area
// no question repeats until every question in that area has been used.
func (b contentBank) GetSet(date string) (DailySet, bool) {
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return DailySet{}, false
	}
	d := int(day.Unix() / 86400)
	if d < 0 {
		return DailySet{}, false
	}
	rest := d % len(areas)
	set := DailySet{Date: date}
	for ai, area := range areas {
		if ai == rest {
			continue
		}
		qs := b.byArea[area]
		// Days before d on which this area was drawn.
		rested := 0
		if d > ai {
			rested = (d - ai + len(areas) - 1) / len(areas)
		}
		drawn := d - rested
		cycle, pos := drawn/len(qs), drawn%len(qs)
		order := shuffled(len(qs), area, cycle)
		set.Questions = append(set.Questions, b.dailyQuestion(qs[order[pos]], date))
	}
	return set, true
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
	out := Question{ID: date + "-" + q.ID, Theme: q.Theme, Prompt: q.Prompt}
	for _, o := range q.Options {
		in := &Insight{Reveal: o.Insight.Reveal, Step: o.Insight.Step}
		if src, ok := sources[o.Insight.Source]; ok {
			in.Research, in.SourceTitle, in.SourceURL, in.Strength = o.Insight.Research, src.title, src.url, o.Insight.Strength
		}
		out.Options = append(out.Options, Option{ID: o.ID, Label: o.Label, Insight: in})
	}
	return out
}
