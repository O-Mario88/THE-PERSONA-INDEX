package main

import (
	"cmp"
	"context"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The Persona Index Patron (Edwin's brief, 2026-10-29). A person is a Patron
// while they hold a plan they bought: monthly or yearly, the Duo plans that
// also open Patron for the one person they walk alongside (pair.go), a
// Founding Member place that never ends, or a 90-day or one-year prepaid
// pass. What they hold is kept under their account once they sign in, or
// under this phone (a keyed hash of its pass) until then; signing in moves a
// phone's purchases to the account, so they follow the person to every
// device. No address, card or name is kept here: only the plan, its last
// day, where it came from and the store's own reference.
//
// Until the App Store, Google Play and the web checkout are set up, test
// purchases stand in for them: on a local run, or where PATRON_TEST=1.

const (
	planMonthly    = "monthly"
	planYearly     = "yearly"
	planDuoMonthly = "duo_monthly"
	planDuoYearly  = "duo_yearly"
	planFounding   = "founding"
	planPass90     = "pass_90"
	planPass365    = "pass_365"

	defaultFoundingLimit = 1000
	sourceTest           = "test"
)

// planDays is how many days each plan holds from the day it is bought; 0
// means it never ends.
var planDays = map[string]int{planMonthly: 31, planYearly: 366, planDuoMonthly: 31, planDuoYearly: 366, planFounding: 0, planPass90: 90, planPass365: 365}

func isDuo(plan string) bool { return plan == planDuoMonthly || plan == planDuoYearly }

// Entitlement is one plan someone holds.
type Entitlement struct {
	Owner  string // "a:" and an account id, or "d:" and this phone's patronKey
	Plan   string
	Since  string // YYYY-MM-DD, the day it began
	Until  string // YYYY-MM-DD, its last day; empty for a Founding place
	Source string // apple, google, web or test
	Ref    string // the store's own reference: one entitlement per reference
}

// PatronStore keeps the entitlements. The memory and Postgres stores implement it.
type PatronStore interface {
	// SaveEntitlement keeps an entitlement once; it reports false when one
	// with the same reference is kept already.
	SaveEntitlement(ctx context.Context, e Entitlement) (bool, error)
	Entitlements(ctx context.Context, owner string) ([]Entitlement, error)
	// MoveEntitlements gives everything one owner holds to another, when a
	// phone signs in to an account.
	MoveEntitlements(ctx context.Context, from, to string) error
	CountPlan(ctx context.Context, plan string) (int, error)
	// DeleteEntitlements deletes one owner's entitlements from one source
	// (test purchases, so they can be tried again).
	DeleteEntitlements(ctx context.Context, owner, source string) (int, error)
}

// PatronConfig is what the server offers, from the environment.
type PatronConfig struct {
	Test          bool // test purchases: local runs, or PATRON_TEST=1
	FoundingLimit int  // how many Founding Member places there are
}

func patronFromEnv(getenv func(string) string, local bool) PatronConfig {
	c := PatronConfig{Test: local || strings.TrimSpace(getenv("PATRON_TEST")) == "1", FoundingLimit: defaultFoundingLimit}
	if n, err := strconv.Atoi(strings.TrimSpace(getenv("FOUNDING_LIMIT"))); err == nil && n >= 0 {
		c.FoundingLimit = n
	}
	return c
}

// PatronView is GET /api/patron.
type PatronView struct {
	Plan         string `json:"plan"`          // empty when none
	Until        string `json:"until"`         // empty for a Founding place, or none
	Via          string `json:"via,omitempty"` // "duo": through the person they walk alongside
	FoundingLeft int    `json:"foundingLeft"`
	Test         bool   `json:"test,omitempty"` // test purchases are open here
}

// patronOwner is whose purchases a request reads: the account when signed
// in, otherwise this phone. It writes the error itself.
func (s *Server) patronOwner(w http.ResponseWriter, r *http.Request) (owner, accountID string, ok bool) {
	if a, _, signed := s.accountFromHeader(r); signed {
		return "a:" + a.ID, a.ID, true
	}
	if id, valid := s.deviceFromHeader(r); valid {
		return "d:" + s.devices.patronKey(id), "", true
	}
	writeError(w, http.StatusUnauthorized, "invalid_device")
	return "", "", false
}

// bestOf is the entitlement that holds longest of those holding today.
func bestOf(es []Entitlement, today string, keep func(Entitlement) bool) (Entitlement, bool) {
	var best Entitlement
	found := false
	for _, e := range es {
		if (e.Until != "" && e.Until < today) || (keep != nil && !keep(e)) {
			continue
		}
		if !found || e.Until == "" || (best.Until != "" && e.Until > best.Until) {
			best, found = e, true
		}
	}
	return best, found
}

// patronOf says what an owner holds today: their own plan, or Patron
// through a Duo plan held by the person they walk alongside.
func (s *Server) patronOf(ctx context.Context, owner, accountID, today string) (PatronView, error) {
	es, err := s.patron.Entitlements(ctx, owner)
	if err != nil {
		return PatronView{}, err
	}
	if best, ok := bestOf(es, today, nil); ok {
		return PatronView{Plan: best.Plan, Until: best.Until}, nil
	}
	if accountID == "" {
		return PatronView{}, nil
	}
	partner, err := s.walkingWith(ctx, accountID)
	if err != nil || partner == "" {
		return PatronView{}, err
	}
	theirs, err := s.patron.Entitlements(ctx, "a:"+partner)
	if err != nil {
		return PatronView{}, err
	}
	if duo, ok := bestOf(theirs, today, func(e Entitlement) bool { return isDuo(e.Plan) }); ok {
		return PatronView{Plan: duo.Plan, Until: duo.Until, Via: "duo"}, nil
	}
	return PatronView{}, nil
}

func (s *Server) foundingLeft(ctx context.Context) (int, error) {
	n, err := s.patron.CountPlan(ctx, planFounding)
	return max(0, s.patronCfg.FoundingLimit-n), err
}

// GetPatron is GET /api/patron.
func (s *Server) GetPatron(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	owner, accountID, ok := s.patronOwner(w, r)
	if !ok {
		return
	}
	if ok, retry := s.accountLimit.Allow(owner, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	view, err := s.patronOf(r.Context(), owner, accountID, s.today())
	if err == nil {
		view.FoundingLeft, err = s.foundingLeft(r.Context())
	}
	if err != nil {
		log.Printf("patron: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	view.Test = s.patronCfg.Test
	writeJSON(w, http.StatusOK, view)
}

type testPurchase struct {
	Plan string `json:"plan"`
}

// TestPurchase is POST /api/patron/test: a plan without paying, where test
// purchases are open.
func (s *Server) TestPurchase(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.patronCfg.Test {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	owner, accountID, ok := s.patronOwner(w, r)
	if !ok {
		return
	}
	if ok, retry := s.accountLimit.Allow(owner, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	var req testPurchase
	if !readJSON(w, r, &req) {
		return
	}
	days, known := planDays[req.Plan]
	if !known {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	ctx := r.Context()
	if req.Plan == planFounding {
		left, err := s.foundingLeft(ctx)
		if err != nil {
			log.Printf("patron: %v", err)
			writeError(w, http.StatusServiceUnavailable, "unavailable")
			return
		}
		if left == 0 {
			writeError(w, http.StatusConflict, "founding_full")
			return
		}
	}
	today := s.today()
	e := Entitlement{Owner: owner, Plan: req.Plan, Since: today, Source: sourceTest, Ref: "test-" + randomID()}
	if days > 0 {
		e.Until = addDaysISO(today, days-1)
	}
	if _, err := s.patron.SaveEntitlement(ctx, e); err != nil {
		log.Printf("patron: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	view, err := s.patronOf(ctx, owner, accountID, today)
	if err == nil {
		view.FoundingLeft, err = s.foundingLeft(ctx)
	}
	if err != nil {
		log.Printf("patron: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	view.Test = true
	writeJSON(w, http.StatusOK, view)
}

// ClearTestPurchases is DELETE /api/patron/test.
func (s *Server) ClearTestPurchases(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.patronCfg.Test {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	owner, _, ok := s.patronOwner(w, r)
	if !ok {
		return
	}
	n, err := s.patron.DeleteEntitlements(r.Context(), owner, sourceTest)
	if err != nil {
		log.Printf("patron: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"cleared": n})
}

// movePatron gives a phone's purchases to the account it signed in to.
func (s *Server) movePatron(ctx context.Context, deviceID, accountID string) {
	if err := s.patron.MoveEntitlements(ctx, "d:"+s.devices.patronKey(deviceID), "a:"+accountID); err != nil {
		log.Printf("move patron: %v", err) // they stay with the phone; signing in still works
	}
}

func addDaysISO(date string, n int) string {
	d, err := time.Parse(dateLayout, date)
	if err != nil {
		return date
	}
	return d.AddDate(0, 0, n).Format(dateLayout)
}

// The in-memory store's side, under the memory store's lock.

func (m *memoryStore) SaveEntitlement(_ context.Context, e Entitlement) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, list := range m.patron {
		if slices.ContainsFunc(list, func(x Entitlement) bool { return x.Ref == e.Ref }) {
			return false, nil
		}
	}
	m.patron[e.Owner] = append(m.patron[e.Owner], e)
	return true, nil
}

func (m *memoryStore) Entitlements(_ context.Context, owner string) ([]Entitlement, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := slices.Clone(m.patron[owner])
	slices.SortFunc(out, func(a, b Entitlement) int { return cmp.Compare(a.Since, b.Since) })
	return out, nil
}

func (m *memoryStore) MoveEntitlements(_ context.Context, from, to string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if from == to {
		return nil
	}
	for _, e := range m.patron[from] {
		e.Owner = to
		m.patron[to] = append(m.patron[to], e)
	}
	delete(m.patron, from)
	return nil
}

func (m *memoryStore) CountPlan(_ context.Context, plan string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, list := range m.patron {
		for _, e := range list {
			if e.Plan == plan {
				n++
			}
		}
	}
	return n, nil
}

func (m *memoryStore) DeleteEntitlements(_ context.Context, owner, source string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	kept := slices.DeleteFunc(slices.Clone(m.patron[owner]), func(e Entitlement) bool { return e.Source == source })
	n := len(m.patron[owner]) - len(kept)
	m.patron[owner] = kept
	return n, nil
}
