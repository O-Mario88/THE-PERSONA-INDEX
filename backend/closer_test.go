package main

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

// Connect 3.0 (Edwin, 2026-10-25): private by default; a selected insight
// shared only with chosen friends and withdrawable; Common Ground only when
// both people have opted in to each other; and support asked for with a
// fixed phrase, with no read receipts.

func TestSharedInsights(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi, joel := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Joel")
	befriend(t, s, ama, kofi)
	befriend(t, s, ama, joel)

	t.Run("goes only to the friends chosen", func(t *testing.T) {
		w := send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{
			"kind": "helped", "theme": "managing-stress",
			"text": "Taking a short break before responding to a stressful situation helped me think more clearly.",
			"to":   []string{kofi.Account.ID},
		})
		expectStatus(t, w, http.StatusCreated)
		got := decode[SharesView](t, send(t, s, "GET", "/api/shares", kofi.AccountToken, nil))
		if len(got.Received) != 1 || got.Received[0].From.Name != "Ama" || got.Received[0].Theme != "managing-stress" {
			t.Fatalf("Kofi should see Ama's insight, got %+v", got.Received)
		}
		if n := len(decode[SharesView](t, send(t, s, "GET", "/api/shares", joel.AccountToken, nil)).Received); n != 0 {
			t.Fatalf("Joel was not chosen, yet sees %d", n)
		}
		sent := decode[SharesView](t, send(t, s, "GET", "/api/shares", ama.AccountToken, nil)).Sent
		if len(sent) != 1 || !slices.Equal(sent[0].To, []string{"Kofi"}) {
			t.Fatalf("Ama should see whom she shared with, got %+v", sent)
		}
	})

	t.Run("can be withdrawn, and then is gone for the friend", func(t *testing.T) {
		id := decode[SharesView](t, send(t, s, "GET", "/api/shares", ama.AccountToken, nil)).Sent[0].ID
		expectStatus(t, send(t, s, "DELETE", "/api/shares/"+id, kofi.AccountToken, nil), http.StatusNotFound)
		expectStatus(t, send(t, s, "DELETE", "/api/shares/"+id, ama.AccountToken, nil), http.StatusNoContent)
		if n := len(decode[SharesView](t, send(t, s, "GET", "/api/shares", kofi.AccountToken, nil)).Received); n != 0 {
			t.Fatalf("a withdrawn insight still shows %d times", n)
		}
	})

	t.Run("refuses a stranger, an unknown kind or theme, and a link", func(t *testing.T) {
		stranger := named(t, s, codes, "Sarah")
		ok := map[string]any{"kind": "win", "theme": "building-habits", "text": "I kept my morning walk going all week, even on the busy days."}
		for name, body := range map[string]map[string]any{
			"stranger":      withField(ok, "to", []string{stranger.Account.ID}),
			"unknown kind":  withField(withField(ok, "kind", "rant"), "to", []string{kofi.Account.ID}),
			"unknown theme": withField(withField(ok, "theme", "politics"), "to", []string{kofi.Account.ID}),
			"a link":        withField(withField(ok, "text", "Read this, it helped: https://example.com/article"), "to", []string{kofi.Account.ID}),
			"no one":        withField(ok, "to", []string{}),
		} {
			if w := send(t, s, "POST", "/api/shares", ama.AccountToken, body); w.Code != http.StatusBadRequest && w.Code != http.StatusForbidden {
				t.Errorf("%s: expected a refusal, got %d", name, w.Code)
			}
		}
	})
}

func TestCommonGround(t *testing.T) {
	s, codes := accountServer(t)
	ama, daniel := named(t, s, codes, "Ama"), named(t, s, codes, "Daniel")
	befriend(t, s, ama, daniel)
	put := func(who SignedIn, tags ...string) {
		expectStatus(t, send(t, s, "PUT", "/api/common", who.AccountToken, map[string]any{"tags": tags}), http.StatusNoContent)
	}
	consent := func(who, friend SignedIn, on bool) {
		expectStatus(t, send(t, s, "PUT", "/api/common/friends/"+friend.Account.ID, who.AccountToken, map[string]bool{"on": on}), http.StatusNoContent)
	}
	get := func(who SignedIn) CommonView {
		w := send(t, s, "GET", "/api/common", who.AccountToken, nil)
		expectStatus(t, w, http.StatusOK)
		return decode[CommonView](t, w)
	}
	put(ama, "peace-calm", "work-life", "growth")
	put(daniel, "peace-calm", "growth", "adventure")

	t.Run("shows nothing until both have opted in to each other", func(t *testing.T) {
		consent(ama, daniel, true)
		if p := get(ama).Pairs; len(p) != 0 {
			t.Fatalf("Daniel has not opted in, yet Ama sees %+v", p)
		}
		if p := get(daniel).Pairs; len(p) != 0 {
			t.Fatalf("Daniel has not opted in, yet sees %+v", p)
		}
	})

	t.Run("then only the overlap, never the rest", func(t *testing.T) {
		consent(daniel, ama, true)
		p := get(ama).Pairs
		if len(p) != 1 || p[0].Friend.Name != "Daniel" || !slices.Equal(p[0].Shared, []string{"growth", "peace-calm"}) {
			t.Fatalf("expected growth and peace-calm with Daniel, got %+v", p)
		}
		if slices.Contains(p[0].Shared, "adventure") || slices.Contains(p[0].Shared, "work-life") {
			t.Fatal("a tag only one of them holds leaked")
		}
	})

	t.Run("is withdrawn by either person", func(t *testing.T) {
		consent(daniel, ama, false)
		if p := get(ama).Pairs; len(p) != 0 {
			t.Fatalf("Daniel withdrew, yet Ama still sees %+v", p)
		}
	})

	t.Run("takes only tags from the fixed list", func(t *testing.T) {
		expectStatus(t, send(t, s, "PUT", "/api/common", ama.AccountToken, map[string]any{"tags": []string{"anxiety"}}), http.StatusBadRequest)
	})
}

func TestReachOut(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
	befriend(t, s, ama, kofi)

	t.Run("sends one fixed phrase to one friend, and the friend can put it away", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/reachouts", ama.AccountToken, map[string]string{"to": kofi.Account.ID, "kind": "support", "phrase": "talk"}), http.StatusCreated)
		got := decode[ReachOutsView](t, send(t, s, "GET", "/api/reachouts", kofi.AccountToken, nil)).Received
		if len(got) != 1 || got[0].From.Name != "Ama" || got[0].Text != "Could we talk for a few minutes?" {
			t.Fatalf("expected Ama's message, got %+v", got)
		}
		expectStatus(t, send(t, s, "DELETE", "/api/reachouts/"+got[0].ID, kofi.AccountToken, nil), http.StatusNoContent)
		if n := len(decode[ReachOutsView](t, send(t, s, "GET", "/api/reachouts", kofi.AccountToken, nil)).Received); n != 0 {
			t.Fatalf("put away, yet %d remain", n)
		}
	})

	t.Run("never tells the sender whether it was seen", func(t *testing.T) {
		if n := len(decode[ReachOutsView](t, send(t, s, "GET", "/api/reachouts", ama.AccountToken, nil)).Received); n != 0 {
			t.Fatalf("the sender's list holds %d; it should hold only what she received", n)
		}
	})

	t.Run("takes only the fixed phrases, once a day per friend", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/reachouts", ama.AccountToken, map[string]string{"to": kofi.Account.ID, "kind": "support", "phrase": "free text"}), http.StatusBadRequest)
		expectStatus(t, send(t, s, "POST", "/api/reachouts", ama.AccountToken, map[string]string{"to": kofi.Account.ID, "kind": "celebrate", "phrase": "win"}), http.StatusCreated)
		expectStatus(t, send(t, s, "POST", "/api/reachouts", ama.AccountToken, map[string]string{"to": kofi.Account.ID, "kind": "celebrate", "phrase": "win"}), http.StatusConflict)
	})
}

func TestUnfriendingEndsWhatWasShared(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
	befriend(t, s, ama, kofi)
	expectStatus(t, send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{"kind": "win", "theme": "building-habits", "text": "I kept my morning walk going all week.", "to": []string{kofi.Account.ID}}), http.StatusCreated)
	expectStatus(t, send(t, s, "PUT", "/api/common/friends/"+kofi.Account.ID, ama.AccountToken, map[string]bool{"on": true}), http.StatusNoContent)
	expectStatus(t, send(t, s, "DELETE", "/api/circle/friends/"+kofi.Account.ID, ama.AccountToken, nil), http.StatusNoContent)
	if n := len(decode[SharesView](t, send(t, s, "GET", "/api/shares", kofi.AccountToken, nil)).Received); n != 0 {
		t.Fatalf("after disconnecting, Kofi still sees %d shares", n)
	}
}

func withField(m map[string]any, k string, v any) map[string]any {
	out := map[string]any{}
	for a, b := range m {
		out[a] = b
	}
	out[k] = v
	return out
}

func TestMutingHidesWhatAFriendShares(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
	befriend(t, s, ama, kofi)
	expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, map[string]bool{"muted": true}), http.StatusOK)
	expectStatus(t, send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{"kind": "win", "theme": "building-habits", "text": "I kept my morning walk going all week.", "to": []string{kofi.Account.ID}}), http.StatusCreated)
	expectStatus(t, send(t, s, "POST", "/api/reachouts", ama.AccountToken, map[string]string{"to": kofi.Account.ID, "kind": "support", "phrase": "talk"}), http.StatusCreated)
	if n := len(decode[SharesView](t, send(t, s, "GET", "/api/shares", kofi.AccountToken, nil)).Received); n != 0 {
		t.Fatalf("Kofi muted Ama, yet sees %d shares", n)
	}
	if n := len(decode[ReachOutsView](t, send(t, s, "GET", "/api/reachouts", kofi.AccountToken, nil)).Received); n != 0 {
		t.Fatalf("Kofi muted Ama, yet sees %d reach-outs", n)
	}
}

func TestDeletingAnAccountTakesItsClosenessWithIt(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
	befriend(t, s, ama, kofi)
	expectStatus(t, send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{"kind": "win", "theme": "building-habits", "text": "I kept my morning walk going all week.", "to": []string{kofi.Account.ID}}), http.StatusCreated)
	expectStatus(t, send(t, s, "PUT", "/api/common", ama.AccountToken, map[string]any{"tags": []string{"growth"}}), http.StatusNoContent)
	expectStatus(t, send(t, s, "PUT", "/api/common/friends/"+kofi.Account.ID, ama.AccountToken, map[string]bool{"on": true}), http.StatusNoContent)
	expectStatus(t, send(t, s, "PUT", "/api/common/friends/"+ama.Account.ID, kofi.AccountToken, map[string]bool{"on": true}), http.StatusNoContent)
	expectStatus(t, send(t, s, "DELETE", "/api/account", ama.AccountToken, nil), http.StatusNoContent)
	if n := len(decode[SharesView](t, send(t, s, "GET", "/api/shares", kofi.AccountToken, nil)).Received); n != 0 {
		t.Fatalf("Ama deleted her account, yet Kofi sees %d shares", n)
	}
	got := decode[CommonView](t, send(t, s, "GET", "/api/common", kofi.AccountToken, nil))
	if len(got.Pairs) != 0 || len(got.OptedIn) != 0 {
		t.Fatalf("Ama deleted her account, yet Common Ground holds %+v", got)
	}
}

// The fixed words of Closer Together follow the voice rules (voice.go): UK
// spelling, no promises or forced cheer, never a comparison.
func TestCloserWordsKeepTheVoice(t *testing.T) {
	var lines []string
	for _, o := range ShareThemes {
		lines = append(lines, o.Label)
	}
	for _, c := range CommonTags {
		lines = append(lines, c.Label, c.Explore)
		h, _ := commonWords([]string{c.ID})
		lines = append(lines, h)
	}
	h, _ := commonWords([]string{"peace-calm", "growth"})
	lines = append(lines, h)
	for _, kind := range []string{"support", "celebrate"} {
		for _, o := range ReachPhrases[kind] {
			lines = append(lines, o.Label)
		}
	}
	fail := func(f string, a ...any) { t.Errorf(f, a...) }
	for _, l := range lines {
		checkWording(fail, "closer", l)
		if m := findComparison(l); m != "" {
			t.Errorf("%q compares (%q)", l, m)
		}
	}
	if h != "You both value peace and calm and growing as a person." {
		t.Fatalf("unexpected headline %q", h)
	}
}

// Coordinator review of #30: the overlap must not be a way to read a
// friend's whole list by swapping one's own tags. Tags change at most once a
// week; sending the same tags again is fine.
func TestCommonTagsChangeSlowly(t *testing.T) {
	s, codes := accountServer(t)
	ama := named(t, s, codes, "Ama")
	put := func(tags ...string) *httptest.ResponseRecorder {
		return send(t, s, "PUT", "/api/common", ama.AccountToken, map[string]any{"tags": tags})
	}
	expectStatus(t, put("peace-calm", "growth"), http.StatusNoContent)
	expectStatus(t, put("growth", "peace-calm"), http.StatusNoContent) // the same set
	w := put("adventure", "honesty")
	expectError(t, w, http.StatusTooManyRequests, "tags_changed_recently")
	if got := decode[CommonView](t, send(t, s, "GET", "/api/common", ama.AccountToken, nil)); !slices.Equal(got.Mine, []string{"growth", "peace-calm"}) || got.NextChange == "" {
		t.Fatalf("the refused change must leave the tags, and say when they can change: %+v", got)
	}
}

// Coordinator review of #30: someone who muted a friend, or turned Connect
// off, is not shown in that friend's Common Ground, the same rule as shares.
func TestCommonGroundRespectsMutingAndConnect(t *testing.T) {
	setup := func(t *testing.T) (*Server, SignedIn, SignedIn) {
		s, codes := accountServer(t)
		ama, daniel := named(t, s, codes, "Ama"), named(t, s, codes, "Daniel")
		befriend(t, s, ama, daniel)
		for _, who := range []SignedIn{ama, daniel} {
			expectStatus(t, send(t, s, "PUT", "/api/common", who.AccountToken, map[string]any{"tags": []string{"growth"}}), http.StatusNoContent)
		}
		expectStatus(t, send(t, s, "PUT", "/api/common/friends/"+daniel.Account.ID, ama.AccountToken, map[string]bool{"on": true}), http.StatusNoContent)
		expectStatus(t, send(t, s, "PUT", "/api/common/friends/"+ama.Account.ID, daniel.AccountToken, map[string]bool{"on": true}), http.StatusNoContent)
		if p := decode[CommonView](t, send(t, s, "GET", "/api/common", ama.AccountToken, nil)).Pairs; len(p) != 1 {
			t.Fatalf("expected the pair before muting, got %+v", p)
		}
		return s, ama, daniel
	}
	pairs := func(t *testing.T, s *Server, who SignedIn) []CommonPair {
		return decode[CommonView](t, send(t, s, "GET", "/api/common", who.AccountToken, nil)).Pairs
	}

	t.Run("Daniel muted Ama: Ama no longer sees him", func(t *testing.T) {
		s, ama, daniel := setup(t)
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, daniel.AccountToken, map[string]bool{"muted": true}), http.StatusOK)
		if p := pairs(t, s, ama); len(p) != 0 {
			t.Fatalf("Daniel muted Ama, yet she sees %+v", p)
		}
		if p := pairs(t, s, daniel); len(p) != 0 {
			t.Fatalf("Daniel muted Ama, yet he still sees her: %+v", p)
		}
	})

	t.Run("Daniel turned Connect off: no one sees him, and he sees no one", func(t *testing.T) {
		s, ama, daniel := setup(t)
		expectStatus(t, send(t, s, "PATCH", "/api/account", daniel.AccountToken, map[string]bool{"connect": false}), http.StatusOK)
		if p := pairs(t, s, ama); len(p) != 0 {
			t.Fatalf("Daniel turned Connect off, yet Ama sees %+v", p)
		}
		if p := pairs(t, s, daniel); len(p) != 0 {
			t.Fatalf("Daniel turned Connect off, yet he sees %+v", p)
		}
	})
}
