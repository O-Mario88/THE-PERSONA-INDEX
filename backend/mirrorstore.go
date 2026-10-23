package main

import (
	"context"
	"slices"
	"strings"
	"time"
)

// The mirror store keeps each phone's answers and small steps so its weekly
// mirror can be built from the database (Edwin, 2026-10-15). Rows are keyed
// by deviceSigner.mirrorKey: a keyed hash of the device id, never the token,
// and not the per-question key the votes table uses, so the vote table on its
// own still cannot be joined into a profile. A private (intimate) answer keeps
// only that it was given: no option, and a keyed hash in place of its
// question id. An answer keeps its date and sitting, never the moment it was
// given, so it cannot be matched to a vote by time. Rows are deleted after
// mirrorRetention, and at once when the phone asks for everything to be
// deleted; the phone's old pass then takes no more writes.

// MirrorAnswer is one answer as the mirror keeps it.
type MirrorAnswer struct {
	DeviceKey  string
	QuestionID string // a keyed hash for a private answer
	Date       string // the edition date, YYYY-MM-DD
	Theme      string
	OptionID   string // empty for a private answer
	Depth      int    // 0 for a private answer
	Evening    bool   // answered in the evening sitting; never the time itself
	Verdict    string // the tap under the card once given: verdictMe, verdictPartly or verdictNotMe
}

// Private reports whether the answer was kept without its option.
func (a MirrorAnswer) Private() bool { return a.OptionID == "" }

// countVerdict adds one to the count for the verdict given.
func countVerdict(verdict string, me, partly, notMe *int) {
	switch verdict {
	case verdictMe:
		*me++
	case verdictPartly:
		*partly++
	case verdictNotMe:
		*notMe++
	}
}

// Step statuses. A step starts from the card of an answer, and the phone
// reports how it went: tried and it helped, tried with no change yet, or not
// tried.
const (
	stepStarted  = "started"
	stepHelped   = "helped"
	stepNoChange = "no_change"
	stepNotTried = "not_tried"
)

var stepStatuses = []string{stepStarted, stepHelped, stepNoChange, stepNotTried}

// MirrorStep is one small step a phone took on.
type MirrorStep struct {
	DeviceKey  string
	QuestionID string
	OptionID   string
	Started    string // YYYY-MM-DD, the phone's date when the step was first saved
	Status     string
	UpdatedAt  time.Time
}

func (s MirrorStep) Tried() bool { return s.Status == stepHelped || s.Status == stepNoChange }

// Forgotten counts what one "Delete everything" removed from the server.
type Forgotten struct {
	Answers    int `json:"answers"`
	Steps      int `json:"steps"`
	PlanChecks int `json:"planChecks"`
	Weeks      int `json:"weeklyNotes"`
	Votes      int `json:"votes"` // raw votes and ratings; anonymous totals already counted stay
}

// Kept counts what the server holds for one device.
type Kept struct {
	Answers     int    `json:"answers"` // private ones included
	Private     int    `json:"privateAnswers"`
	Steps       int    `json:"steps"`
	PlanChecks  int    `json:"planChecks"`
	Weeks       int    `json:"weeklyNotes"`
	Votes       int    `json:"votes"`
	FirstAnswer string `json:"firstAnswer,omitempty"` // the oldest answer's date
}

// MirrorStore is the durable side of the mirror. Both the in-memory store and
// Postgres implement it alongside VoteStore; a vote's answer and a rating's
// tap are stored by VoteStore.Accept, together with the ballot.
type MirrorStore interface {
	// SaveAnswer keeps one answer without a vote, for restoring and tests.
	// Saving it again changes nothing; the first answer to a question wins.
	// A device that deleted everything gets ErrDeviceForgotten.
	SaveAnswer(ctx context.Context, a MirrorAnswer) error
	// SaveStep starts a step or records how it went; its start date is kept.
	// A device that deleted everything gets ErrDeviceForgotten.
	SaveStep(ctx context.Context, s MirrorStep) error
	// DeviceHistory returns one device's answers dated in [from, to] and its
	// steps started in [from, to], oldest first.
	DeviceHistory(ctx context.Context, deviceKey, from, to string) ([]MirrorAnswer, []MirrorStep, error)
	// EachDevice calls fn once per device with an answer dated in [from, to],
	// with that device's answers in the range and its steps started in it.
	EachDevice(ctx context.Context, from, to string, fn func(deviceKey string, answers []MirrorAnswer, steps []MirrorStep) error) error
	// SavePlanCheck keeps one "did it" or "not yet" for a plan on the phone.
	// Saving the same key again changes nothing. A device that deleted
	// everything gets ErrDeviceForgotten.
	SavePlanCheck(ctx context.Context, c PlanCheck) error
	// PlanChecks returns one device's plan checks dated in [from, to],
	// oldest first.
	PlanChecks(ctx context.Context, deviceKey, from, to string) ([]PlanCheck, error)
	// ForgetDevice deletes everything kept for one device, in one step: its
	// answers, steps, plan checks and weekly notes, and the raw votes and ratings stored
	// under any of voterHashes (the device's per-question keys). From then on
	// the device's old pass takes no more writes. today is the date the
	// marker for that is kept from.
	ForgetDevice(ctx context.Context, deviceKey string, voterHashes []string, today string) (Forgotten, error)
	// DeviceData counts what is kept for one device, for its "What I keep" screen.
	DeviceData(ctx context.Context, deviceKey string, voterHashes []string) (Kept, error)
	// DeviceVotes returns the raw votes and ratings stored under any of
	// voterHashes, for the phone's export, oldest first.
	DeviceVotes(ctx context.Context, voterHashes []string) ([]VoteEvent, error)
	// DeleteMirrorBefore deletes answers dated, steps started, plan checks
	// dated and markers of deleted devices kept from before date, and
	// reports how many rows went.
	DeleteMirrorBefore(ctx context.Context, date string) (int, error)

	// SaveWeekSummaries writes week summaries; writing one again replaces it.
	// A summary is written only while its device still has an answer dated in
	// that week or the week before, the answers it is made from, and each is
	// written under the device's lock, so a fold that races a phone's "Delete
	// everything" cannot bring its week back.
	SaveWeekSummaries(ctx context.Context, ws []WeekSummary) error
	// WeekSummaries returns one device's summaries of weeks starting in
	// [from, to], oldest first.
	WeekSummaries(ctx context.Context, deviceKey, from, to string) ([]WeekSummary, error)
	// MarkFolded notes that the week starting monday is folded for every device.
	MarkFolded(ctx context.Context, monday string) error
	// FoldedWeeks returns the folded Mondays in [from, to], oldest first.
	FoldedWeeks(ctx context.Context, from, to string) ([]string, error)
	// DeleteWeeksBefore deletes the summaries and fold marks of weeks starting
	// before monday, and reports how many rows went.
	DeleteWeeksBefore(ctx context.Context, monday string) (int, error)
}

// WeekSummary is one phone's finished week, folded so the monthly, quarterly
// and yearly mirrors outlive the answers (period.go). It keeps counts, sums
// and the words worth keeping; a private answer only adds to the counts.
type WeekSummary struct {
	DeviceKey    string                `json:"-"`
	Monday       string                `json:"-"`
	DaysActive   int                   `json:"daysActive,omitempty"`
	Answers      int                   `json:"answers,omitempty"`
	Private      int                   `json:"private,omitempty"`
	Deepest      int                   `json:"deepest,omitempty"`
	Me           int                   `json:"me,omitempty"` // cards tapped "That's me"
	Partly       int                   `json:"partly,omitempty"`
	NotMe        int                   `json:"notMe,omitempty"`
	Rated        int                   `json:"rated,omitempty"`
	StepsStarted int                   `json:"stepsStarted,omitempty"`
	StepsTried   int                   `json:"stepsTried,omitempty"`
	StepsHelped  int                   `json:"stepsHelped,omitempty"`
	Themes       map[string]ThemeTally `json:"themes,omitempty"`
	Traits       map[string]TraitTally `json:"traits,omitempty"`
	Moments      []Moment              `json:"moments,omitempty"` // the week's top moments (topMoments)
	Helped       []HelpedStep          `json:"helped,omitempty"`
}

type ThemeTally struct {
	N        int `json:"n"`
	Private  int `json:"private,omitempty"`
	DepthSum int `json:"depthSum,omitempty"`
}

// TraitTally is the sum of an answer's positions on a trait (traitPosition).
type TraitTally struct {
	N    int     `json:"n"`
	Sum  float64 `json:"sum"`
	Days int     `json:"days,omitempty"` // the days of the week they were given on (since 2026-10-16)
}

// summarySources is the range of answer dates a week's summary is made
// from: the week before (for the words of steps started from its cards) and
// the week itself.
func summarySources(monday string) (from, to string) {
	m := mustDate(monday)
	return m.AddDate(0, 0, -7).Format(dateLayout), m.AddDate(0, 0, 6).Format(dateLayout)
}

// mirrorRetention is how long answers and steps are kept. The mirror reads
// three weeks of answers for each of the last three weeks, so it needs five.
const mirrorRetention = 35 * 24 * time.Hour

type memoryMirror struct {
	answers   map[string]map[string]MirrorAnswer // device key -> question id -> answer
	steps     map[string]map[string]MirrorStep
	weeks     map[string]map[string]WeekSummary // device key -> Monday -> summary
	folds     map[string]bool                   // folded Mondays
	forgotten map[string]string                 // device key -> date it deleted everything
	checks    map[string]map[string]PlanCheck   // device key -> check key -> check
}

func (m *memoryStore) SaveAnswer(_ context.Context, a MirrorAnswer) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.mirror.forgotten[a.DeviceKey] != "" {
		return ErrDeviceForgotten
	}
	m.keepLocked(Ballot{DeviceKey: a.DeviceKey, Answer: &a})
	return nil
}

func (m *memoryStore) SaveStep(_ context.Context, s MirrorStep) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.mirror.forgotten[s.DeviceKey] != "" {
		return ErrDeviceForgotten
	}
	byQ := m.mirror.steps[s.DeviceKey]
	if byQ == nil {
		byQ = map[string]MirrorStep{}
		m.mirror.steps[s.DeviceKey] = byQ
	}
	if prev, ok := byQ[s.QuestionID]; ok {
		s.Started = prev.Started
	}
	byQ[s.QuestionID] = s
	return nil
}

func (m *memoryStore) SavePlanCheck(_ context.Context, c PlanCheck) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.mirror.forgotten[c.DeviceKey] != "" {
		return ErrDeviceForgotten
	}
	byKey := m.mirror.checks[c.DeviceKey]
	if byKey == nil {
		byKey = map[string]PlanCheck{}
		m.mirror.checks[c.DeviceKey] = byKey
	}
	if _, ok := byKey[c.Key]; !ok {
		byKey[c.Key] = c
	}
	return nil
}

func (m *memoryStore) PlanChecks(_ context.Context, deviceKey, from, to string) ([]PlanCheck, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []PlanCheck
	for _, c := range m.mirror.checks[deviceKey] {
		if c.Date >= from && c.Date <= to {
			out = append(out, c)
		}
	}
	slices.SortFunc(out, func(x, y PlanCheck) int {
		if c := strings.Compare(x.Date, y.Date); c != 0 {
			return c
		}
		return strings.Compare(x.Key, y.Key)
	})
	return out, nil
}

func (m *memoryStore) DeviceHistory(_ context.Context, deviceKey, from, to string) ([]MirrorAnswer, []MirrorStep, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, s := m.historyLocked(deviceKey, from, to)
	return a, s, nil
}

func (m *memoryStore) historyLocked(deviceKey, from, to string) ([]MirrorAnswer, []MirrorStep) {
	var answers []MirrorAnswer
	for _, a := range m.mirror.answers[deviceKey] {
		if a.Date >= from && a.Date <= to {
			answers = append(answers, a)
		}
	}
	var steps []MirrorStep
	for _, s := range m.mirror.steps[deviceKey] {
		if s.Started >= from && s.Started <= to {
			steps = append(steps, s)
		}
	}
	slices.SortFunc(answers, func(x, y MirrorAnswer) int {
		if c := strings.Compare(x.Date, y.Date); c != 0 {
			return c
		}
		if x.Evening != y.Evening {
			return boolCompare(x.Evening, y.Evening)
		}
		return strings.Compare(x.QuestionID, y.QuestionID)
	})
	slices.SortFunc(steps, func(x, y MirrorStep) int { return strings.Compare(x.Started, y.Started) })
	return answers, steps
}

func (m *memoryStore) EachDevice(_ context.Context, from, to string, fn func(string, []MirrorAnswer, []MirrorStep) error) error {
	m.mu.Lock()
	keys := make([]string, 0, len(m.mirror.answers))
	type history struct {
		answers []MirrorAnswer
		steps   []MirrorStep
	}
	all := map[string]history{}
	for k := range m.mirror.answers {
		a, s := m.historyLocked(k, from, to)
		if len(a) > 0 {
			keys = append(keys, k)
			all[k] = history{a, s}
		}
	}
	m.mu.Unlock()
	slices.Sort(keys)
	for _, k := range keys {
		if err := fn(k, all[k].answers, all[k].steps); err != nil {
			return err
		}
	}
	return nil
}

func (m *memoryStore) ForgetDevice(_ context.Context, deviceKey string, voterHashes []string, today string) (Forgotten, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	f := Forgotten{Answers: len(m.mirror.answers[deviceKey]), Steps: len(m.mirror.steps[deviceKey]),
		PlanChecks: len(m.mirror.checks[deviceKey]), Weeks: len(m.mirror.weeks[deviceKey])}
	delete(m.mirror.answers, deviceKey)
	delete(m.mirror.steps, deviceKey)
	delete(m.mirror.checks, deviceKey)
	delete(m.mirror.weeks, deviceKey)
	hashes := map[string]bool{}
	for _, h := range voterHashes {
		hashes[h] = true
	}
	f.Votes = m.dropEventsLocked(func(e VoteEvent) bool { return hashes[e.VoterHash] })
	if m.mirror.forgotten[deviceKey] == "" {
		m.mirror.forgotten[deviceKey] = today
	}
	return f, nil
}

func (m *memoryStore) DeviceData(_ context.Context, deviceKey string, voterHashes []string) (Kept, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := Kept{Steps: len(m.mirror.steps[deviceKey]), PlanChecks: len(m.mirror.checks[deviceKey]), Weeks: len(m.mirror.weeks[deviceKey])}
	for _, a := range m.mirror.answers[deviceKey] {
		k.Answers++
		if a.Private() {
			k.Private++
		}
		if k.FirstAnswer == "" || a.Date < k.FirstAnswer {
			k.FirstAnswer = a.Date
		}
	}
	hashes := map[string]bool{}
	for _, h := range voterHashes {
		hashes[h] = true
	}
	for _, e := range m.events {
		if hashes[e.VoterHash] {
			k.Votes++
		}
	}
	return k, nil
}

func (m *memoryStore) DeviceVotes(_ context.Context, voterHashes []string) ([]VoteEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	hashes := map[string]bool{}
	for _, h := range voterHashes {
		hashes[h] = true
	}
	var out []VoteEvent
	for _, e := range m.events {
		if hashes[e.VoterHash] {
			out = append(out, e)
		}
	}
	slices.SortStableFunc(out, func(x, y VoteEvent) int { return x.AcceptedAt.Compare(y.AcceptedAt) })
	return out, nil
}

func (m *memoryStore) DeleteMirrorBefore(_ context.Context, date string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, byQ := range m.mirror.answers {
		for q, a := range byQ {
			if a.Date < date {
				delete(byQ, q)
				n++
			}
		}
	}
	for _, byQ := range m.mirror.steps {
		for q, s := range byQ {
			if s.Started < date {
				delete(byQ, q)
				n++
			}
		}
	}
	for _, byKey := range m.mirror.checks {
		for k, c := range byKey {
			if c.Date < date {
				delete(byKey, k)
				n++
			}
		}
	}
	for k, on := range m.mirror.forgotten {
		if on < date {
			delete(m.mirror.forgotten, k)
			n++
		}
	}
	return n, nil
}

func (m *memoryStore) SaveWeekSummaries(_ context.Context, ws []WeekSummary) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range ws {
		if m.mirror.forgotten[w.DeviceKey] != "" {
			continue
		}
		from, to := summarySources(w.Monday)
		sourced := false
		for _, a := range m.mirror.answers[w.DeviceKey] {
			sourced = sourced || (a.Date >= from && a.Date <= to)
		}
		if !sourced {
			continue
		}
		byMonday := m.mirror.weeks[w.DeviceKey]
		if byMonday == nil {
			byMonday = map[string]WeekSummary{}
			m.mirror.weeks[w.DeviceKey] = byMonday
		}
		byMonday[w.Monday] = w
	}
	return nil
}

func (m *memoryStore) WeekSummaries(_ context.Context, deviceKey, from, to string) ([]WeekSummary, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []WeekSummary
	for monday, w := range m.mirror.weeks[deviceKey] {
		if monday >= from && monday <= to {
			out = append(out, w)
		}
	}
	slices.SortFunc(out, func(x, y WeekSummary) int { return strings.Compare(x.Monday, y.Monday) })
	return out, nil
}

func (m *memoryStore) MarkFolded(_ context.Context, monday string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mirror.folds[monday] = true
	return nil
}

func (m *memoryStore) FoldedWeeks(_ context.Context, from, to string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for monday := range m.mirror.folds {
		if monday >= from && monday <= to {
			out = append(out, monday)
		}
	}
	slices.Sort(out)
	return out, nil
}

func (m *memoryStore) DeleteWeeksBefore(_ context.Context, monday string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, byMonday := range m.mirror.weeks {
		for d := range byMonday {
			if d < monday {
				delete(byMonday, d)
				n++
			}
		}
	}
	for d := range m.mirror.folds {
		if d < monday {
			delete(m.mirror.folds, d)
			n++
		}
	}
	return n, nil
}

// boolCompare orders false before true.
func boolCompare(x, y bool) int {
	switch {
	case x == y:
		return 0
	case !x:
		return -1
	default:
		return 1
	}
}
