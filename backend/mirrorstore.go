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
// question id. Rows are deleted after mirrorRetention, and at once when the
// phone asks for everything to be deleted.

// MirrorAnswer is one answer as the mirror keeps it.
type MirrorAnswer struct {
	DeviceKey  string
	QuestionID string // a keyed hash for a private answer
	Date       string // the edition date, YYYY-MM-DD
	Theme      string
	OptionID   string // empty for a private answer
	Depth      int    // 0 for a private answer
	AnsweredAt time.Time
	Learned    *bool // the "I learned something" tap, once given
}

// Private reports whether the answer was kept without its option.
func (a MirrorAnswer) Private() bool { return a.OptionID == "" }

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

// MirrorStore is the durable side of the mirror. Both the in-memory store and
// Postgres implement it alongside VoteStore.
type MirrorStore interface {
	// SaveAnswer keeps one answer. Saving it again changes nothing, so a
	// retried vote is safe; the first answer to a question wins.
	SaveAnswer(ctx context.Context, a MirrorAnswer) error
	// SaveRating notes the "I learned something" tap on an answer already kept.
	SaveRating(ctx context.Context, deviceKey, questionID string, learned bool) error
	// SaveStep starts a step or records how it went; its start date is kept.
	SaveStep(ctx context.Context, s MirrorStep) error
	// DeviceHistory returns one device's answers dated in [from, to] and its
	// steps started in [from, to], oldest first.
	DeviceHistory(ctx context.Context, deviceKey, from, to string) ([]MirrorAnswer, []MirrorStep, error)
	// EachDevice calls fn once per device with an answer dated in [from, to],
	// with that device's answers in the range and its steps started in it.
	EachDevice(ctx context.Context, from, to string, fn func(deviceKey string, answers []MirrorAnswer, steps []MirrorStep) error) error
	// ForgetDevice deletes everything kept for one device.
	ForgetDevice(ctx context.Context, deviceKey string) error
	// DeleteMirrorBefore deletes answers dated, and steps started, before date,
	// and reports how many rows went.
	DeleteMirrorBefore(ctx context.Context, date string) (int, error)
}

// mirrorRetention is how long answers and steps are kept. The mirror reads
// three weeks of answers for each of the last three weeks, so it needs five.
const mirrorRetention = 35 * 24 * time.Hour

type memoryMirror struct {
	answers map[string]map[string]MirrorAnswer // device key -> question id -> answer
	steps   map[string]map[string]MirrorStep
}

func (m *memoryStore) SaveAnswer(_ context.Context, a MirrorAnswer) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	byQ := m.mirror.answers[a.DeviceKey]
	if byQ == nil {
		byQ = map[string]MirrorAnswer{}
		m.mirror.answers[a.DeviceKey] = byQ
	}
	if _, ok := byQ[a.QuestionID]; !ok {
		byQ[a.QuestionID] = a
	}
	return nil
}

func (m *memoryStore) SaveRating(_ context.Context, deviceKey, questionID string, learned bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.mirror.answers[deviceKey][questionID]; ok && a.Learned == nil {
		a.Learned = &learned
		m.mirror.answers[deviceKey][questionID] = a
	}
	return nil
}

func (m *memoryStore) SaveStep(_ context.Context, s MirrorStep) error {
	m.mu.Lock()
	defer m.mu.Unlock()
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
		return x.AnsweredAt.Compare(y.AnsweredAt)
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

func (m *memoryStore) ForgetDevice(_ context.Context, deviceKey string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.mirror.answers, deviceKey)
	delete(m.mirror.steps, deviceKey)
	return nil
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
	return n, nil
}
