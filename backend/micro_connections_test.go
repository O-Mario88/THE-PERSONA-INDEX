package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Quiet nods and Answer Together: small, fixed, never counted, never fed to
// a mirror, and silent when muted.

// togetherBank is today's fixture set plus a private question and one with a
// heavy answer, neither of which may be shared.
type togetherBank struct{}

func (togetherBank) GetSet(date string) (DailySet, bool) {
	if date != today {
		return DailySet{}, false
	}
	set := todaySet
	set.Questions = append(append([]Question{}, todaySet.Questions...),
		Question{ID: "q-private", Care: careIntimate, Prompt: "A private question.", Options: []Option{{ID: "a", Label: "A"}, {ID: "b", Label: "B"}}},
		Question{ID: "q-heavy", Care: carePersonal, Prompt: "How heavy did this week feel?", Options: []Option{{ID: "light", Label: "Light"}, {ID: "heavy", Label: "Heavy", Heavy: true}}},
	)
	return set, true
}

func connectServer(t *testing.T) (*Server, *fakeSender) {
	t.Helper()
	s := NewServer(func() time.Time { return fixedNow }, togetherBank{}, testStore(), newDeviceSigner(testSecret))
	codes := &fakeSender{}
	s.signIn = SignInConfig{Codes: codes, CodeKinds: []string{"email"}}
	return s, codes
}

func nods(t *testing.T, s *Server, who SignedIn) NodsView {
	t.Helper()
	w := send(t, s, "GET", "/api/nods?date="+today, who.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[NodsView](t, w)
}

func TestQuietNods(t *testing.T) {
	s, codes := connectServer(t)
	ama, kofi, esi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Esi")
	befriend(t, s, ama, kofi)
	nod := func(from, to SignedIn, card int) *httptest.ResponseRecorder {
		return send(t, s, "POST", "/api/nods", from.AccountToken, nodBody{To: to.Account.ID, Card: card, Date: today})
	}

	if v := nods(t, s, ama); len(v.Cards) != 24 || len(v.Received) != 0 {
		t.Fatalf("24 fixed cards, nothing yet: %+v", v)
	}
	expectError(t, nod(ama, kofi, 24), http.StatusBadRequest, "unknown_card")
	expectError(t, nod(ama, kofi, -1), http.StatusBadRequest, "unknown_card")
	expectError(t, nod(ama, esi, 0), http.StatusNotFound, "not_friends")
	expectStatus(t, nod(ama, kofi, 3), http.StatusAccepted)
	expectError(t, nod(ama, kofi, 4), http.StatusConflict, "already_nodded")

	v := nods(t, s, kofi)
	if len(v.Received) != 1 || v.Received[0].From.Name != "Ama" || v.Received[0].Text != NodCards[3] || v.Received[0].Card != 3 {
		t.Fatalf("Kofi's nods: %+v", v.Received)
	}
	if sent := nods(t, s, ama).SentTo; len(sent) != 1 || sent[0] != kofi.Account.ID {
		t.Fatalf("Ama sent to: %v", sent)
	}

	t.Run("a muted friend's nod waits unseen, and the sender is never told", func(t *testing.T) {
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, map[string]any{"muted": true}), http.StatusOK)
		if v := nods(t, s, kofi); len(v.Received) != 0 {
			t.Fatalf("muted: %+v", v.Received)
		}
		expectStatus(t, nod(kofi, ama, 1), http.StatusAccepted) // Kofi can still nod
		if v := nods(t, s, ama); len(v.Received) != 1 {
			t.Fatal("Ama is not muted by herself")
		}
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, map[string]any{"muted": false}), http.StatusOK)
	})

	t.Run("turning connect off stops sending and seeing", func(t *testing.T) {
		expectStatus(t, send(t, s, "PATCH", "/api/account", kofi.AccountToken, map[string]any{"connect": false}), http.StatusOK)
		expectError(t, nod(kofi, ama, 2), http.StatusForbidden, "connect_off")
		if v := nods(t, s, kofi); len(v.Received) != 0 {
			t.Fatal("connect off hides nods")
		}
	})
}

func togethers(t *testing.T, s *Server, who SignedIn) []TogetherView {
	t.Helper()
	w := send(t, s, "GET", "/api/together", who.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[[]TogetherView](t, w)
}

func TestAnswerTogether(t *testing.T) {
	s, codes := connectServer(t)
	ama, kofi, esi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Esi")
	befriend(t, s, ama, kofi)
	befriend(t, s, ama, esi)
	ask := func(from SignedIn, to SignedIn, qid, opt string) *httptest.ResponseRecorder {
		return send(t, s, "POST", "/api/together", from.AccountToken, togetherBody{FriendID: to.Account.ID, QuestionID: qid, OptionID: opt})
	}

	t.Run("private and heavy questions are never shared", func(t *testing.T) {
		expectError(t, ask(ama, kofi, "q-private", "a"), http.StatusForbidden, "private_question")
		expectError(t, ask(ama, kofi, "q-heavy", "light"), http.StatusForbidden, "private_question")
	})
	expectError(t, ask(ama, kofi, "q-none", "a"), http.StatusNotFound, "unknown_question")
	expectError(t, ask(ama, kofi, "q-dishes", "nope"), http.StatusBadRequest, "unknown_option")
	stranger := named(t, s, codes, "Yaw")
	expectError(t, ask(ama, stranger, "q-dishes", "right-away"), http.StatusNotFound, "not_friends")

	w := ask(ama, kofi, "q-dishes", "right-away")
	expectStatus(t, w, http.StatusCreated)
	id := decode[map[string]string](t, w)["id"]
	expectError(t, ask(ama, kofi, "q-dishes", "when-full"), http.StatusConflict, "already_asked")

	mine := togethers(t, s, ama)
	if len(mine) != 1 || mine[0].State != "waiting" || mine[0].Mine != "right-away" || mine[0].Theirs != "" || !mine[0].Asked {
		t.Fatalf("Ama waits: %+v", mine)
	}
	theirs := togethers(t, s, kofi)
	if len(theirs) != 1 || theirs[0].State != "yours" || theirs[0].Theirs != "" || theirs[0].Mine != "" || theirs[0].With.Name != "Ama" {
		t.Fatalf("Kofi must not see Ama's choice before answering: %+v", theirs)
	}
	expectError(t, send(t, s, "POST", "/api/together/"+id, ama.AccountToken, togetherAnswer{OptionID: "end-of-day"}), http.StatusNotFound, "not_found")
	expectError(t, send(t, s, "POST", "/api/together/"+id, kofi.AccountToken, togetherAnswer{OptionID: "nope"}), http.StatusBadRequest, "unknown_option")

	w = send(t, s, "POST", "/api/together/"+id, kofi.AccountToken, togetherAnswer{OptionID: "end-of-day"})
	expectStatus(t, w, http.StatusOK)
	if got := decode[map[string]string](t, w); got["mine"] != "end-of-day" || got["theirs"] != "right-away" {
		t.Fatalf("answer reveals: %v", got)
	}
	expectError(t, send(t, s, "POST", "/api/together/"+id, kofi.AccountToken, togetherAnswer{OptionID: "when-full"}), http.StatusConflict, "already_answered")
	if v := togethers(t, s, ama); v[0].State != "revealed" || v[0].Theirs != "end-of-day" {
		t.Fatalf("Ama sees both now: %+v", v)
	}

	t.Run("it never feeds a mirror or a crowd count", func(t *testing.T) {
		ins, _ := s.social.FriendInputs(context.Background(), ama.Account.ID, "2000-01-01")
		ins2, _ := s.social.FriendInputs(context.Background(), kofi.Account.ID, "2000-01-01")
		if len(ins)+len(ins2) != 0 {
			t.Fatal("Answer Together fed the Outside Mirror")
		}
		if n := totalVotes(t, s, "q-dishes"); n != 0 {
			t.Fatalf("Answer Together counted as %d votes", n)
		}
	})

	t.Run("not this one hides it for the invitee only; the asker sees it lapse", func(t *testing.T) {
		w := ask(ama, esi, "q-bill", "even")
		eid := decode[map[string]string](t, w)["id"]
		expectStatus(t, send(t, s, "DELETE", "/api/together/"+eid, esi.AccountToken, nil), http.StatusNoContent)
		if len(togethers(t, s, esi)) != 0 {
			t.Fatal("hidden for Esi")
		}
		for _, v := range togethers(t, s, ama) {
			if v.ID == eid && v.State != "waiting" {
				t.Fatalf("Ama is never told it was declined: %+v", v)
			}
		}
		s.clock = func() time.Time { return fixedNow.Add(togetherLife + time.Minute) }
		defer func() { s.clock = func() time.Time { return fixedNow } }()
		for _, v := range togethers(t, s, ama) {
			if v.ID == eid && v.State != "expired" {
				t.Fatalf("after 48 hours it came and went: %+v", v)
			}
		}
	})

	t.Run("a muted asker's request never reaches the invitee", func(t *testing.T) {
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, map[string]any{"muted": true}), http.StatusOK)
		w := ask(ama, kofi, "q-alarm", "one")
		expectStatus(t, w, http.StatusCreated)
		for _, v := range togethers(t, s, kofi) {
			if v.QuestionID == "q-alarm" {
				t.Fatal("Kofi muted Ama")
			}
		}
	})

	t.Run("three open at once, at most", func(t *testing.T) {
		expectError(t, ask(ama, esi, "q-alarm", "one"), http.StatusTooManyRequests, "too_many_open")
	})

	t.Run("the asker can withdraw", func(t *testing.T) {
		expectStatus(t, send(t, s, "DELETE", "/api/together/"+id, ama.AccountToken, nil), http.StatusNoContent)
		expectError(t, send(t, s, "DELETE", "/api/together/"+id, esi.AccountToken, nil), http.StatusNotFound, "not_found")
	})
}
