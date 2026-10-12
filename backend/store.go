package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// VoteEvent is one accepted vote. Events are append-only and ordered by Seq,
// which is what lets the aggregation worker resume from a cursor.
type VoteEvent struct {
	ID         string
	Seq        int64
	QuestionID string
	OptionID   string
	VoterID    string
	AcceptedAt time.Time
}

var (
	ErrDuplicateVote       = errors.New("duplicate vote")
	ErrIdempotencyKeyReuse = errors.New("idempotency key reused with a different vote")
)

// VoteStore is the durable boundary: a vote is acknowledged only after Accept
// returns. The in-memory implementation stands in until Postgres lands.
type VoteStore interface {
	// Accept records the vote once. Repeating the same idempotency key with the
	// same vote returns the original event; with a different vote it returns
	// ErrIdempotencyKeyReuse. A second vote under the same dedupe key returns
	// ErrDuplicateVote.
	Accept(idempotencyKey string, v VoteRequest, at time.Time) (VoteEvent, error)
	// EventsAfter returns up to limit events with Seq > after, in order.
	EventsAfter(after int64, limit int) []VoteEvent
}

type memoryStore struct {
	mu        sync.Mutex
	events    []VoteEvent
	byIdemKey map[string]int // scoped idempotency key -> index into events
	byDedupe  map[string]int // voteDedupeKey -> index into events
}

func newMemoryStore() *memoryStore {
	return &memoryStore{byIdemKey: map[string]int{}, byDedupe: map[string]int{}}
}

func (m *memoryStore) Accept(idempotencyKey string, v VoteRequest, at time.Time) (VoteEvent, error) {
	// Keys are scoped to the voter so one client cannot collide with another's.
	idem := v.VoterID + "\x00" + idempotencyKey
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

	e := VoteEvent{
		ID:         newEventID(),
		Seq:        int64(len(m.events)) + 1,
		QuestionID: v.QuestionID,
		OptionID:   v.OptionID,
		VoterID:    v.VoterID,
		AcceptedAt: at,
	}
	m.events = append(m.events, e)
	m.byIdemKey[idem] = len(m.events) - 1
	m.byDedupe[dedupe] = len(m.events) - 1
	return e, nil
}

func (m *memoryStore) EventsAfter(after int64, limit int) []VoteEvent {
	m.mu.Lock()
	defer m.mu.Unlock()
	if after < 0 {
		after = 0
	}
	if after >= int64(len(m.events)) {
		return nil
	}
	end := min(int(after)+limit, len(m.events))
	return append([]VoteEvent(nil), m.events[after:end]...)
}

func newEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err) // crypto/rand does not fail on supported platforms
	}
	return "evt_" + hex.EncodeToString(b[:])
}
