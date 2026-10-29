package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"maps"
	"slices"
	"strings"
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

// Option ids the server stores in place of a real one. Neither can be a bank
// option id, which is kebab-case.
const (
	// privateOption is stored for every answer to an intimate question: the
	// vote counts that one was given, never which option (review of
	// 2026-10-15). The phone sends it too, so the choice never leaves it.
	privateOption = "~private"
)

// Ballot is one vote or rating together with what the phone's mirror keeps of
// it, stored in one step so neither can exist without the other.
type Ballot struct {
	Vote
	// DeviceKey is the phone's mirror key. While a ballot is stored the
	// phone's rows are locked against a "Delete everything" running at the
	// same moment, and a phone that deleted everything takes no more ballots
	// under its old pass. Empty for a ballot with no mirror side.
	DeviceKey string
	Answer    *MirrorAnswer // a vote: the answer the mirror keeps
	Rating    *Rating       // a rating: noted on the answer the mirror keeps
	// Uncounted keeps the ballot out of the shared totals: the phone has not
	// chosen to add to them. It still holds the one-answer rule and reaches
	// the mirror.
	Uncounted bool
}

// Rating is the tap under the card (that's me, partly, not me), as the
// mirror notes it.
type Rating struct {
	QuestionID string // as the mirror stores it: a keyed hash for a private answer
	Verdict    string // verdictMe, verdictPartly or verdictNotMe
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
	uncounted  bool
}

var (
	ErrDuplicateVote       = errors.New("duplicate vote")
	ErrIdempotencyKeyReuse = errors.New("idempotency key reused with a different vote")
	// ErrDeviceForgotten: the phone deleted everything, and its old pass
	// takes no more writes. The phone gets a new pass and starts afresh.
	ErrDeviceForgotten = errors.New("device deleted everything")
)

// Store is everything the server keeps: votes and the phones' mirrors, in one
// database so a ballot and its mirror row commit together.
type Store interface {
	VoteStore
	MirrorStore
	VaultStore
	SocialStore
	HelpedStore
	PatronStore       // patron.go
	PairStore         // pair.go
	ProductCountStore // productcounts.go
}

// VoteStore is the durable boundary: a vote is acknowledged only after Accept
// returns. Postgres (pgstore.go) is the production store and also the queue:
// untallied rows are the backlog. The in-memory store backs local runs and
// the default test suite.
type VoteStore interface {
	// Accept records the ballot once, with its mirror side. Repeating the same
	// idempotency key with the same vote returns the original event and
	// stores the mirror side again if it is missing; with a different vote it
	// returns ErrIdempotencyKeyReuse. A second vote under the same dedupe key
	// (voterule.go) returns ErrDuplicateVote and stores nothing. A device that
	// deleted everything gets ErrDeviceForgotten and stores nothing.
	Accept(ctx context.Context, idempotencyKey string, b Ballot, at time.Time) (VoteEvent, error)
	// Tally folds up to limit untallied votes into the per-option counts and
	// reports how many it folded. Each vote is folded exactly once, even with
	// several workers running at the same time.
	Tally(ctx context.Context, limit int) (int, error)
	// Counts returns the tallied counts for one question, by option id.
	Counts(ctx context.Context, questionID string) (map[string]int, error)
	// DeleteTalliedBefore removes raw votes accepted before cutoff that are
	// already tallied. Tallies are kept forever; raw votes are not.
	DeleteTalliedBefore(ctx context.Context, cutoff time.Time) (int, error)
	// RatingTallies returns the counted taps under every card: rating key
	// (ratingKey) -> "<option>/<verdict>" -> count. They are anonymous
	// totals, the same numbers Counts gives one question at a time.
	RatingTallies(ctx context.Context) (map[string]map[string]int, error)
}

type memoryStore struct {
	mu            sync.Mutex
	events        []VoteEvent
	byIdemKey     map[string]int // scoped idempotency key -> index into events
	byDedupe      map[string]int // voteDedupeKey -> index into events
	counts        map[string]map[string]int
	mirror        memoryMirror                              // see mirrorstore.go
	vaults        map[string]memoryVault                    // see vault.go
	social        memorySocial                              // see socialmemory.go
	closer        memoryCloser                              // see closermemory.go
	helped        map[string]map[HelpedStepKey]HelpedReport // reporter key -> step -> report; see whathelped.go
	patron        map[string][]Entitlement                  // owner -> what they hold; see patron.go
	pairs         []Pair                                    // see pair.go
	productCounts map[string]map[string]int                 // day -> event -> count; see productcounts.go
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		byIdemKey: map[string]int{}, byDedupe: map[string]int{}, counts: map[string]map[string]int{},
		mirror: memoryMirror{answers: map[string]map[string]MirrorAnswer{}, steps: map[string]map[string]MirrorStep{},
			weeks: map[string]map[string]WeekSummary{}, folds: map[string]bool{}, forgotten: map[string]string{},
			checks: map[string]map[string]PlanCheck{}},
		vaults:        map[string]memoryVault{},
		social:        newMemorySocial(),
		closer:        newMemoryCloser(),
		helped:        map[string]map[HelpedStepKey]HelpedReport{},
		patron:        map[string][]Entitlement{},
		productCounts: map[string]map[string]int{},
	}
}

// idemScope scopes idempotency keys to the voter, so one client cannot
// collide with another's.
func idemScope(voterHash, key string) string { return voterHash + "\x00" + key }

func (m *memoryStore) Accept(_ context.Context, idempotencyKey string, b Ballot, at time.Time) (VoteEvent, error) {
	idem := idemScope(b.VoterHash, idempotencyKey)
	dedupe := voteDedupeKey(b.Vote)

	m.mu.Lock()
	defer m.mu.Unlock()

	if b.DeviceKey != "" && m.mirror.forgotten[b.DeviceKey] != "" {
		return VoteEvent{}, ErrDeviceForgotten
	}
	if i, ok := m.byIdemKey[idem]; ok {
		e := m.events[i]
		if e.QuestionID != b.QuestionID || e.OptionID != b.OptionID {
			return VoteEvent{}, ErrIdempotencyKeyReuse
		}
		m.keepLocked(b)
		return e, nil
	}
	if _, ok := m.byDedupe[dedupe]; ok {
		return VoteEvent{}, ErrDuplicateVote
	}

	e := VoteEvent{ID: newEventID(), QuestionID: b.QuestionID, OptionID: b.OptionID, VoterHash: b.VoterHash, AcceptedAt: at, idemKey: idempotencyKey, uncounted: b.Uncounted}
	m.events = append(m.events, e)
	m.byIdemKey[idem] = len(m.events) - 1
	m.byDedupe[dedupe] = len(m.events) - 1
	m.keepLocked(b)
	return e, nil
}

// keepLocked stores a ballot's mirror side: the first answer to a question
// wins, and a rating is noted once.
func (m *memoryStore) keepLocked(b Ballot) {
	if b.Answer != nil {
		a := *b.Answer
		byQ := m.mirror.answers[a.DeviceKey]
		if byQ == nil {
			byQ = map[string]MirrorAnswer{}
			m.mirror.answers[a.DeviceKey] = byQ
		}
		if _, ok := byQ[a.QuestionID]; !ok {
			byQ[a.QuestionID] = a
		}
	}
	if r := b.Rating; r != nil {
		if a, ok := m.mirror.answers[b.DeviceKey][r.QuestionID]; ok && a.Verdict == "" {
			a.Verdict = r.Verdict
			m.mirror.answers[b.DeviceKey][r.QuestionID] = a
		}
	}
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
		e.tallied = true
		n++
		if e.uncounted {
			continue
		}
		byOption := m.counts[e.QuestionID]
		if byOption == nil {
			byOption = map[string]int{}
			m.counts[e.QuestionID] = byOption
		}
		byOption[e.OptionID]++
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

func (m *memoryStore) RatingTallies(_ context.Context) (map[string]map[string]int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]map[string]int{}
	for q, byOption := range m.counts {
		if strings.HasPrefix(q, "rating/") {
			out[q] = maps.Clone(byOption)
		}
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
	return m.dropEventsLocked(func(e VoteEvent) bool { return e.tallied && e.AcceptedAt.Before(cutoff) }), nil
}

// dropEventsLocked removes the events drop picks and rebuilds the indexes.
func (m *memoryStore) dropEventsLocked(drop func(VoteEvent) bool) int {
	before := len(m.events)
	m.events = slices.DeleteFunc(m.events, drop)
	if len(m.events) == before {
		return 0
	}
	m.byIdemKey, m.byDedupe = map[string]int{}, map[string]int{}
	for i, e := range m.events {
		m.byIdemKey[idemScope(e.VoterHash, e.idemKey)] = i
		m.byDedupe[voteDedupeKey(Vote{QuestionID: e.QuestionID, OptionID: e.OptionID, VoterHash: e.VoterHash})] = i
	}
	return before - len(m.events)
}

func newEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err) // crypto/rand does not fail on supported platforms
	}
	return "evt_" + hex.EncodeToString(b[:])
}

// Backlog counts accepted votes not tallied yet, for the metrics.
func (m *memoryStore) Backlog(context.Context) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, e := range m.events {
		if !e.tallied {
			n++
		}
	}
	return n, nil
}

// Ping always answers: the memory store has no database to lose.
func (m *memoryStore) Ping(context.Context) error { return nil }
