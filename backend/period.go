package main

import (
	"cmp"
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"
)

// The monthly, quarterly and yearly mirrors (Edwin, 2026-10-15). Answers are
// kept five weeks (mirrorRetention), so once a week is over it is folded into
// one small summary per phone (WeekSummary), kept weekSummaryRetention.
// GET /api/mirror/{period} adds up the summaries of the period's weeks, and
// summarises the weeks not folded yet from the kept answers the same way, so a
// week reads the same before and after it is folded.
//
// A week belongs to the month, quarter and year that hold its Thursday, as ISO
// weeks belong to years, so every week is in exactly one of each.
//
// Like the weekly mirror, a period is built from the phone's own rows alone
// and set only against its own past: its own weeks, and the month or quarter
// before. Nothing another phone answers changes it. Trait reads are the mean
// position over the period's answers (scoring version 1, mirror.go). A week
// with no record (before summaries began, or never folded before its answers
// went) is marked, never counted as a week off.

const (
	// A week folds once a full week has passed since its Sunday: votes on it
	// are final and its steps have had a week to be marked.
	foldAfterDays = 14  // days from a week's Monday until it folds
	foldBatch     = 100 // summaries per write; each takes its phone's lock
	// Thirteen months: a whole ISO year of weeks, readable through the January
	// after it ends.
	weekSummaryRetention = 400 * 24 * time.Hour
	periodMoments        = 3
	periodHelped         = 6
	// An answer is a moment when its option sits at least this far from the
	// middle of the question's options on a trait it carries (0 the middle,
	// 1 an end): in the outer quarter at either end.
	momentLean = 0.5
)

var periods = []string{"month", "quarter", "year"}

// PeriodMirror is the response of GET /api/mirror/{period}?date=YYYY-MM-DD.
type PeriodMirror struct {
	Period        string        `json:"period"` // month | quarter | year
	Label         string        `json:"label"`  // 2026-10, 2026-Q4 or 2026
	Date          string        `json:"date"`
	From          string        `json:"from"` // Monday of the period's first week
	To            string        `json:"to"`   // Sunday of its last week
	WeeksTotal    int           `json:"weeksTotal"`
	Weeks         []PeriodWeek  `json:"weeks"` // up to the phone's week, oldest first
	Stats         PeriodStats   `json:"stats"`
	Previous      *PeriodStats  `json:"previous,omitempty"` // the month or quarter before, when every week of it is on record
	PreviousLabel string        `json:"previousLabel,omitempty"`
	Traits        []PeriodTrait `json:"traits"`
	Themes        []ThemeRead   `json:"themes"`
	Moments       []Moment      `json:"moments"` // the answers that said the most, deepest first
	Helped        []HelpedStep  `json:"helped"`  // newest first
}

type PeriodWeek struct {
	Monday     string `json:"monday"`
	Week       int    `json:"week"` // ISO week number
	Kept       bool   `json:"kept"` // false: no record of this week
	DaysActive int    `json:"daysActive"`
	DaysSoFar  int    `json:"daysSoFar"` // question days of the week up to the phone's date: 1 to 6
	Answers    int    `json:"answers"`
	Deepest    int    `json:"deepest"`
	StepsTried int    `json:"stepsTried"`
}

// PeriodStats add up the weeks on record.
type PeriodStats struct {
	WeeksActive  int `json:"weeksActive"`
	WeeksSoFar   int `json:"weeksSoFar"` // weeks on record so far
	DaysActive   int `json:"daysActive"`
	DaysSoFar    int `json:"daysSoFar"` // question days in them so far
	Answers      int `json:"answers"`
	Private      int `json:"private"`
	Deepest      int `json:"deepest"`
	Learned      int `json:"learned"`
	Rated        int `json:"rated"`
	StepsStarted int `json:"stepsStarted"`
	StepsTried   int `json:"stepsTried"`
	StepsHelped  int `json:"stepsHelped"`
}

type PeriodTrait struct {
	Trait   string      `json:"trait"`
	Answers int         `json:"answers"`
	Solid   bool        `json:"solid"`
	Score   int         `json:"score"`            // 0..100, the mean position over the period
	Weekly  []WeekScore `json:"weekly"`           // one per week so far
	Change  *int        `json:"change,omitempty"` // the later weeks with a read against the earlier ones
}

// Moment is one of the answers that said the most about the person, in its
// own words with the headline of the card it showed: an answer whose option
// leans clearly on a trait it carries, ranked by how deep it went. The words
// are kept because a bank that grows deals past dates new questions. Never a
// private answer.
type Moment struct {
	Prompt   string  `json:"prompt"`
	Label    string  `json:"label"`
	Headline string  `json:"headline"` // the insight card's first sentence
	Theme    string  `json:"theme"`
	Lean     float64 `json:"lean"` // momentLean to 1: how far from the middle of the options
	Depth    int     `json:"depth"`
	Date     string  `json:"date"`
	Edition  int     `json:"edition"`
}

type HelpedStep struct {
	Theme   string `json:"theme"`
	Step    string `json:"step"`
	Started string `json:"started"`
}

// periodOf returns the Mondays of the first and last weeks of the month,
// quarter or year holding day's week, and its label.
func periodOf(kind string, day time.Time) (first, last time.Time, label string) {
	monday, _ := weekOf(day.Format(dateLayout))
	thu := monday.AddDate(0, 0, 3)
	y, mo := thu.Year(), thu.Month()
	var from, to time.Time // the period's first and last calendar days
	switch kind {
	case "month":
		from = time.Date(y, mo, 1, 0, 0, 0, 0, time.UTC)
		to = from.AddDate(0, 1, -1)
		label = fmt.Sprintf("%d-%02d", y, mo)
	case "quarter":
		q := (int(mo) - 1) / 3
		from = time.Date(y, time.Month(3*q+1), 1, 0, 0, 0, 0, time.UTC)
		to = from.AddDate(0, 3, -1)
		label = fmt.Sprintf("%d-Q%d", y, q+1)
	default:
		from = time.Date(y, time.January, 1, 0, 0, 0, 0, time.UTC)
		to = time.Date(y, time.December, 31, 0, 0, 0, 0, time.UTC)
		label = fmt.Sprint(y)
	}
	firstThu := from.AddDate(0, 0, (int(time.Thursday)-int(from.Weekday())+7)%7)
	lastThu := to.AddDate(0, 0, -((int(to.Weekday()) - int(time.Thursday) + 7) % 7))
	return firstThu.AddDate(0, 0, -3), lastThu.AddDate(0, 0, -3), label
}

// keptSince is the first Monday whose week still has all its answers.
func (s *Server) keptSince() time.Time {
	cutoff := mustDate(s.clock().UTC().Add(-mirrorRetention).Format(dateLayout))
	monday, _ := weekOf(cutoff.Format(dateLayout))
	if monday.Before(cutoff) {
		monday = monday.AddDate(0, 0, 7)
	}
	return monday
}

// FoldWeeks folds every week that is ready and not folded yet: over for a full
// week, with all its answers still kept. It reports how many weeks it folded.
// Running it again folds nothing new, and a fold cut short is redone whole:
// summaries are written over, and the week is marked only once it is done.
func (s *Server) FoldWeeks(ctx context.Context) (int, error) {
	oldest := s.keptSince()
	latest := mustDate(s.clock().UTC().Format(dateLayout)).AddDate(0, 0, -foldAfterDays)
	if latest.Before(oldest) {
		return 0, nil
	}
	folded, err := s.mirror.FoldedWeeks(ctx, oldest.Format(dateLayout), latest.Format(dateLayout))
	if err != nil {
		return 0, err
	}
	n := 0
	for monday := oldest; !monday.After(latest); monday = monday.AddDate(0, 0, 7) {
		mon := monday.Format(dateLayout)
		if slices.Contains(folded, mon) {
			continue
		}
		if err := s.foldWeek(ctx, monday); err != nil {
			return n, fmt.Errorf("fold %s: %w", mon, err)
		}
		if err := s.mirror.MarkFolded(ctx, mon); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// foldWeek writes the summary of the week starting monday for every phone
// with an answer in it. Answers from the week before come along so a step
// started this week from last week's card still finds its words.
func (s *Server) foldWeek(ctx context.Context, monday time.Time) error {
	var batch []WeekSummary
	from, sun := monday.AddDate(0, 0, -7).Format(dateLayout), monday.AddDate(0, 0, 6).Format(dateLayout)
	err := s.mirror.EachDevice(ctx, from, sun, func(key string, answers []MirrorAnswer, steps []MirrorStep) error {
		w := s.summarizeWeek(key, monday, answers, steps)
		if w.Answers == 0 && w.StepsStarted == 0 {
			return nil
		}
		batch = append(batch, w)
		if len(batch) < foldBatch {
			return nil
		}
		err := s.mirror.SaveWeekSummaries(ctx, batch)
		batch = nil
		return err
	})
	if err != nil {
		return err
	}
	return s.mirror.SaveWeekSummaries(ctx, batch)
}

// summarizeWeek folds one phone's week starting monday. answers and steps may
// reach outside the week; only the week's own are counted.
func (s *Server) summarizeWeek(key string, monday time.Time, answers []MirrorAnswer, steps []MirrorStep) WeekSummary {
	mon, sun := monday.Format(dateLayout), monday.AddDate(0, 0, 6).Format(dateLayout)
	w := WeekSummary{DeviceKey: key, Monday: mon}
	all := s.resolve(answers)
	var week []answered
	days := map[string]bool{}
	for _, a := range all {
		if a.Date < mon || a.Date > sun {
			continue
		}
		week = append(week, a)
		days[a.Date] = true
		w.Answers++
		if a.deepest() {
			w.Deepest++
		}
		if a.Learned != nil {
			w.Rated++
			if *a.Learned {
				w.Learned++
			}
		}
		if a.Theme != "" {
			if w.Themes == nil {
				w.Themes = map[string]ThemeTally{}
			}
			t := w.Themes[a.Theme]
			t.N++
			if a.Private() {
				t.Private++
			} else {
				t.DepthSum += a.Depth
			}
			w.Themes[a.Theme] = t
		}
		if a.Private() {
			w.Private++
		} else if m, ok := momentOf(a); ok {
			w.Moments = append(w.Moments, m)
		}
	}
	w.DaysActive = len(days)
	w.Moments = topMoments(w.Moments)

	for trait, t := range traitSums(week, mon, sun) {
		if w.Traits == nil {
			w.Traits = map[string]TraitTally{}
		}
		w.Traits[trait] = TraitTally{N: t.n, Sum: t.sum}
	}

	byQuestion := map[string]answered{}
	for _, a := range all {
		byQuestion[a.QuestionID] = a
	}
	for _, st := range steps {
		if st.Started < mon || st.Started > sun {
			continue
		}
		w.StepsStarted++
		if st.Tried() {
			w.StepsTried++
		}
		if st.Status != stepHelped {
			continue
		}
		w.StepsHelped++
		if a, ok := byQuestion[st.QuestionID]; ok {
			if text := s.stepText(a.MirrorAnswer); text != "" {
				w.Helped = append(w.Helped, HelpedStep{Theme: a.Theme, Step: text, Started: st.Started})
			}
		}
	}
	return w
}

// momentOf reads an answer as a moment, when its option leans at least
// momentLean on one of the traits it carries.
func momentOf(a answered) (Moment, bool) {
	if !a.found {
		return Moment{}, false
	}
	o := optionOf(a.q, a.OptionID)
	if o == nil {
		return Moment{}, false
	}
	m := Moment{Prompt: a.q.Prompt, Label: o.Label, Theme: a.Theme, Depth: a.Depth, Date: a.Date, Edition: editionNumber(a.Date)}
	if o.Insight != nil {
		if h := headlinePattern.FindStringSubmatch(o.Insight.Reveal); h != nil {
			m.Headline = h[1]
		}
	}
	for trait := range o.Traits {
		if p, ok := traitPosition(a.q, a.OptionID, trait); ok {
			m.Lean = max(m.Lean, math.Round(math.Abs(p-0.5)*2*1e6)/1e6)
		}
	}
	return m, m.Lean >= momentLean
}

// topMoments keeps the periodMoments that said the most: the deepest first,
// then the clearest lean, then the newest. The order is total, so a period's
// top moments are the same whether drawn from its answers or its weeks' tops.
func topMoments(ms []Moment) []Moment {
	slices.SortFunc(ms, func(x, y Moment) int {
		if c := cmp.Compare(y.Depth, x.Depth); c != 0 {
			return c
		}
		if c := cmp.Compare(y.Lean, x.Lean); c != 0 {
			return c
		}
		if c := strings.Compare(y.Date, x.Date); c != 0 {
			return c
		}
		if c := strings.Compare(x.Prompt, y.Prompt); c != 0 {
			return c
		}
		return strings.Compare(x.Label, y.Label)
	})
	return ms[:min(len(ms), periodMoments)]
}

// periodWeeks returns one phone's summary of each week from first to last
// (Mondays), and whether each week is on record: folded, or with all its
// answers still kept. Weeks not folded yet are summarised from the kept
// answers, the same way a fold would.
func (s *Server) periodWeeks(ctx context.Context, key string, first, last time.Time) ([]WeekSummary, []bool, error) {
	f, l := first.Format(dateLayout), last.Format(dateLayout)
	folded, err := s.mirror.FoldedWeeks(ctx, f, l)
	if err != nil {
		return nil, nil, err
	}
	stored, err := s.mirror.WeekSummaries(ctx, key, f, l)
	if err != nil {
		return nil, nil, err
	}
	since := s.keptSince()
	var live []time.Time
	for m := first; !m.After(last); m = m.AddDate(0, 0, 7) {
		if !slices.Contains(folded, m.Format(dateLayout)) && !m.Before(since) {
			live = append(live, m)
		}
	}
	var history []MirrorAnswer
	var steps []MirrorStep
	if len(live) > 0 {
		from, to := live[0].AddDate(0, 0, -7).Format(dateLayout), live[len(live)-1].AddDate(0, 0, 6).Format(dateLayout)
		if history, steps, err = s.mirror.DeviceHistory(ctx, key, from, to); err != nil {
			return nil, nil, err
		}
	}
	var out []WeekSummary
	var kept []bool
	for m := first; !m.After(last); m = m.AddDate(0, 0, 7) {
		mon := m.Format(dateLayout)
		w := WeekSummary{DeviceKey: key, Monday: mon}
		on := true
		switch {
		case slices.Contains(folded, mon):
			if i := slices.IndexFunc(stored, func(x WeekSummary) bool { return x.Monday == mon }); i >= 0 {
				w = stored[i]
			}
		case slices.Contains(live, m):
			w = s.summarizeWeek(key, m, history, steps)
		default:
			on = false
		}
		out = append(out, w)
		kept = append(kept, on)
	}
	return out, kept, nil
}

// addUp totals the weeks on record; the last week has daysSoFar question days.
func addUp(ws []WeekSummary, kept []bool, daysSoFar int) PeriodStats {
	var st PeriodStats
	for i, w := range ws {
		if !kept[i] {
			continue
		}
		st.WeeksSoFar++
		if i == len(ws)-1 {
			st.DaysSoFar += daysSoFar
		} else {
			st.DaysSoFar += 6
		}
		if w.Answers > 0 {
			st.WeeksActive++
		}
		st.DaysActive += w.DaysActive
		st.Answers += w.Answers
		st.Private += w.Private
		st.Deepest += w.Deepest
		st.Learned += w.Learned
		st.Rated += w.Rated
		st.StepsStarted += w.StepsStarted
		st.StepsTried += w.StepsTried
		st.StepsHelped += w.StepsHelped
	}
	return st
}

func (s *Server) buildPeriod(ctx context.Context, key, kind, date string) (PeriodMirror, error) {
	day := mustDate(date)
	first, last, label := periodOf(kind, day)
	current, _ := weekOf(date)
	p := PeriodMirror{Period: kind, Label: label, Date: date, From: first.Format(dateLayout), To: last.AddDate(0, 0, 6).Format(dateLayout),
		WeeksTotal: int(last.Sub(first).Hours()/24)/7 + 1, Weeks: []PeriodWeek{}, Traits: []PeriodTrait{}, Themes: []ThemeRead{},
		Moments: []Moment{}, Helped: []HelpedStep{}}
	ws, kept, err := s.periodWeeks(ctx, key, first, current)
	if err != nil {
		return p, err
	}
	daysSoFar := min(int(day.Sub(current).Hours()/24)+1, 6) // Sunday brings no questions
	p.Stats = addUp(ws, kept, daysSoFar)
	for i, w := range ws {
		_, iso := mustDate(w.Monday).ISOWeek()
		pw := PeriodWeek{Monday: w.Monday, Week: iso, Kept: kept[i], DaysActive: w.DaysActive, DaysSoFar: 6, Answers: w.Answers,
			Deepest: w.Deepest, StepsTried: w.StepsTried}
		if i == len(ws)-1 {
			pw.DaysSoFar = daysSoFar
		}
		p.Weeks = append(p.Weeks, pw)
	}

	// The month or quarter before, when every week of it is on record.
	if kind != "year" {
		pf, pl, plabel := periodOf(kind, first.AddDate(0, 0, -1))
		pws, pkept, err := s.periodWeeks(ctx, key, pf, pl)
		if err != nil {
			return p, err
		}
		if !slices.Contains(pkept, false) {
			prev := addUp(pws, pkept, 6)
			p.Previous, p.PreviousLabel = &prev, plabel
		}
	}

	var on []WeekSummary
	for i, w := range ws {
		if kept[i] {
			on = append(on, w)
		}
	}
	p.Themes = periodThemes(on)
	p.Traits = periodTraits(ws, kept)
	for _, w := range on {
		p.Moments = append(p.Moments, w.Moments...)
		p.Helped = append(p.Helped, w.Helped...)
	}
	p.Moments = topMoments(p.Moments)
	slices.SortStableFunc(p.Helped, func(x, y HelpedStep) int { return strings.Compare(y.Started, x.Started) })
	p.Helped = p.Helped[:min(len(p.Helped), periodHelped)]
	return p, nil
}

func periodThemes(ws []WeekSummary) []ThemeRead {
	total := map[string]ThemeTally{}
	for _, w := range ws {
		for theme, t := range w.Themes {
			sum := total[theme]
			sum.N += t.N
			sum.Private += t.Private
			sum.DepthSum += t.DepthSum
			total[theme] = sum
		}
	}
	out := []ThemeRead{}
	for theme, t := range total {
		out = append(out, themeRead(theme, t.N, t.Private, t.DepthSum))
	}
	sortThemes(out)
	return out
}

func periodTraits(ws []WeekSummary, kept []bool) []PeriodTrait {
	names := map[string]bool{}
	for i, w := range ws {
		for trait := range w.Traits {
			if kept[i] {
				names[trait] = true
			}
		}
	}
	score := func(t traitSum) int { return int(math.Round(100 * t.mean())) }
	out := []PeriodTrait{}
	for trait := range names {
		var total traitSum
		var read []traitSum // weeks with a read, in order
		r := PeriodTrait{Trait: trait}
		for i, w := range ws {
			_, iso := mustDate(w.Monday).ISOWeek()
			t := traitSum{}
			if kept[i] {
				t = traitSum{n: w.Traits[trait].N, sum: w.Traits[trait].Sum}
			}
			ws := WeekScore{Week: iso, Solid: t.n >= solidReadAnswers}
			if t.n >= minTraitAnswers {
				sc := score(t)
				ws.Score = &sc
			}
			r.Weekly = append(r.Weekly, ws)
			if t.n > 0 {
				total.n, total.sum = total.n+t.n, total.sum+t.sum
				read = append(read, t)
			}
		}
		if total.n < minTraitAnswers {
			continue
		}
		r.Answers, r.Solid, r.Score = total.n, total.n >= solidReadAnswers, score(total)
		if len(read) >= 2 {
			var early, late traitSum
			for j, t := range read {
				if j < len(read)/2 {
					early.n, early.sum = early.n+t.n, early.sum+t.sum
				} else {
					late.n, late.sum = late.n+t.n, late.sum+t.sum
				}
			}
			if early.n >= minTraitAnswers && late.n >= minTraitAnswers {
				c := score(late) - score(early)
				r.Change = &c
			}
		}
		out = append(out, r)
	}
	slices.SortFunc(out, func(x, y PeriodTrait) int {
		if x.Solid != y.Solid {
			if x.Solid {
				return -1
			}
			return 1
		}
		if c := cmp.Compare(abs(y.Score-50), abs(x.Score-50)); c != 0 {
			return c
		}
		if c := cmp.Compare(y.Answers, x.Answers); c != 0 {
			return c
		}
		return strings.Compare(x.Trait, y.Trait)
	})
	return out
}

// MirrorPeriod is GET /api/mirror/{period}?date=YYYY-MM-DD: the month,
// quarter or year that holds date's week, for this phone.
func (s *Server) MirrorPeriod(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	deviceID, ok := s.deviceFromHeader(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	kind, date := r.PathValue("period"), r.URL.Query().Get("date")
	if !slices.Contains(periods, kind) || !s.isOpenDate(date) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	p, err := s.buildPeriod(r.Context(), s.devices.mirrorKey(deviceID), kind, date)
	if err != nil {
		log.Printf("period mirror: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, p)
}
