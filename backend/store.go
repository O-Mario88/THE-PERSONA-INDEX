package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// Vote is an accepted ballot as the store sees it. The device id is already
// reduced to VoterHash; the raw id and token never reach storage.
type Vote struct {
	QuestionID string
	OptionID   string
	VoterHash  string
}

// VoteEvent is one accepted vote.
type VoteEvent struct {
	ID         string
	QuestionID string
	OptionID   string
	VoterHash  string
	AcceptedAt time.Time
	idemKey    string
	tallied    bool
}

var (
	ErrDuplicateVote       = errors.New("duplicate vote")
	ErrIdempotencyKeyReuse = errors.New("idempotency key reused with a different vote")
)

// VoteStore is the durable boundary: a vote is acknowledged only after Accept
// returns. Postgres (pgstore.go) is the production store and also the queue:
// untallied rows are the backlog. The in-memory store backs local runs and
// the default test suite.
type VoteStore interface {
	// Accept records the vote once. Repeating the same idempotency key with the
	// same vote returns the original event; with a different vote it returns
	// ErrIdempotencyKeyReuse. A second vote under the same dedupe key
	// (voterule.go) returns ErrDuplicateVote.
	Accept(ctx context.Context, idempotencyKey string, v Vote, at time.Time) (VoteEvent, error)
	// Tally folds up to limit untallied votes into the per-option counts and
	// reports how many it folded. Each vote is folded exactly once, even with
	// several workers running at the same time.
	Tally(ctx context.Context, limit int) (int, error)
	// Counts returns the tallied counts for one question, by option id.
	Counts(ctx context.Context, questionID string) (map[string]int, error)
	// DeleteTalliedBefore removes raw votes accepted before cutoff that are
	// already tallied. Tallies are kept forever; raw votes are not.
	DeleteTalliedBefore(ctx context.Context, cutoff time.Time) (int, error)
}

type memoryStore struct {
	mu        sync.Mutex
	events    []VoteEvent
	byIdemKey map[string]int // scoped idempotency key -> index into events
	byDedupe  map[string]int // voteDedupeKey -> index into events
	counts    map[string]map[string]int
	mirror    memoryMirror // see mirrorstore.go
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		byIdemKey: map[string]int{}, byDedupe: map[string]int{}, counts: map[string]map[string]int{},
		mirror: memoryMirror{answers: map[string]map[string]MirrorAnswer{}, steps: map[string]map[string]MirrorStep{},
			weeks: map[string]map[string]WeekSummary{}, folds: map[string]bool{}},
	}
}

func (m *memoryStore) Accept(_ context.Context, idempotencyKey string, v Vote, at time.Time) (VoteEvent, error) {
	// Keys are scoped to the voter so one client cannot collide with another's.
	idem := v.VoterHash + "\x00" + idempotencyKey
	dedupe := voteDedupeKey(v)

	m.mu.Lock()
	defer m.mu.Unlock()

	if i, ok := m.byIdemKey[idem]; ok {
		e := m.events[i]
		if e.QuestionID != v.QuestionID || e.OptionID != v.OptionID {
			return VoteEvent{}, ErrIdempotencyKeyReuse
		}
		return e, nil
	}
	if _, ok := m.byDedupe[dedupe]; ok {
		return VoteEvent{}, ErrDuplicateVote
	}

	e := VoteEvent{ID: newEventID(), QuestionID: v.QuestionID, OptionID: v.OptionID, VoterHash: v.VoterHash, AcceptedAt: at, idemKey: idempotencyKey}
	m.events = append(m.events, e)
	m.byIdemKey[idem] = len(m.events) - 1
	m.byDedupe[dedupe] = len(m.events) - 1
	return e, nil
}

func (m *memoryStore) Tally(_ context.Context, limit int) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for i := range m.events {
		if n == limit {
			break
		}
		e := &m.events[i]
		if e.tallied {
			continue
		}
		byOption := m.counts[e.QuestionID]
		if byOption == nil {
			byOption = map[string]int{}
			m.counts[e.QuestionID] = byOption
		}
		byOption[e.OptionID]++
		e.tallied = true
		n++
	}
	return n, nil
}

func (m *memoryStore) Counts(_ context.Context, questionID string) (map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]int, len(m.counts[questionID]))
	for k, v := range m.counts[questionID] {
		out[k] = v
	}
	return out, nil
}

// DeleteTalliedBefore drops raw events along with their dedupe and
// idempotency entries, as Postgres does when the rows go. That is safe
// because a question only takes votes on its own day plus the rollover grace,
// and retention is always far longer (see minRetention).
func (m *memoryStore) DeleteTalliedBefore(_ context.Context, cutoff time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	drop := map[int]bool{}
	kept := m.events[:0:0]
	for i, e := range m.events {
		if e.tallied && e.AcceptedAt.Before(cutoff) {
			drop[i] = true
			continue
		}
		kept = append(kept, e)
	}
	if len(drop) == 0 {
		return 0, nil
	}
	m.events = kept
	m.byIdemKey, m.byDedupe = map[string]int{}, map[string]int{}
	for i, e := range m.events {
		m.byIdemKey[e.VoterHash+"\x00"+e.idemKey] = i
		m.byDedupe[voteDedupeKey(Vote{QuestionID: e.QuestionID, OptionID: e.OptionID, VoterHash: e.VoterHash})] = i
	}
	return len(drop), nil
}

func newEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err) // crypto/rand does not fail on supported platforms
	}
	return "evt_" + hex.EncodeToString(b[:])
}
