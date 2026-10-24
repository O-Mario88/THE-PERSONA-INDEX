package main

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"
)

// The weekly mirror: GET /api/mirror builds one phone's week from the mirror
// store (mirrorstore.go). Every number comes from that phone's own stored
// answers and steps, and it is only ever set against the phone's own past
// (last week, the weeks before). Edwin, 2026-10-15: speak to people "about
// who they are and how they can change, not comparing them with other
// people", so nothing another phone answers changes what this one sees.
//
// Trait reads, scoring version 1:
//   - For each answer whose question can show a trait (some option carries a
//     weight for it), the chosen option's position among the options: 1 for
//     the option that shows the trait most, 0 for the one that shows it
//     least, 0.5 for the options' average weight.
//   - A week's read is the mean position over that week and the two before
//     (traitWindowDays), as a score from 0 to 100. Private answers never count.
//   - An answer whose card the phone tapped "Not me" counts towards nothing
//     about who the person is: no trait read, no example and no moment
//     (since 2026-10-16). It still counts as an answer and towards its theme.

const (
	minTraitAnswers = 2  // answers on a trait before it is read at all
	traitWindowDays = 21 // a week's read uses that week and the two before
)

// How far a read has been earned (the review of 2026-10-15, "How readings
// build"). A leaning is named only when the answers earn it, and the app says
// how many answers it rests on. The thresholds are a starting point, to tune
// from real use.
//   - hint: one or two answers, or all on one day. Only the day close speaks
//     of a hint; the mirrors show it without naming a leaning.
//   - pattern: three or more answers on two or more days.
//   - steady: seven or more answers across three or more weeks.
//   - changing: a pattern whose recent answers point the other way: the read
//     before leaned one way (60 and over, or 40 and under) and the newest
//     answers on their own sit on the other side of the middle.
const (
	levelHint     = "hint"
	levelPattern  = "pattern"
	levelSteady   = "steady"
	levelChanging = "changing"

	patternAnswers = 3
	patternDays    = 2
	steadyAnswers  = 7
	steadyWeeks    = 3

	leanHigh = 60 // a read at or over this leans high (frontend HIGH)
	leanLow  = 40 // at or under this, low (frontend LOW)
)

// readLevel says how far a read of n answers on days days across weeks weeks
// has been earned. before is the earlier read it is set against, and recent
// the newest answers on their own; either may be missing.
func readLevel(n, days, weeks int, before, recent traitSum) string {
	if n < patternAnswers || days < patternDays {
		return levelHint
	}
	if before.n >= patternAnswers && recent.n >= minTraitAnswers {
		b, r := 100*before.mean(), 100*recent.mean()
		if (b >= leanHigh && r < 50) || (b <= leanLow && r > 50) {
			return levelChanging
		}
	}
	if n >= steadyAnswers && weeks >= steadyWeeks {
		return levelSteady
	}
	return levelPattern
}

// levelRank orders reads for the screen: the most earned first.
func levelRank(level string) int {
	switch level {
	case levelSteady, levelChanging:
		return 2
	case levelPattern:
		return 1
	}
	return 0
}

// Mirror is the response of GET /api/mirror?date=YYYY-MM-DD.
type Mirror struct {
	Date        string `json:"date"`
	Week        int    `json:"week"`        // ISO week number
	From        string `json:"from"`        // Monday
	To          string `json:"to"`          // Sunday
	Editions    [2]int `json:"editions"`    // Monday's and Saturday's; Sunday has none
	WeeksActive int    `json:"weeksActive"` // weeks with an answer, among the five kept

	Stats      MirrorStats `json:"stats"`
	Days       []MirrorDay `json:"days"` // Monday to Sunday
	Traits     []TraitRead `json:"traits"`
	Themes     []ThemeRead `json:"themes"` // over the weeks kept
	Steps      []StepRead  `json:"steps"`  // started this week, and older ones still open
	StepRecord StepTotals  `json:"stepRecord"`
	NextSteps  []StepOffer `json:"nextSteps"`
	ComingUp   []string    `json:"comingUp"` // themes of the next days, never their questions
	LowMood    bool        `json:"lowMood"`
}

type MirrorStats struct {
	DaysActive         int `json:"daysActive"`
	DaysActiveLastWeek int `json:"daysActiveLastWeek"`
	DaysSoFar          int `json:"daysSoFar"` // question days of this week up to the phone's date: 1 to 6
	Answers            int `json:"answers"`   // private ones included
	Private            int `json:"private"`
	Deepest            int `json:"deepest"` // answers that took the question's deepest option
	Me                 int `json:"me"`      // cards tapped "That's me"
	Partly             int `json:"partly"`
	NotMe              int `json:"notMe"`
	Rated              int `json:"rated"`
	StepsStarted       int `json:"stepsStarted"`
	StepsTried         int `json:"stepsTried"`
	StepsHelped        int `json:"stepsHelped"`
	PlansDid           int `json:"plansDid"` // plan checks this week: "did it"
	PlansNotYet        int `json:"plansNotYet"`
}

type MirrorDay struct {
	Date    string      `json:"date"`
	Edition int         `json:"edition"`
	Answers []DayAnswer `json:"answers"`
}

// DayAnswer is one answer on the week's strip: its theme and how deep it went.
type DayAnswer struct {
	Theme string `json:"theme"`
	Depth string `json:"depth"` // light | deeper | deep | private
}

type TraitRead struct {
	Trait    string      `json:"trait"`
	Answers  int         `json:"answers"`          // answers that could show it, last three weeks
	Days     int         `json:"days"`             // the days they were given on
	Weeks    int         `json:"weeks"`            // the weeks they were given in
	Level    string      `json:"level"`            // hint | pattern | steady | changing
	Score    int         `json:"score"`            // 0..100: where the answers sit among their questions' options
	Change   *int        `json:"change,omitempty"` // against last week's read
	History  []WeekScore `json:"history"`          // two weeks ago, last week, this week
	Evidence []string    `json:"evidence"`         // this week's answers that leaned this way most
	Theme    string      `json:"theme,omitempty"`  // where the first of them came from
	Edition  int         `json:"edition,omitempty"`
	// Behind is the answers the read rests on, newest first, for "Why do
	// you say that?": every answer of the read's three weeks that could show
	// the trait, up to maxBehind.
	Behind []BehindAnswer `json:"behind"`
}

// BehindAnswer is one of the person's own answers behind a read.
type BehindAnswer struct {
	Date     string `json:"date"`
	Theme    string `json:"theme"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Leans    string `json:"leans"` // high | low | middle: which way this answer pointed on the trait
}

// maxBehind is how many answers "Why do you say that?" lists.
const maxBehind = 12

type WeekScore struct {
	Week  int  `json:"week"`
	Score *int `json:"score,omitempty"`
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
	// NeedStep says the person picked the step that serves the answer's need
	// (needs.go) rather than the card's own. Kept from the first save.
	NeedStep bool `json:"needStep,omitempty"`
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

// deviceVoteHashes lists every key a phone's raw votes and ratings can be
// stored under: one per question of every edition whose votes may still be
// kept, with a day either side for phones far from UTC.
func (s *Server) deviceVoteHashes(deviceID string) []string {
	now := s.clock().UTC()
	first := now.Add(-s.voteRetention-time.Hour-westmostOffset).AddDate(0, 0, -2)
	last := now.Add(eastmostOffset).AddDate(0, 0, 1)
	var out []string
	for d := first; !d.After(last); d = d.AddDate(0, 0, 1) {
		set, ok := s.bank.GetSet(d.Format(dateLayout))
		if !ok {
			continue
		}
		qs := set.Pool
		if len(qs) == 0 {
			qs = set.Questions
		}
		for _, q := range qs {
			out = append(out, s.devices.voterHash(deviceID, q.ID), s.devices.voterHash(deviceID, ratingKey(q.ID)))
		}
	}
	return out
}

// ForgetResult is the 200 body of DELETE /api/device/data.
type ForgetResult struct {
	Deleted Forgotten `json:"deleted"`
}

// ForgetDevice is DELETE /api/device/data ("Delete everything"): every row
// kept for this phone goes, in one step: its answers, steps and weekly notes,
// and its raw votes and ratings. Totals already counted stay; they are
// anonymous numbers that cannot be traced back to it. The phone's pass then
// takes no more writes, and the phone gets a new one.
//
// Any well-formed pass is accepted, signed or not (deviceSigner.Holder), so
// a phone whose pass was signed by a retired key can still delete.
func (s *Server) ForgetDevice(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	token, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Device ")
	deviceID, ok := s.devices.Holder(token)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if ok, retry := s.forgetLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	f, err := s.mirror.ForgetDevice(r.Context(), s.devices.mirrorKey(deviceID), s.deviceVoteHashes(deviceID), s.clock().UTC().Format(dateLayout))
	if err != nil {
		log.Printf("forget: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, ForgetResult{Deleted: f})
}

// DataKept is the response of GET /api/device/data: what the server holds
// for this phone and how long each kind is kept, for its "What I keep" screen.
type DataKept struct {
	Kept    Kept      `json:"kept"`
	KeptFor Retention `json:"keptFor"`
}

// Retention says, in days, how long each kind of row is kept.
type Retention struct {
	AnswersDays     int `json:"answersDays"` // answers, steps and plan checks
	WeeklyNotesDays int `json:"weeklyNotesDays"`
	VotesDays       int `json:"votesDays"`
	BackupDays      int `json:"backupDays"` // a backup no phone has written or read for this long
}

func (s *Server) retention() Retention {
	days := func(d time.Duration) int { return int(d.Hours() / 24) }
	return Retention{AnswersDays: days(mirrorRetention), WeeklyNotesDays: days(weekSummaryRetention), VotesDays: days(s.voteRetention),
		BackupDays: days(vaultRetention)}
}

func (s *Server) DeviceData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	deviceID, ok := s.deviceFromHeader(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	k, err := s.mirror.DeviceData(r.Context(), s.devices.mirrorKey(deviceID), s.deviceVoteHashes(deviceID))
	if err != nil {
		log.Printf("device data: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, DataKept{Kept: k, KeptFor: s.retention()})
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
	if i < 0 || s.stepFor(answers[i], req.NeedStep) == "" {
		writeError(w, http.StatusNotFound, "unknown_answer")
		return
	}
	st := MirrorStep{DeviceKey: key, QuestionID: req.QuestionID, OptionID: req.OptionID, Started: req.Date, Status: req.Status, UpdatedAt: s.voteTime(), NeedStep: req.NeedStep}
	if err := s.mirror.SaveStep(r.Context(), st); errors.Is(err, ErrDeviceForgotten) {
		writeError(w, http.StatusGone, "device_forgotten")
		return
	} else if err != nil {
		log.Printf("step: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// answerFor is what the phone's mirror keeps of a vote: its question, date,
// sitting, option and depth. A private (intimate) answer keeps only that it
// was given, under a keyed hash in place of its question id.
func (s *Server) answerFor(deviceID string, q Question, date, optionID string, evening bool) MirrorAnswer {
	a := MirrorAnswer{DeviceKey: s.devices.mirrorKey(deviceID), QuestionID: q.ID, Date: date, Theme: q.Theme, OptionID: optionID, Evening: evening}
	if q.Care == careIntimate {
		a.QuestionID, a.OptionID = s.devices.privateQuestionID(q.ID), ""
	} else if o := optionOf(q, optionID); o != nil {
		a.Depth = o.Depth
	}
	return a
}

func optionOf(q Question, id string) *Option {
	for i := range q.Options {
		if q.Options[i].ID == id {
			return &q.Options[i]
		}
	}
	return nil
}

// questionFinder is a bank that finds a question by its dated id alone.
type questionFinder interface {
	Question(id string) (Question, bool)
}

func (s *Server) question(date, id string) (Question, bool) {
	if f, ok := s.bank.(questionFinder); ok {
		if q, ok := f.Question(id); ok && strings.HasPrefix(id, date+"-") {
			return q, true
		}
	}
	return s.questions.lookup(s.bank, date, id)
}

// stepText is the card's own step for an answer.
func (s *Server) stepText(a MirrorAnswer) string { return s.stepFor(a, false) }

// stepFor is the text of a step started on an answer: the card's own, or with
// needStep the one that serves the need the answer reached for (needs.go).
func (s *Server) stepFor(a MirrorAnswer, needStep bool) string {
	if a.Private() {
		return ""
	}
	q, ok := s.question(a.Date, a.QuestionID)
	if !ok {
		return ""
	}
	o := optionOf(q, a.OptionID)
	if o == nil || o.Insight == nil {
		return ""
	}
	if needStep {
		return needSteps[o.Need]
	}
	return o.Insight.Step
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

// reads reports whether the answer may say anything about who the person is:
// its question is known and the phone did not tap "Not me" on its card.
func (a answered) reads() bool { return a.found && a.Verdict != verdictNotMe }

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
	// The days and weeks the answers were given on. Set by traitSums only.
	days, weeks int
}

// mean is rounded so the same answers always give exactly the same value,
// whichever order they were added in.
func (t traitSum) mean() float64 { return math.Round(t.sum/float64(t.n)*1e6) / 1e6 }

// traitSums reads every trait the answers dated in [from, to] can show.
func traitSums(answers []answered, from, to string) map[string]traitSum {
	out := map[string]traitSum{}
	days, weeks := map[string]map[string]bool{}, map[string]map[string]bool{}
	for _, a := range answers {
		if !a.reads() || a.Date < from || a.Date > to {
			continue
		}
		for _, trait := range traitsOn(a.q) {
			if p, ok := traitPosition(a.q, a.OptionID, trait); ok {
				t := out[trait]
				t.n++
				t.sum += p
				out[trait] = t
				if days[trait] == nil {
					days[trait], weeks[trait] = map[string]bool{}, map[string]bool{}
				}
				days[trait][a.Date] = true
				weeks[trait][weekStart(a.Date)] = true
			}
		}
	}
	for trait, t := range out {
		t.days, t.weeks = len(days[trait]), len(weeks[trait])
		out[trait] = t
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

const dateLayout = "2006-01-02"

func weekOf(date string) (monday, sunday time.Time) {
	d, _ := time.Parse(dateLayout, date)
	monday = d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
	return monday, monday.AddDate(0, 0, 6)
}

func (s *Server) buildMirror(ctx context.Context, key, date string) (Mirror, error) {
	monday, sunday := weekOf(date)
	mon, sun := monday.Format(dateLayout), sunday.Format(dateLayout)
	lastMon := monday.AddDate(0, 0, -7).Format(dateLayout)
	kept := monday.AddDate(0, 0, -28).Format(dateLayout)
	_, isoWeek := monday.ISOWeek()
	sat := sunday.AddDate(0, 0, -1).Format(dateLayout)
	m := Mirror{Date: date, Week: isoWeek, From: mon, To: sun, Editions: [2]int{editionNumber(mon), editionNumber(sat)},
		Traits: []TraitRead{}, Themes: []ThemeRead{}, Steps: []StepRead{}, NextSteps: []StepOffer{}, ComingUp: []string{}}

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
		if c := boolCompare(x.Evening, y.Evening); c != 0 {
			return c
		}
		return cmp.Compare(s.poolIndex(x), s.poolIndex(y))
	})

	// Stats and days.
	d, _ := time.Parse(dateLayout, date)
	m.Stats.DaysSoFar = min(int(d.Sub(monday).Hours()/24)+1, 6) // Sunday brings no questions
	for i := range 7 {
		dd := monday.AddDate(0, 0, i).Format(dateLayout)
		m.Days = append(m.Days, MirrorDay{Date: dd, Edition: editionNumber(dd), Answers: []DayAnswer{}})
	}
	days := map[string]bool{}
	for _, a := range week {
		days[a.Date] = true
		m.Stats.Answers++
		if a.Private() {
			m.Stats.Private++
		}
		if a.deepest() {
			m.Stats.Deepest++
		}
		if a.Verdict != "" {
			m.Stats.Rated++
			countVerdict(a.Verdict, &m.Stats.Me, &m.Stats.Partly, &m.Stats.NotMe)
		}
		if i := int(mustDate(a.Date).Sub(monday).Hours() / 24); i >= 0 && i < 7 {
			m.Days[i].Answers = append(m.Days[i].Answers, DayAnswer{Theme: a.Theme, Depth: depthWord(a.Private(), float64(a.Depth))})
		}
	}
	m.Stats.DaysActive = len(days)
	lastDays := map[string]bool{}
	for _, a := range last {
		lastDays[a.Date] = true
	}
	m.Stats.DaysActiveLastWeek = len(lastDays)

	// Trait reads, against the phone's own reads of the two weeks before.
	read := func(k int) map[string]traitSum {
		end := sunday.AddDate(0, 0, -7*(2-k))
		return traitSums(all, end.AddDate(0, 0, 1-traitWindowDays).Format(dateLayout), end.Format(dateLayout))
	}
	weeks := []map[string]traitSum{read(0), read(1), read(2)}
	thisWeek := traitSums(all, monday.Format(dateLayout), sunday.Format(dateLayout))
	score := func(k int, trait string) WeekScore {
		_, wk := monday.AddDate(0, 0, -7*(2-k)).ISOWeek()
		t, ok := weeks[k][trait]
		if !ok || t.n < minTraitAnswers {
			return WeekScore{Week: wk}
		}
		sc := int(math.Round(100 * t.mean()))
		return WeekScore{Week: wk, Score: &sc}
	}
	for trait, t := range weeks[2] {
		now := score(2, trait)
		if now.Score == nil {
			continue
		}
		r := TraitRead{Trait: trait, Answers: t.n, Days: t.days, Weeks: t.weeks, Score: *now.Score}
		r.Level = readLevel(t.n, t.days, t.weeks, weeks[1][trait], thisWeek[trait])
		for k := range 3 {
			r.History = append(r.History, score(k, trait))
		}
		if prev := r.History[1]; prev.Score != nil {
			c := r.Score - *prev.Score
			r.Change = &c
		}
		r.Evidence, r.Theme, r.Edition = evidence(week, trait, r.Score >= 50)
		r.Behind = behind(all, trait, sunday.AddDate(0, 0, 1-traitWindowDays).Format(dateLayout), sun)
		m.Traits = append(m.Traits, r)
	}
	slices.SortFunc(m.Traits, func(x, y TraitRead) int {
		if c := cmp.Compare(levelRank(y.Level), levelRank(x.Level)); c != 0 {
			return c
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
	m.WeeksActive = len(mondays)
	for theme, t := range byTheme {
		m.Themes = append(m.Themes, themeRead(theme, t.n, t.private, t.sum))
	}
	sortThemes(m.Themes)

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
		m.Steps = append(m.Steps, StepRead{QuestionID: st.QuestionID, OptionID: st.OptionID, Theme: a.Theme, Step: s.stepFor(a.MirrorAnswer, st.NeedStep),
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

	// Plan checks this week. The plans themselves stay on the phone.
	checks, err := s.mirror.PlanChecks(ctx, key, mon, sun)
	if err != nil {
		return m, err
	}
	for _, c := range checks {
		if c.Status == planDid {
			m.Stats.PlansDid++
		} else {
			m.Stats.PlansNotYet++
		}
	}

	// What comes next, and the support note.
	for i := 1; i <= 3 && len(m.ComingUp) < 4; i++ {
		set, ok := s.bank.GetSet(d.AddDate(0, 0, i).Format(dateLayout))
		if !ok {
			continue
		}
		for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
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

// depthWord names how deep answers went, from their mean option depth.
func depthWord(private bool, depth float64) string {
	switch {
	case private:
		return "private"
	case depth < 2:
		return "light"
	case depth < 3:
		return "deeper"
	default:
		return "deep"
	}
}

// themeRead is a theme's answers and how deep the open ones went on average;
// a theme answered only in private reads "private".
func themeRead(theme string, n, private, depthSum int) ThemeRead {
	tr := ThemeRead{Theme: theme, Area: themes[theme].area, Answers: n, Depth: "private"}
	if open := n - private; open > 0 {
		tr.Depth = depthWord(false, float64(depthSum)/float64(open))
	}
	return tr
}

// sortThemes puts the themes answered most first.
func sortThemes(ts []ThemeRead) {
	slices.SortFunc(ts, func(x, y ThemeRead) int {
		if c := cmp.Compare(y.Answers, x.Answers); c != 0 {
			return c
		}
		return strings.Compare(x.Theme, y.Theme)
	})
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
		if !a.reads() {
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

// behind lists the answers dated in [from, to] that a read of trait rests
// on, newest first: the same answers traitSums counts.
func behind(all []answered, trait, from, to string) []BehindAnswer {
	out := []BehindAnswer{}
	for i := len(all) - 1; i >= 0 && len(out) < maxBehind; i-- {
		a := all[i]
		if !a.reads() || a.Date < from || a.Date > to {
			continue
		}
		p, ok := traitPosition(a.q, a.OptionID, trait)
		if !ok {
			continue
		}
		b := BehindAnswer{Date: a.Date, Theme: a.Theme, Question: a.q.Prompt, Leans: "middle"}
		if o := optionOf(a.q, a.OptionID); o != nil {
			b.Answer = o.Label
		}
		switch {
		case p > 0.5:
			b.Leans = "high"
		case p < 0.5:
			b.Leans = "low"
		}
		out = append(out, b)
	}
	return out
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
