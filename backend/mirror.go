package main

import (
	"cmp"
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"
)

// The weekly mirror: GET /api/mirror builds one phone's week from the mirror
// store (mirrorstore.go), next to the real crowd. Every number comes from
// stored answers, steps and vote tallies. A comparison the data cannot
// support yet (too few votes on a question, too few players for a rank) is
// left out or marked early, never estimated.
//
// Trait reads, scoring version 1:
//   - For each answer whose question can show a trait (some option carries a
//     weight for it), the chosen option's position among the options: 1 for
//     the option that shows the trait most, 0 for the one that shows it
//     least, 0.5 for the options' average weight.
//   - A week's read is the mean position over that week and the two before
//     (traitWindowDays), as a score from 0 to 100. Private answers never count.
//   - Once minPlayersToRank players have minAnswersToRank answers on a trait,
//     the score becomes the player's rank among them (50 is the typical
//     player). Until then it stays the position within the options.

const (
	crowdMinVotes    = 100 // a question's split shows, and an answer is called with or against the crowd, from this many votes
	minPlayersToRank = 30  // players before reads are ranked, and before strengths compare with the crowd
	minAnswersToRank = 3   // a player's answers on a trait before they count in its ranking
	minTraitAnswers  = 2   // answers on a trait before it is read at all
	solidReadAnswers = 12  // answers on a trait before its read is called solid
	traitWindowDays  = 21  // a week's read uses that week and the two before
	crowdTTL         = 10 * time.Minute
	pastCrowdTTL     = 6 * time.Hour
)

// Mirror is the response of GET /api/mirror?date=YYYY-MM-DD.
type Mirror struct {
	Date        string `json:"date"`
	Week        int    `json:"week"`        // ISO week number
	From        string `json:"from"`        // Monday
	To          string `json:"to"`          // Sunday
	Editions    [2]int `json:"editions"`    // Monday's and Saturday's; Sunday has none
	WeeksPlayed int    `json:"weeksPlayed"` // weeks with an answer, among the five kept

	Stats      MirrorStats   `json:"stats"`
	Days       []MirrorDay   `json:"days"`  // Monday to Sunday
	Areas      []AreaRead    `json:"areas"` // in the fixed order of areas
	Rarest     *AnswerSplit  `json:"rarest,omitempty"`
	Minority   []AnswerSplit `json:"minority"` // this week's answers against the crowd, rarest first
	Divisive   *AnswerSplit  `json:"divisive,omitempty"`
	Traits     []TraitRead   `json:"traits"`
	Ranked     bool          `json:"ranked"` // at least one read is a rank among players
	Themes     []ThemeRead   `json:"themes"` // over the weeks kept
	Steps      []StepRead    `json:"steps"`  // started this week, and older ones still open
	StepRecord StepTotals    `json:"stepRecord"`
	Strengths  []Strength    `json:"strengths"`
	NextSteps  []StepOffer   `json:"nextSteps"`
	ComingUp   []string      `json:"comingUp"` // themes of the next days, never their questions
	LowMood    bool          `json:"lowMood"`
}

type MirrorStats struct {
	DaysActive         int `json:"daysActive"`
	DaysActiveLastWeek int `json:"daysActiveLastWeek"`
	DaysSoFar          int `json:"daysSoFar"` // question days of this week up to the phone's date: 1 to 6
	Answers            int `json:"answers"`   // private ones included
	Private            int `json:"private"`
	Deepest            int `json:"deepest"`  // answers that took the question's deepest option
	Minority           int `json:"minority"` // answers against the crowd (see verdicts)
	Judged             int `json:"judged"`   // answers on questions with enough votes to say
	Learned            int `json:"learned"`
	Rated              int `json:"rated"`
	StepsStarted       int `json:"stepsStarted"`
	StepsTried         int `json:"stepsTried"`
	StepsHelped        int `json:"stepsHelped"`
}

type MirrorDay struct {
	Date    string      `json:"date"`
	Edition int         `json:"edition"`
	Answers []DayAnswer `json:"answers"`
}

type DayAnswer struct {
	Theme string `json:"theme"`
	Crowd string `json:"crowd"` // with | against | early | private
}

type AreaRead struct {
	Area         string `json:"area"`
	Minority     int    `json:"minority"`
	Judged       int    `json:"judged"`
	LastMinority int    `json:"lastMinority"`
	LastJudged   int    `json:"lastJudged"`
}

// AnswerSplit is one question's real split, with the phone's own option marked.
type AnswerSplit struct {
	QuestionID string        `json:"questionId"`
	Prompt     string        `json:"prompt"`
	Theme      string        `json:"theme"`
	Edition    int           `json:"edition"`
	Total      int           `json:"total"`
	Final      bool          `json:"final"` // the question takes no more votes
	Options    []SplitOption `json:"options"`
}

type SplitOption struct {
	Label   string  `json:"label"`
	Count   int     `json:"count"`
	Percent float64 `json:"percent"`
	Yours   bool    `json:"yours,omitempty"`
}

type TraitRead struct {
	Trait    string      `json:"trait"`
	Answers  int         `json:"answers"` // answers that could show it, last three weeks
	Solid    bool        `json:"solid"`
	Score    int         `json:"score"` // 0..100, a rank among players when Ranked
	Ranked   bool        `json:"ranked"`
	Change   *int        `json:"change,omitempty"` // against last week's read
	History  []WeekScore `json:"history"`          // two weeks ago, last week, this week
	Evidence []string    `json:"evidence"`         // this week's answers that leaned this way most
	Theme    string      `json:"theme,omitempty"`  // where the first of them came from
	Edition  int         `json:"edition,omitempty"`
}

type WeekScore struct {
	Week   int  `json:"week"`
	Score  *int `json:"score,omitempty"`
	Ranked bool `json:"ranked"`
	Solid  bool `json:"solid"`
}

type ThemeRead struct {
	Theme   string `json:"theme"`
	Area    string `json:"area"`
	Answers int    `json:"answers"`
	Depth   string `json:"depth"` // light | deeper | deep | private
}

type StepRead struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	Theme      string `json:"theme"`
	Step       string `json:"step"`
	Started    string `json:"started"`
	Status     string `json:"status"`
	Edition    int    `json:"edition"`
}

type StepTotals struct {
	Started int `json:"started"`
	Tried   int `json:"tried"`
	Helped  int `json:"helped"`
}

// Strength is one number from the phone's week above the median player's.
type Strength struct {
	Kind    string  `json:"kind"` // days | deepest | minority | learned | steps
	You     int     `json:"you"`
	Median  float64 `json:"median"`
	Players int     `json:"players"`
}

type StepOffer struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	Theme      string `json:"theme"`
	Step       string `json:"step"`
	Edition    int    `json:"edition"`
}

// StepRequest is the body of POST /api/steps.
type StepRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	Status     string `json:"status"`
	Date       string `json:"date"` // the phone's date
	VoterID    string `json:"voterId"`
}

// deviceFromHeader reads "Authorization: Device <token>".
func (s *Server) deviceFromHeader(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Device ")
	if !ok {
		return "", false
	}
	return s.devices.Verify(token)
}

// isOpenDate says whether date is well formed and today somewhere.
func (s *Server) isOpenDate(date string) bool {
	d, err := time.Parse("2006-01-02", date)
	return err == nil && d.Format("2006-01-02") == date && slices.Contains(s.openDates(editionWindow), date)
}

func (s *Server) MirrorWeek(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	deviceID, ok := s.deviceFromHeader(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	date := r.URL.Query().Get("date")
	if !s.isOpenDate(date) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	m, err := s.buildMirror(r.Context(), s.devices.mirrorKey(deviceID), date)
	if err != nil {
		log.Printf("mirror: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// ForgetMirror is DELETE /api/mirror: everything kept for this phone goes.
// Anonymous vote counts stay; they cannot be traced back to it.
func (s *Server) ForgetMirror(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	deviceID, ok := s.deviceFromHeader(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if err := s.mirror.ForgetDevice(r.Context(), s.devices.mirrorKey(deviceID)); err != nil {
		log.Printf("forget: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SaveStep is POST /api/steps: start the small step on an answered card, or
// say how it went. Saving again only updates the status.
func (s *Server) SaveStep(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var req StepRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxVoteBodyBytes)).Decode(&req); err != nil ||
		req.QuestionID == "" || req.OptionID == "" || req.VoterID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	deviceID, ok := s.devices.Verify(req.VoterID)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	if !slices.Contains(stepStatuses, req.Status) || !s.isOpenDate(req.Date) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	key := s.devices.mirrorKey(deviceID)
	answers, _, err := s.mirror.DeviceHistory(r.Context(), key, "0001-01-01", "9999-12-31")
	if err != nil {
		log.Printf("step: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	i := slices.IndexFunc(answers, func(a MirrorAnswer) bool {
		return a.QuestionID == req.QuestionID && a.OptionID == req.OptionID && !a.Private()
	})
	if i < 0 || s.stepText(answers[i]) == "" {
		writeError(w, http.StatusNotFound, "unknown_answer")
		return
	}
	st := MirrorStep{DeviceKey: key, QuestionID: req.QuestionID, OptionID: req.OptionID, Started: req.Date, Status: req.Status, UpdatedAt: s.clock()}
	if err := s.mirror.SaveStep(r.Context(), st); err != nil {
		log.Printf("step: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// rememberAnswer keeps an accepted vote for the phone's mirror. A private
// (intimate) answer keeps only that it was given.
func (s *Server) rememberAnswer(ctx context.Context, deviceID string, q Question, date, optionID string) error {
	a := MirrorAnswer{DeviceKey: s.devices.mirrorKey(deviceID), QuestionID: q.ID, Date: date, Theme: q.Theme, OptionID: optionID, AnsweredAt: s.clock()}
	if q.Care == careIntimate {
		a.QuestionID, a.OptionID = s.devices.privateQuestionID(q.ID), ""
	} else if o := optionOf(q, optionID); o != nil {
		a.Depth = o.Depth
	}
	return s.mirror.SaveAnswer(ctx, a)
}

func optionOf(q Question, id string) *Option {
	for i := range q.Options {
		if q.Options[i].ID == id {
			return &q.Options[i]
		}
	}
	return nil
}

// questionCache keeps each date's questions by id, so reading many phones'
// answers does not rebuild the same editions.
type questionCache struct {
	mu     sync.Mutex
	byDate map[string]map[string]Question
}

func (s *Server) question(date, id string) (Question, bool) {
	c := &s.questions
	c.mu.Lock()
	defer c.mu.Unlock()
	qs, ok := c.byDate[date]
	if !ok {
		qs = map[string]Question{}
		if set, found := s.bank.GetSet(date); found {
			for _, q := range append(append([]Question{}, set.Questions...), set.Pool...) {
				qs[q.ID] = q
			}
		}
		if c.byDate == nil || len(c.byDate) > 64 {
			c.byDate = map[string]map[string]Question{}
		}
		c.byDate[date] = qs
	}
	q, ok := qs[id]
	return q, ok
}

func (s *Server) stepText(a MirrorAnswer) string {
	if a.Private() {
		return ""
	}
	q, ok := s.question(a.Date, a.QuestionID)
	if !ok {
		return ""
	}
	if o := optionOf(q, a.OptionID); o != nil && o.Insight != nil {
		return o.Insight.Step
	}
	return ""
}

// counts is a question's tallies, through the instance's short result cache.
func (s *Server) counts(ctx context.Context, questionID string) (map[string]int, error) {
	now := s.clock()
	if c, ok := s.resultCache.get(questionID, now); ok {
		return c, nil
	}
	c, err := s.votes.Counts(ctx, questionID)
	if err != nil {
		return nil, err
	}
	s.resultCache.put(questionID, c, now)
	return c, nil
}

// answered is a kept answer with its question, when the bank still has it.
type answered struct {
	MirrorAnswer
	q     Question
	found bool
}

func (s *Server) resolve(answers []MirrorAnswer) []answered {
	out := make([]answered, len(answers))
	for i, a := range answers {
		out[i].MirrorAnswer = a
		if !a.Private() {
			out[i].q, out[i].found = s.question(a.Date, a.QuestionID)
		}
	}
	return out
}

func (a answered) deepest() bool {
	if !a.found {
		return false
	}
	most := 0
	for _, o := range a.q.Options {
		most = max(most, o.Depth)
	}
	return most > 0 && a.Depth == most
}

// verdicts says, per question, whether an option went with the crowd: picked
// by at least an even share of players (a third of them on a three-option
// question), from the real tallies. "At least half" would put nearly every
// answer to a three- or four-option question against the crowd, the most
// common one included. Questions below crowdMinVotes get no verdict. The
// phone's share squares use the same rule (frontend/src/api.ts withCrowd).
type verdicts struct {
	s      *Server
	ctx    context.Context
	counts map[string]map[string]int
}

func (v *verdicts) load(questionID string) (map[string]int, error) {
	c, ok := v.counts[questionID]
	if !ok {
		var err error
		if c, err = v.s.counts(v.ctx, questionID); err != nil {
			return nil, err
		}
		v.counts[questionID] = c
	}
	return c, nil
}

func (v *verdicts) of(a answered) (string, error) {
	if a.Private() {
		return "private", nil
	}
	c, err := v.load(a.QuestionID)
	if err != nil {
		return "", err
	}
	total := 0
	for _, n := range c {
		total += n
	}
	switch {
	case total < crowdMinVotes:
		return "early", nil
	case c[a.OptionID]*len(a.q.Options) < total:
		return "against", nil
	default:
		return "with", nil
	}
}

func (v *verdicts) split(a answered) AnswerSplit {
	c := v.counts[a.QuestionID]
	sp := AnswerSplit{QuestionID: a.QuestionID, Prompt: a.q.Prompt, Theme: a.q.Theme, Edition: editionNumber(a.Date),
		Final: !slices.Contains(v.s.openDates(voteWindow), a.Date)}
	for _, n := range c {
		sp.Total += n
	}
	for _, o := range a.q.Options {
		sp.Options = append(sp.Options, SplitOption{Label: o.Label, Count: c[o.ID], Percent: percent(c[o.ID], sp.Total), Yours: o.ID == a.OptionID})
	}
	return sp
}

// traitPosition is where the chosen option sits for a trait among the
// question's options (scoring version 1, above). ok is false when the
// question cannot show the trait.
func traitPosition(q Question, optionID, trait string) (float64, bool) {
	var sum, lo, hi, chosen float64
	found := false
	for i, o := range q.Options {
		w := float64(o.Traits[trait])
		if i == 0 || w < lo {
			lo = w
		}
		if i == 0 || w > hi {
			hi = w
		}
		sum += w
		if o.ID == optionID {
			chosen, found = w, true
		}
	}
	if !found || hi == lo {
		return 0, false
	}
	mean := sum / float64(len(q.Options))
	if chosen >= mean {
		if hi == mean {
			return 0.5, true
		}
		return 0.5 + 0.5*(chosen-mean)/(hi-mean), true
	}
	return 0.5 - 0.5*(mean-chosen)/(mean-lo), true
}

type traitSum struct {
	n   int
	sum float64
}

// mean is rounded so the same answers always give exactly the same value,
// whichever order they were added in; ranks compare values for equality.
func (t traitSum) mean() float64 { return math.Round(t.sum/float64(t.n)*1e6) / 1e6 }

// traitSums reads every trait the answers dated in [from, to] can show.
func traitSums(answers []answered, from, to string) map[string]traitSum {
	out := map[string]traitSum{}
	for _, a := range answers {
		if !a.found || a.Date < from || a.Date > to {
			continue
		}
		for _, trait := range traitsOn(a.q) {
			if p, ok := traitPosition(a.q, a.OptionID, trait); ok {
				t := out[trait]
				t.n++
				t.sum += p
				out[trait] = t
			}
		}
	}
	return out
}

func traitsOn(q Question) []string {
	var out []string
	for _, o := range q.Options {
		for t := range o.Traits {
			if !slices.Contains(out, t) {
				out = append(out, t)
			}
		}
	}
	slices.Sort(out)
	return out
}

// rankOf is the share of values below v, counting ties as half, from 0 to 100.
func rankOf(sorted []float64, v float64) int {
	below := sort.SearchFloat64s(sorted, v)
	upTo := sort.Search(len(sorted), func(i int) bool { return sorted[i] > v })
	return int(math.Round(100 * (float64(below) + float64(upTo-below)/2) / float64(len(sorted))))
}

const dateLayout = "2006-01-02"

func weekOf(date string) (monday, sunday time.Time) {
	d, _ := time.Parse(dateLayout, date)
	monday = d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
	return monday, monday.AddDate(0, 0, 6)
}

// weekMetrics are the numbers strengths compare, for one phone and one week.
type weekMetrics struct{ days, deepest, minority, learned, steps int }

func (s *Server) metrics(v *verdicts, week []answered, steps []MirrorStep, monday, sunday string) (weekMetrics, error) {
	var m weekMetrics
	dates := map[string]bool{}
	for _, a := range week {
		dates[a.Date] = true
		if a.deepest() {
			m.deepest++
		}
		if a.Learned != nil && *a.Learned {
			m.learned++
		}
		if a.found {
			c, err := v.of(a)
			if err != nil {
				return m, err
			}
			if c == "against" {
				m.minority++
			}
		}
	}
	m.days = len(dates)
	for _, st := range steps {
		if st.Started >= monday && st.Started <= sunday && st.Tried() {
			m.steps++
		}
	}
	return m, nil
}

func (m weekMetrics) of(kind string) int {
	switch kind {
	case "days":
		return m.days
	case "deepest":
		return m.deepest
	case "minority":
		return m.minority
	case "learned":
		return m.learned
	default:
		return m.steps
	}
}

var strengthKinds = []string{"days", "deepest", "minority", "learned", "steps"}

// crowdWeek is what the mirror compares one phone with, for one week.
type crowdWeek struct {
	at       time.Time
	players  int                  // phones with an answer that week
	traits   map[string][]float64 // sorted reads of phones with minAnswersToRank answers, window ending that week
	medians  map[string]float64   // by strength kind, among that week's players
	divisive *AnswerSplit
}

type crowdCache struct {
	mu    sync.Mutex
	weeks map[string]*crowdWeek
}

// crowd returns the week's crowd figures, recomputed at most every crowdTTL
// (pastCrowdTTL for a week that has ended). One computation runs at a time.
// It reads every phone's answers for three weeks; at scale this becomes a
// table of weekly figures kept up to date as votes arrive.
func (s *Server) crowd(ctx context.Context, monday time.Time) (*crowdWeek, error) {
	c := &s.crowdCache
	c.mu.Lock()
	defer c.mu.Unlock()
	now := s.clock()
	key := monday.Format(dateLayout)
	ttl := crowdTTL
	if now.After(monday.AddDate(0, 0, 8)) {
		ttl = pastCrowdTTL
	}
	if w := c.weeks[key]; w != nil && !now.Before(w.at) && now.Sub(w.at) < ttl {
		return w, nil
	}
	w, err := s.computeCrowd(ctx, monday)
	if err != nil {
		return nil, err
	}
	w.at = now
	if c.weeks == nil || len(c.weeks) > 16 {
		c.weeks = map[string]*crowdWeek{}
	}
	c.weeks[key] = w
	return w, nil
}

func (s *Server) computeCrowd(ctx context.Context, monday time.Time) (*crowdWeek, error) {
	sunday := monday.AddDate(0, 0, 6)
	mon, sun, from := monday.Format(dateLayout), sunday.Format(dateLayout), sunday.AddDate(0, 0, 1-traitWindowDays).Format(dateLayout)
	w := &crowdWeek{traits: map[string][]float64{}, medians: map[string]float64{}}
	v := &verdicts{s: s, ctx: ctx, counts: map[string]map[string]int{}}
	var all []weekMetrics
	err := s.mirror.EachDevice(ctx, from, sun, func(_ string, answers []MirrorAnswer, steps []MirrorStep) error {
		rs := s.resolve(answers)
		for trait, t := range traitSums(rs, from, sun) {
			if t.n >= minAnswersToRank {
				w.traits[trait] = append(w.traits[trait], t.mean())
			}
		}
		var week []answered
		for _, a := range rs {
			if a.Date >= mon {
				week = append(week, a)
			}
		}
		if len(week) == 0 {
			return nil
		}
		m, err := s.metrics(v, week, steps, mon, sun)
		all = append(all, m)
		return err
	})
	if err != nil {
		return nil, err
	}
	for _, xs := range w.traits {
		slices.Sort(xs)
	}
	w.players = len(all)
	for _, kind := range strengthKinds {
		xs := make([]float64, len(all))
		for i, m := range all {
			xs[i] = float64(m.of(kind))
		}
		w.medians[kind] = median(xs)
	}
	w.divisive, err = s.mostDivided(ctx, v, monday)
	return w, err
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	slices.Sort(xs)
	n := len(xs)
	if n%2 == 1 {
		return xs[n/2]
	}
	return (xs[n/2-1] + xs[n/2]) / 2
}

// mostDivided is the week's question, with enough votes, whose most popular
// option drew the smallest share: where players disagreed most.
func (s *Server) mostDivided(ctx context.Context, v *verdicts, monday time.Time) (*AnswerSplit, error) {
	var best *AnswerSplit
	bestTop := 2.0
	for i := range 7 {
		date := monday.AddDate(0, 0, i).Format(dateLayout)
		set, ok := s.bank.GetSet(date)
		if !ok {
			continue
		}
		seen := map[string]bool{}
		for _, q := range append(append([]Question{}, set.Questions...), set.Pool...) {
			if seen[q.ID] || q.Care == careIntimate {
				continue
			}
			seen[q.ID] = true
			if _, err := v.load(q.ID); err != nil {
				return nil, err
			}
			sp := v.split(answered{MirrorAnswer: MirrorAnswer{QuestionID: q.ID, Date: date}, q: q, found: true})
			if sp.Total < crowdMinVotes {
				continue
			}
			top := 0
			for _, o := range sp.Options {
				top = max(top, o.Count)
			}
			if share := float64(top) / float64(sp.Total); share < bestTop || (share == bestTop && sp.Total > best.Total) {
				best, bestTop = &sp, share
			}
		}
	}
	return best, nil
}

func (s *Server) buildMirror(ctx context.Context, key, date string) (Mirror, error) {
	monday, sunday := weekOf(date)
	mon, sun := monday.Format(dateLayout), sunday.Format(dateLayout)
	lastMon := monday.AddDate(0, 0, -7).Format(dateLayout)
	kept := monday.AddDate(0, 0, -28).Format(dateLayout)
	_, isoWeek := monday.ISOWeek()
	sat := sunday.AddDate(0, 0, -1).Format(dateLayout)
	m := Mirror{Date: date, Week: isoWeek, From: mon, To: sun, Editions: [2]int{editionNumber(mon), editionNumber(sat)},
		Minority: []AnswerSplit{}, Traits: []TraitRead{}, Themes: []ThemeRead{}, Steps: []StepRead{}, Strengths: []Strength{},
		NextSteps: []StepOffer{}, ComingUp: []string{}}

	stored, steps, err := s.mirror.DeviceHistory(ctx, key, kept, sun)
	if err != nil {
		return m, err
	}
	all := s.resolve(stored)
	var week, last []answered
	for _, a := range all {
		switch {
		case a.Date >= mon:
			week = append(week, a)
		case a.Date >= lastMon:
			last = append(last, a)
		}
	}
	slices.SortStableFunc(week, func(x, y answered) int {
		if c := strings.Compare(x.Date, y.Date); c != 0 {
			return c
		}
		if c := x.AnsweredAt.Compare(y.AnsweredAt); c != 0 {
			return c
		}
		return cmp.Compare(s.poolIndex(x), s.poolIndex(y))
	})
	v := &verdicts{s: s, ctx: ctx, counts: map[string]map[string]int{}}

	// Stats, days and areas.
	d, _ := time.Parse(dateLayout, date)
	m.Stats.DaysSoFar = min(int(d.Sub(monday).Hours()/24)+1, 6) // Sunday brings no questions
	mine, err := s.metrics(v, week, steps, mon, sun)
	if err != nil {
		return m, err
	}
	m.Stats.DaysActive, m.Stats.Deepest, m.Stats.Learned = mine.days, mine.deepest, mine.learned
	lastDays := map[string]bool{}
	for _, a := range last {
		lastDays[a.Date] = true
	}
	m.Stats.DaysActiveLastWeek = len(lastDays)

	byArea := map[string]*AreaRead{}
	for _, area := range areas {
		m.Areas = append(m.Areas, AreaRead{Area: area})
	}
	for i := range m.Areas {
		byArea[m.Areas[i].Area] = &m.Areas[i]
	}
	for i := range 7 {
		dd := monday.AddDate(0, 0, i).Format(dateLayout)
		m.Days = append(m.Days, MirrorDay{Date: dd, Edition: editionNumber(dd), Answers: []DayAnswer{}})
	}
	type rare struct {
		share float64
		split AnswerSplit
	}
	var rares []rare
	for _, a := range week {
		m.Stats.Answers++
		if a.Private() {
			m.Stats.Private++
		}
		if a.Learned != nil {
			m.Stats.Rated++
		}
		crowd := "early"
		if a.Private() || a.found {
			if crowd, err = v.of(a); err != nil {
				return m, err
			}
		}
		if i := int(mustDate(a.Date).Sub(monday).Hours() / 24); i >= 0 && i < 7 {
			m.Days[i].Answers = append(m.Days[i].Answers, DayAnswer{Theme: a.Theme, Crowd: crowd})
		}
		area := byArea[themes[a.Theme].area]
		if crowd == "with" || crowd == "against" {
			m.Stats.Judged++
			if area != nil {
				area.Judged++
			}
		}
		if crowd == "against" {
			m.Stats.Minority++
			if area != nil {
				area.Minority++
			}
			sp := v.split(a)
			var share float64
			for _, o := range sp.Options {
				if o.Yours {
					share = o.Percent
				}
			}
			rares = append(rares, rare{share, sp})
		}
	}
	for _, a := range last {
		if !a.found {
			continue
		}
		crowd, err := v.of(a)
		if err != nil {
			return m, err
		}
		if area := byArea[themes[a.Theme].area]; area != nil && (crowd == "with" || crowd == "against") {
			area.LastJudged++
			if crowd == "against" {
				area.LastMinority++
			}
		}
	}
	slices.SortStableFunc(rares, func(x, y rare) int { return cmp.Compare(x.share, y.share) })
	for i, r := range rares {
		if i == 5 {
			break
		}
		m.Minority = append(m.Minority, r.split)
	}
	if len(m.Minority) > 0 {
		m.Rarest = &m.Minority[0]
	}

	// The crowd, for this week and the two before.
	crowds := make([]*crowdWeek, 3)
	for k := range 3 {
		if crowds[k], err = s.crowd(ctx, monday.AddDate(0, 0, -7*(2-k))); err != nil {
			return m, err
		}
	}
	m.Divisive = crowds[2].divisive

	// Trait reads.
	read := func(k int) map[string]traitSum {
		end := sunday.AddDate(0, 0, -7*(2-k))
		return traitSums(all, end.AddDate(0, 0, 1-traitWindowDays).Format(dateLayout), end.Format(dateLayout))
	}
	weeks := []map[string]traitSum{read(0), read(1), read(2)}
	score := func(k int, trait string) (WeekScore, bool) {
		_, wk := monday.AddDate(0, 0, -7*(2-k)).ISOWeek()
		t, ok := weeks[k][trait]
		if !ok || t.n < minTraitAnswers {
			return WeekScore{Week: wk}, false
		}
		ws := WeekScore{Week: wk, Solid: t.n >= solidReadAnswers}
		pool := crowds[k].traits[trait]
		var sc int
		if t.n >= minAnswersToRank && len(pool) >= minPlayersToRank {
			sc, ws.Ranked = rankOf(pool, t.mean()), true
		} else {
			sc = int(math.Round(100 * t.mean()))
		}
		ws.Score = &sc
		return ws, true
	}
	for trait, t := range weeks[2] {
		now, ok := score(2, trait)
		if !ok {
			continue
		}
		r := TraitRead{Trait: trait, Answers: t.n, Solid: now.Solid, Score: *now.Score, Ranked: now.Ranked}
		for k := range 3 {
			ws, _ := score(k, trait)
			r.History = append(r.History, ws)
		}
		if prev := r.History[1]; prev.Score != nil && prev.Ranked == r.Ranked {
			c := r.Score - *prev.Score
			r.Change = &c
		}
		r.Evidence, r.Theme, r.Edition = evidence(week, trait, r.Score >= 50)
		if r.Ranked {
			m.Ranked = true
		}
		m.Traits = append(m.Traits, r)
	}
	slices.SortFunc(m.Traits, func(x, y TraitRead) int {
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

	// Themes over the weeks kept, and how deep each went.
	type depthSum struct{ n, private, sum int }
	byTheme := map[string]*depthSum{}
	mondays := map[string]bool{}
	for _, a := range all {
		mondays[weekStart(a.Date)] = true
		if a.Theme == "" {
			continue
		}
		t := byTheme[a.Theme]
		if t == nil {
			t = &depthSum{}
			byTheme[a.Theme] = t
		}
		t.n++
		if a.Private() {
			t.private++
		} else {
			t.sum += a.Depth
		}
	}
	m.WeeksPlayed = len(mondays)
	for theme, t := range byTheme {
		tr := ThemeRead{Theme: theme, Area: themes[theme].area, Answers: t.n, Depth: "private"}
		if open := t.n - t.private; open > 0 {
			switch avg := float64(t.sum) / float64(open); {
			case avg < 2:
				tr.Depth = "light"
			case avg < 3:
				tr.Depth = "deeper"
			default:
				tr.Depth = "deep"
			}
		}
		m.Themes = append(m.Themes, tr)
	}
	slices.SortFunc(m.Themes, func(x, y ThemeRead) int {
		if c := cmp.Compare(y.Answers, x.Answers); c != 0 {
			return c
		}
		return strings.Compare(x.Theme, y.Theme)
	})

	// Steps: this week's, older ones still open, and the record so far.
	byQuestion := map[string]answered{}
	for _, a := range all {
		byQuestion[a.QuestionID] = a
	}
	started := map[string]bool{}
	for _, st := range steps {
		started[st.QuestionID] = true
		m.StepRecord.Started++
		if st.Tried() {
			m.StepRecord.Tried++
		}
		if st.Status == stepHelped {
			m.StepRecord.Helped++
		}
		thisWeek := st.Started >= mon
		if thisWeek {
			m.Stats.StepsStarted++
			if st.Tried() {
				m.Stats.StepsTried++
			}
			if st.Status == stepHelped {
				m.Stats.StepsHelped++
			}
		}
		if !thisWeek && st.Status != stepStarted {
			continue
		}
		a, ok := byQuestion[st.QuestionID]
		if !ok {
			continue
		}
		m.Steps = append(m.Steps, StepRead{QuestionID: st.QuestionID, OptionID: st.OptionID, Theme: a.Theme, Step: s.stepText(a.MirrorAnswer),
			Started: st.Started, Status: st.Status, Edition: editionNumber(a.Date)})
	}
	slices.SortStableFunc(m.Steps, func(x, y StepRead) int { return strings.Compare(y.Started, x.Started) })

	// Steps on offer: from this week's and last week's cards, newest first,
	// one per theme, none already started.
	recent := append(append([]answered{}, last...), week...)
	themesOffered := map[string]bool{}
	for i := len(recent) - 1; i >= 0 && len(m.NextSteps) < 3; i-- {
		a := recent[i]
		text := s.stepText(a.MirrorAnswer)
		if text == "" || started[a.QuestionID] || themesOffered[a.Theme] {
			continue
		}
		themesOffered[a.Theme] = true
		m.NextSteps = append(m.NextSteps, StepOffer{QuestionID: a.QuestionID, OptionID: a.OptionID, Theme: a.Theme, Step: text, Edition: editionNumber(a.Date)})
	}

	// Strengths: where this week beats the median player's.
	if c := crowds[2]; c.players >= minPlayersToRank {
		for _, kind := range strengthKinds {
			you, med := mine.of(kind), c.medians[kind]
			if you >= 1 && float64(you) > med {
				m.Strengths = append(m.Strengths, Strength{Kind: kind, You: you, Median: med, Players: c.players})
			}
		}
		slices.SortStableFunc(m.Strengths, func(x, y Strength) int {
			return cmp.Compare((float64(y.You)-y.Median)/math.Max(y.Median, 1), (float64(x.You)-x.Median)/math.Max(x.Median, 1))
		})
		if len(m.Strengths) > 3 {
			m.Strengths = m.Strengths[:3]
		}
	}

	// What comes next, and the support note.
	for i := 1; i <= 3 && len(m.ComingUp) < 4; i++ {
		set, ok := s.bank.GetSet(d.AddDate(0, 0, i).Format(dateLayout))
		if !ok {
			continue
		}
		for _, q := range append(append([]Question{}, set.Questions...), set.Afternoon...) {
			if q.Theme != "" && q.Care != careIntimate && !slices.Contains(m.ComingUp, q.Theme) && len(m.ComingUp) < 4 {
				m.ComingUp = append(m.ComingUp, q.Theme)
			}
		}
	}
	heavy := 0
	for _, a := range week {
		if a.Theme == "sadness-stress" && a.Depth >= 3 {
			heavy++
		}
	}
	m.LowMood = heavy >= 3
	return m, nil
}

// evidence lists this week's answers that leaned furthest the way the read
// points, with the theme and edition of the first.
func evidence(week []answered, trait string, higher bool) ([]string, string, int) {
	type lean struct {
		p float64
		a answered
	}
	var leans []lean
	for _, a := range week {
		if !a.found {
			continue
		}
		if p, ok := traitPosition(a.q, a.OptionID, trait); ok && ((higher && p > 0.5) || (!higher && p < 0.5)) {
			leans = append(leans, lean{p, a})
		}
	}
	slices.SortStableFunc(leans, func(x, y lean) int {
		if higher {
			return cmp.Compare(y.p, x.p)
		}
		return cmp.Compare(x.p, y.p)
	})
	labels := []string{}
	for _, l := range leans {
		if o := optionOf(l.a.q, l.a.OptionID); o != nil && !slices.Contains(labels, o.Label) && len(labels) < 3 {
			labels = append(labels, o.Label)
		}
	}
	if len(leans) == 0 {
		return labels, "", 0
	}
	return labels, leans[0].a.Theme, editionNumber(leans[0].a.Date)
}

// poolIndex orders answers given at the same moment by their place in the edition.
func (s *Server) poolIndex(a answered) int {
	if set, ok := s.bank.GetSet(a.Date); ok {
		if i := slices.IndexFunc(set.Pool, func(q Question) bool { return q.ID == a.QuestionID }); i >= 0 {
			return i
		}
	}
	return math.MaxInt
}

func mustDate(date string) time.Time {
	d, _ := time.Parse(dateLayout, date)
	return d
}

func weekStart(date string) string {
	monday, _ := weekOf(date)
	return monday.Format(dateLayout)
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
