package main

import (
	"cmp"
	"context"
	"errors"
	"log"
	"net/http"
	"slices"
	"time"
)

// Walk alongside one person (Edwin's brief, 2026-10-29: Paired Mirrors). Not
// everyone will invite a whole circle, but most people have one person: a
// partner, a sibling, a close friend. Two people already in each other's
// circle can agree to walk alongside each other, one person at a time.
//
//   - Neither ever sees the other's answers, readings or words.
//   - On Sunday each sees where their weeks rhymed and differed, worked out
//     here from what their answers reached for (the need behind each option)
//     and nothing else: never a heavy answer, never a private one, and only
//     once both answered at least pairMinAnswers times that week.
//   - It shows once either of them is a Patron; a Duo plan also makes the
//     other person a Patron (patron.go).
//   - Either can stop at any time, and leaving the circle or deleting the
//     account stops it too.

const (
	pairNone    = "none"
	pairAsked   = "asked"   // this person asked
	pairInvited = "invited" // this person was asked
	pairWalking = "walking"

	pairMinAnswers = 3
)

// Pair is one ask, or two people walking alongside each other.
type Pair struct {
	From    string // the account that asked
	To      string // the account asked
	Walking bool
	Since   string
}

var (
	ErrPairBusy = errors.New("pair: already walking alongside someone")
	ErrNoPair   = errors.New("pair: none")
)

// PairStore keeps the pairs. The memory and Postgres stores implement it.
type PairStore interface {
	// PairOf is the pair an account is in, as the one who asked, the one
	// asked, or walking.
	PairOf(ctx context.Context, accountID string) (Pair, bool, error)
	// AskPair records that from asked to, replacing from's own earlier ask;
	// ErrPairBusy when either is in any other pair.
	AskPair(ctx context.Context, from, to, today string) error
	// AcceptPair turns the ask made of to into walking; ErrNoPair when none.
	AcceptPair(ctx context.Context, to, today string) (Pair, error)
	// EndPair removes the pair an account is in, if any.
	EndPair(ctx context.Context, accountID string) error
}

// PairPerson is the other person, as the circle already shows them.
type PairPerson struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Handle string `json:"handle"`
}

// PairView is GET /api/pair.
type PairView struct {
	State string      `json:"state"`
	With  *PairPerson `json:"with,omitempty"`
	Since string      `json:"since,omitempty"`
}

// PairWeek is GET /api/pair/week: needs only, never an answer.
type PairWeek struct {
	With     string   `json:"with"`
	Unlocked bool     `json:"unlocked"`          // one of the two is a Patron
	Forming  bool     `json:"forming,omitempty"` // not enough answers from both yet
	Rhymes   []string `json:"rhymes,omitempty"`  // needs both reached for most
	Mine     string   `json:"mine,omitempty"`    // what this person reached for most, when it differs
	Theirs   string   `json:"theirs,omitempty"`  // what the other reached for most, when it differs
}

func (s *Server) pairView(ctx context.Context, accountID string) (PairView, error) {
	p, ok, err := s.pairs.PairOf(ctx, accountID)
	if err != nil || !ok {
		return PairView{State: pairNone}, err
	}
	other := p.To
	state := pairAsked
	if p.To == accountID {
		other, state = p.From, pairInvited
	}
	if p.Walking {
		state = pairWalking
	}
	acc, err := s.social.GetAccount(ctx, other)
	if err != nil {
		return PairView{State: pairNone}, err
	}
	return PairView{State: state, With: &PairPerson{ID: acc.ID, Name: acc.Name, Handle: acc.Handle}, Since: p.Since}, nil
}

// walkingWith is the account someone walks alongside, or "".
func (s *Server) walkingWith(ctx context.Context, accountID string) (string, error) {
	p, ok, err := s.pairs.PairOf(ctx, accountID)
	if err != nil || !ok || !p.Walking {
		return "", err
	}
	if p.From == accountID {
		return p.To, nil
	}
	return p.From, nil
}

// GetPair is GET /api/pair.
func (s *Server) GetPair(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	s.writePair(w, r, acc.ID)
}

type pairAsk struct {
	FriendID string `json:"friendId"`
}

// AskPair is POST /api/pair: ask someone in the circle.
func (s *Server) AskPair(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var req pairAsk
	if !readJSON(w, r, &req) {
		return
	}
	ctx := r.Context()
	if req.FriendID == "" || req.FriendID == acc.ID {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	friends, err := s.social.AreFriends(ctx, acc.ID, req.FriendID)
	if err != nil {
		log.Printf("pair: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if !friends {
		writeError(w, http.StatusForbidden, "not_friends")
		return
	}
	if err := s.pairs.AskPair(ctx, acc.ID, req.FriendID, s.today()); errors.Is(err, ErrPairBusy) {
		writeError(w, http.StatusConflict, "pair_busy")
		return
	} else if err != nil {
		log.Printf("pair: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	s.writePair(w, r, acc.ID)
}

// AcceptPair is POST /api/pair/accept.
func (s *Server) AcceptPair(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if _, err := s.pairs.AcceptPair(r.Context(), acc.ID, s.today()); errors.Is(err, ErrNoPair) {
		writeError(w, http.StatusNotFound, "no_pair")
		return
	} else if err != nil {
		log.Printf("pair: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	s.writePair(w, r, acc.ID)
}

// EndPair is DELETE /api/pair: stop, decline or take back an ask.
func (s *Server) EndPair(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if err := s.pairs.EndPair(r.Context(), acc.ID); err != nil {
		log.Printf("pair: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, PairView{State: pairNone})
}

func (s *Server) writePair(w http.ResponseWriter, r *http.Request, accountID string) {
	v, err := s.pairView(r.Context(), accountID)
	if err != nil {
		log.Printf("pair: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// GetPairWeek is GET /api/pair/week?monday=YYYY-MM-DD.
func (s *Server) GetPairWeek(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	monday := r.URL.Query().Get("monday")
	d, err := time.Parse(dateLayout, monday)
	if err != nil || d.Format(dateLayout) != monday || d.Weekday() != time.Monday || monday > s.today() {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	ctx := r.Context()
	partner, err := s.walkingWith(ctx, acc.ID)
	if err != nil {
		log.Printf("pair week: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if partner == "" {
		writeError(w, http.StatusNotFound, "no_pair")
		return
	}
	week, err := s.pairWeek(ctx, acc.ID, partner, monday)
	if err != nil {
		log.Printf("pair week: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, week)
}

func (s *Server) pairWeek(ctx context.Context, me, them, monday string) (PairWeek, error) {
	other, err := s.social.GetAccount(ctx, them)
	if err != nil {
		return PairWeek{}, err
	}
	week := PairWeek{With: other.Name}
	today := s.today()
	for _, id := range []string{me, them} {
		es, err := s.patron.Entitlements(ctx, "a:"+id)
		if err != nil {
			return PairWeek{}, err
		}
		if _, ok := bestOf(es, today, nil); ok {
			week.Unlocked = true
		}
	}
	if !week.Unlocked {
		return week, nil
	}
	mine, n1, err := s.needsInWeek(ctx, me, monday)
	if err != nil {
		return PairWeek{}, err
	}
	theirs, n2, err := s.needsInWeek(ctx, them, monday)
	if err != nil {
		return PairWeek{}, err
	}
	if n1 < pairMinAnswers || n2 < pairMinAnswers {
		week.Forming = true
		return week, nil
	}
	a, b := topNeeds(mine, 2), topNeeds(theirs, 2)
	for _, n := range a {
		if slices.Contains(b, n) {
			week.Rhymes = append(week.Rhymes, n)
		}
	}
	if a[0] != b[0] {
		week.Mine, week.Theirs = a[0], b[0]
	}
	return week, nil
}

// needsInWeek counts what one account's answers reached for in a week, from
// the question bank: never a private or heavy answer, or one without a need.
func (s *Server) needsInWeek(ctx context.Context, accountID, monday string) (map[string]int, int, error) {
	acc, err := s.social.GetAccount(ctx, accountID)
	if err != nil {
		return nil, 0, err
	}
	answers, _, err := s.mirror.DeviceHistory(ctx, s.devices.mirrorKey(s.devices.accountDeviceID(acc)), monday, addDaysISO(monday, 6))
	if err != nil {
		return nil, 0, err
	}
	counts := map[string]int{}
	n := 0
	for _, a := range answers {
		if a.Private() {
			continue
		}
		q, ok := s.questions.lookup(s.bank, a.Date, a.QuestionID)
		if !ok {
			continue
		}
		i := slices.IndexFunc(q.Options, func(o Option) bool { return o.ID == a.OptionID })
		if i < 0 || q.Options[i].Heavy || q.Options[i].Need == "" {
			continue
		}
		counts[q.Options[i].Need]++
		n++
	}
	return counts, n, nil
}

// topNeeds is the k needs reached for most, then by name.
func topNeeds(counts map[string]int, k int) []string {
	out := make([]string, 0, len(counts))
	for n := range counts {
		out = append(out, n)
	}
	slices.SortFunc(out, func(a, b string) int { return cmp.Or(cmp.Compare(counts[b], counts[a]), cmp.Compare(a, b)) })
	return out[:min(k, len(out))]
}

// endPairOf stops a walk when the circle or the account goes.
func (s *Server) endPairOf(ctx context.Context, accountID string) {
	if err := s.pairs.EndPair(ctx, accountID); err != nil {
		log.Printf("end pair: %v", err)
	}
}

// The in-memory store's side, under the memory store's lock.

func (m *memoryStore) pairIndex(accountID string) int {
	return slices.IndexFunc(m.pairs, func(p Pair) bool { return p.From == accountID || p.To == accountID })
}

func (m *memoryStore) PairOf(_ context.Context, accountID string) (Pair, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if i := m.pairIndex(accountID); i >= 0 {
		return m.pairs[i], true, nil
	}
	return Pair{}, false, nil
}

func (m *memoryStore) AskPair(_ context.Context, from, to, today string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if i := m.pairIndex(from); i >= 0 {
		if m.pairs[i].Walking || m.pairs[i].From != from {
			return ErrPairBusy
		}
		m.pairs = slices.Delete(m.pairs, i, i+1)
	}
	if m.pairIndex(to) >= 0 {
		return ErrPairBusy
	}
	m.pairs = append(m.pairs, Pair{From: from, To: to, Since: today})
	return nil
}

func (m *memoryStore) AcceptPair(_ context.Context, to, today string) (Pair, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	i := m.pairIndex(to)
	if i < 0 || m.pairs[i].To != to || m.pairs[i].Walking {
		return Pair{}, ErrNoPair
	}
	m.pairs[i].Walking = true
	m.pairs[i].Since = today
	return m.pairs[i], nil
}

func (m *memoryStore) EndPair(_ context.Context, accountID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if i := m.pairIndex(accountID); i >= 0 {
		m.pairs = slices.Delete(m.pairs, i, i+1)
	}
	return nil
}
