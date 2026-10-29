package main

import (
	"net/http"
	"testing"
	"time"
)

// Walk alongside one person (Edwin's brief, 2026-10-29: Paired Mirrors). Two
// people in each other's circle agree to walk alongside each other. Neither
// ever sees the other's answers or words; on Sunday each sees where their
// weeks rhymed and differed, from what their answers reached for, once both
// answered enough that week and one of them is a Patron.

// pairBank asks three questions a day, each option reaching for a need, and
// one heavy option that is never counted.
type pairBank struct{}

func (pairBank) GetSet(date string) (DailySet, bool) {
	q := func(id, theme string, opts ...Option) Question {
		return Question{ID: date + "-" + id, Theme: theme, Care: careEveryday, Prompt: "A question.", Options: opts}
	}
	work := q("work", "work-career", Option{ID: "push", Label: "Push through", Depth: 2, Need: "competence"}, Option{ID: "rest", Label: "Take a break", Depth: 1, Need: "calm"})
	home := q("home", "home", Option{ID: "quiet", Label: "A quiet evening", Depth: 1, Need: "calm"}, Option{ID: "friends", Label: "Call a friend", Depth: 2, Need: "belonging"})
	talk := q("talk", "friendship",
		Option{ID: "listen", Label: "Listen", Depth: 1, Need: "understood"},
		Option{ID: "fix", Label: "Fix it", Depth: 2, Need: "competence"},
		Option{ID: "cry", Label: "Feel like crying", Depth: 4, Need: "understood", Heavy: true})
	return DailySet{Date: date, Questions: []Question{work, home, talk}, Pool: []Question{work, home, talk}}, true
}

const pairMonday = "2026-10-19"

func pairServer(t *testing.T) (*Server, *fakeSender) {
	t.Helper()
	at := mirrorDay(pairMonday)
	s := NewServer(func() time.Time { return at }, pairBank{}, testStore(), newDeviceSigner(testSecret))
	codes := &fakeSender{}
	s.signIn = SignInConfig{Codes: codes, CodeKinds: []string{"email", "phone"}}
	s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1000}
	return s, codes
}

func pairOf(t *testing.T, s *Server, who SignedIn) PairView {
	t.Helper()
	w := send(t, s, "GET", "/api/pair", who.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[PairView](t, w)
}

func pairWeek(t *testing.T, s *Server, who SignedIn) PairWeek {
	t.Helper()
	w := send(t, s, "GET", "/api/pair/week?monday="+pairMonday, who.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[PairWeek](t, w)
}

// answerAs votes as a signed-in account, under a short idempotency key.
func answerAs(t *testing.T, s *Server, who SignedIn, date, question, option string) {
	t.Helper()
	onDay(s, date)
	v := VoteRequest{QuestionID: date + "-" + question, OptionID: option, VoterID: who.DeviceToken}
	expectStatus(t, postVote(t, s, v, who.Account.Handle+"-"+date+"-"+question), http.StatusAccepted)
}

func walk(t *testing.T, s *Server, a, b SignedIn) {
	t.Helper()
	expectStatus(t, send(t, s, "POST", "/api/pair", a.AccountToken, map[string]string{"friendId": b.Account.ID}), http.StatusOK)
	expectStatus(t, send(t, s, "POST", "/api/pair/accept", b.AccountToken, nil), http.StatusOK)
}

func TestWalkAlongside(t *testing.T) {
	t.Run("asks someone in the circle, who walks alongside once they say yes", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
		befriend(t, s, ama, kofi)
		if v := pairOf(t, s, ama); v.State != pairNone {
			t.Fatalf("before asking: %+v", v)
		}
		expectStatus(t, send(t, s, "POST", "/api/pair", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID}), http.StatusOK)
		if v := pairOf(t, s, ama); v.State != pairAsked || v.With == nil || v.With.Name != "Kofi" {
			t.Fatalf("ama after asking: %+v", v)
		}
		if v := pairOf(t, s, kofi); v.State != pairInvited || v.With == nil || v.With.Name != "Ama" {
			t.Fatalf("kofi after the ask: %+v", v)
		}
		expectStatus(t, send(t, s, "POST", "/api/pair/accept", kofi.AccountToken, nil), http.StatusOK)
		if pairOf(t, s, ama).State != pairWalking || pairOf(t, s, kofi).State != pairWalking {
			t.Fatal("both should be walking alongside each other")
		}
	})

	t.Run("only someone in the circle, and one person at a time", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi, esi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Esi")
		expectError(t, send(t, s, "POST", "/api/pair", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID}), http.StatusForbidden, "not_friends")
		befriend(t, s, ama, kofi)
		befriend(t, s, esi, ama)
		walk(t, s, ama, kofi)
		expectError(t, send(t, s, "POST", "/api/pair", esi.AccountToken, map[string]string{"friendId": ama.Account.ID}), http.StatusConflict, "pair_busy")
	})

	t.Run("either can stop, and then it is over for both", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
		befriend(t, s, ama, kofi)
		walk(t, s, ama, kofi)
		expectStatus(t, send(t, s, "DELETE", "/api/pair", kofi.AccountToken, nil), http.StatusOK)
		if pairOf(t, s, ama).State != pairNone || pairOf(t, s, kofi).State != pairNone {
			t.Fatal("stopping ends it for both")
		}
	})

	t.Run("leaving the circle ends it too", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
		befriend(t, s, ama, kofi)
		walk(t, s, ama, kofi)
		expectStatus(t, send(t, s, "DELETE", "/api/circle/friends/"+kofi.Account.ID, ama.AccountToken, nil), http.StatusNoContent)
		if pairOf(t, s, kofi).State != pairNone {
			t.Fatal("disconnecting ends the walk")
		}
	})

	t.Run("a Duo plan makes the other person a Patron too; a plan of one's own does not", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
		befriend(t, s, ama, kofi)
		walk(t, s, ama, kofi)
		expectStatus(t, send(t, s, "POST", "/api/patron/test", ama.AccountToken, map[string]string{"plan": planYearly}), http.StatusOK)
		if v := patronOf(t, s, "", kofi.AccountToken); v.Plan != "" {
			t.Fatalf("a yearly plan is Ama's own: %+v", v)
		}
		expectStatus(t, send(t, s, "POST", "/api/patron/test", ama.AccountToken, map[string]string{"plan": planDuoYearly}), http.StatusOK)
		if v := patronOf(t, s, "", kofi.AccountToken); v.Plan != planDuoYearly || v.Via != "duo" {
			t.Fatalf("Kofi through Ama's Duo plan: %+v", v)
		}
	})

	t.Run("Sunday shows where the weeks rhymed and differed, from needs only, once one of them is a Patron", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
		befriend(t, s, ama, kofi)
		walk(t, s, ama, kofi)
		// Ama reaches for doing well, Kofi for feeling settled; both for feeling settled once.
		answerAs(t, s, ama, pairMonday, "work", "push")
		answerAs(t, s, ama, pairMonday, "home", "quiet")
		answerAs(t, s, ama, pairMonday, "talk", "fix")
		answerAs(t, s, ama, "2026-10-20", "work", "push")
		answerAs(t, s, kofi, pairMonday, "work", "rest")
		answerAs(t, s, kofi, pairMonday, "home", "quiet")
		answerAs(t, s, kofi, pairMonday, "talk", "listen")
		answerAs(t, s, kofi, "2026-10-20", "home", "quiet")
		answerAs(t, s, kofi, "2026-10-20", "talk", "cry") // heavy: never counted
		onDay(s, "2026-10-25")
		if w := pairWeek(t, s, ama); w.Unlocked || w.Rhymes != nil || w.Mine != "" || w.With != "Kofi" {
			t.Fatalf("without Patron nothing is shown: %+v", w)
		}
		expectStatus(t, send(t, s, "POST", "/api/patron/test", kofi.AccountToken, map[string]string{"plan": planMonthly}), http.StatusOK)
		w := pairWeek(t, s, ama)
		if !w.Unlocked || w.Forming || len(w.Rhymes) != 1 || w.Rhymes[0] != "calm" || w.Mine != "competence" || w.Theirs != "calm" {
			t.Fatalf("got %+v", w)
		}
		mirror := pairWeek(t, s, kofi)
		if mirror.Mine != "calm" || mirror.Theirs != "competence" {
			t.Fatalf("Kofi's side: %+v", mirror)
		}
	})

	t.Run("still forming until both answered three times that week", func(t *testing.T) {
		s, codes := pairServer(t)
		ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
		befriend(t, s, ama, kofi)
		walk(t, s, ama, kofi)
		expectStatus(t, send(t, s, "POST", "/api/patron/test", ama.AccountToken, map[string]string{"plan": planMonthly}), http.StatusOK)
		answerAs(t, s, ama, pairMonday, "work", "push")
		answerAs(t, s, ama, pairMonday, "home", "quiet")
		answerAs(t, s, ama, pairMonday, "talk", "fix")
		answerAs(t, s, kofi, pairMonday, "work", "rest")
		if w := pairWeek(t, s, ama); !w.Forming || w.Rhymes != nil || w.Mine != "" {
			t.Fatalf("got %+v", w)
		}
	})

	t.Run("no week without walking alongside someone", func(t *testing.T) {
		s, codes := pairServer(t)
		ama := named(t, s, codes, "Ama")
		expectError(t, send(t, s, "GET", "/api/pair/week?monday="+pairMonday, ama.AccountToken, nil), http.StatusNotFound, "no_pair")
		expectError(t, send(t, s, "GET", "/api/pair/week?monday=2026-10-20", ama.AccountToken, nil), http.StatusBadRequest, "invalid_request")
	})
}
