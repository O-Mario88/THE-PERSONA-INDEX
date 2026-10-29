package main

import (
	"net/http"
	"strings"
	"testing"
)

// Connect as a place to feel understood by people you trust (Edwin,
// 2026-10-29): an item someone deliberately shares, with their name, the kind
// of response that would feel helpful, and private replies that stay between
// the two people. Removing one person ends their access, quietly.

func TestSharedItemsWithPeopleYouTrust(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi, joel := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Joel")
	befriend(t, s, ama, kofi)
	befriend(t, s, ama, joel)

	share := func(body map[string]any) string {
		t.Helper()
		w := send(t, s, "POST", "/api/shares", ama.AccountToken, body)
		expectStatus(t, w, http.StatusCreated)
		return decode[map[string]string](t, w)["id"]
	}
	received := func(who SignedIn) []ShareView {
		t.Helper()
		return decode[SharesView](t, send(t, s, "GET", "/api/shares", who.AccountToken, nil)).Received
	}

	t.Run("names who shared it, and says what would feel helpful", func(t *testing.T) {
		share(map[string]any{
			"kind": "reflection", "text": "I said no to an extra shift, but I still feel guilty.",
			"mode": "encourage", "replies": true, "audience": "people", "to": []string{kofi.Account.ID},
		})
		got := received(kofi)
		if len(got) != 1 || got[0].From.Name != "Ama" || got[0].Mode != "encourage" || got[0].Kind != "reflection" || !got[0].Replies {
			t.Fatalf("Kofi should see Ama's reflection, asking for encouragement, got %+v", got)
		}
		if len(received(joel)) != 0 {
			t.Fatalf("Joel was not chosen")
		}
	})

	t.Run("keeps replies private between the two people", func(t *testing.T) {
		id := received(kofi)[0].ID
		expectStatus(t, send(t, s, "POST", "/api/shares/"+id+"/notes", kofi.AccountToken, map[string]any{"kind": "words", "text": "I know that was difficult. I’m glad you gave yourself some room."}), http.StatusCreated)
		expectStatus(t, send(t, s, "POST", "/api/shares/"+id+"/notes", kofi.AccountToken, map[string]any{"kind": "resonated"}), http.StatusCreated)
		// Ama answers Kofi, in their thread.
		expectStatus(t, send(t, s, "POST", "/api/shares/"+id+"/notes", ama.AccountToken, map[string]any{"kind": "words", "text": "Thank you, that helps.", "with": kofi.Account.ID}), http.StatusCreated)

		mine := received(kofi)[0].Notes
		if len(mine) != 3 || mine[0].From != "Kofi" || mine[2].From != "Ama" || mine[2].Text != "Thank you, that helps." {
			t.Fatalf("Kofi should see his thread with Ama, got %+v", mine)
		}
		sent := decode[SharesView](t, send(t, s, "GET", "/api/shares", ama.AccountToken, nil)).Sent
		if len(sent) != 1 || len(sent[0].People) != 1 || sent[0].People[0].Name != "Kofi" || len(sent[0].People[0].Notes) != 3 {
			t.Fatalf("Ama should see her thread with Kofi, got %+v", sent)
		}
		// Nobody else can add to it, and Ama cannot start a thread with someone not chosen.
		expectStatus(t, send(t, s, "POST", "/api/shares/"+id+"/notes", joel.AccountToken, map[string]any{"kind": "resonated"}), http.StatusNotFound)
		expectStatus(t, send(t, s, "POST", "/api/shares/"+id+"/notes", ama.AccountToken, map[string]any{"kind": "words", "text": "Hello", "with": joel.Account.ID}), http.StatusNotFound)
	})

	t.Run("takes only the kinds of reply offered, short words and no links", func(t *testing.T) {
		id := received(kofi)[0].ID
		for name, body := range map[string]map[string]any{
			"unknown kind": {"kind": "like"},
			"empty words":  {"kind": "words", "text": "  "},
			"too long":     {"kind": "words", "text": strings.Repeat("a", 301)},
			"a link":       {"kind": "words", "text": "see https://example.com"},
		} {
			if w := send(t, s, "POST", "/api/shares/"+id+"/notes", kofi.AccountToken, body); w.Code != http.StatusBadRequest {
				t.Errorf("%s: expected 400, got %d", name, w.Code)
			}
		}
	})

	t.Run("lets the author turn replies off", func(t *testing.T) {
		id := share(map[string]any{"kind": "helped", "text": "Taking ten minutes before replying helped me respond more calmly.", "mode": "share", "replies": false, "to": []string{joel.Account.ID}})
		expectError(t, send(t, s, "POST", "/api/shares/"+id+"/notes", joel.AccountToken, map[string]any{"kind": "resonated"}), http.StatusForbidden, "replies_off")
	})

	t.Run("removes one person quietly, ending their access and their thread", func(t *testing.T) {
		id := share(map[string]any{"kind": "answer", "text": "When I am overwhelmed, quiet company helps me most.", "audience": "inner", "to": []string{kofi.Account.ID, joel.Account.ID}})
		expectStatus(t, send(t, s, "POST", "/api/shares/"+id+"/notes", joel.AccountToken, map[string]any{"kind": "similar"}), http.StatusCreated)
		expectStatus(t, send(t, s, "DELETE", "/api/shares/"+id+"/people/"+joel.Account.ID, kofi.AccountToken, nil), http.StatusNotFound)
		expectStatus(t, send(t, s, "DELETE", "/api/shares/"+id+"/people/"+joel.Account.ID, ama.AccountToken, nil), http.StatusNoContent)
		for _, sh := range received(joel) {
			if sh.ID == id {
				t.Fatalf("Joel still sees the item after being removed")
			}
		}
		stillKofi := false
		for _, sh := range received(kofi) {
			stillKofi = stillKofi || sh.ID == id
		}
		if !stillKofi {
			t.Fatalf("Kofi should still see it")
		}
		for _, sh := range decode[SharesView](t, send(t, s, "GET", "/api/shares", ama.AccountToken, nil)).Sent {
			if sh.ID == id && (len(sh.People) != 1 || sh.People[0].Name != "Kofi" || sh.Audience != "inner") {
				t.Fatalf("after removing Joel, Ama should see only Kofi, got %+v", sh)
			}
		}
	})

	t.Run("refuses an unknown kind of share or helpful response", func(t *testing.T) {
		for name, body := range map[string]map[string]any{
			"kind":     {"kind": "rant", "text": "Something I wanted to say to you.", "to": []string{kofi.Account.ID}},
			"mode":     {"kind": "helped", "text": "Something that helped me this week.", "mode": "advice", "to": []string{kofi.Account.ID}},
			"audience": {"kind": "helped", "text": "Something that helped me this week.", "audience": "everyone", "to": []string{kofi.Account.ID}},
		} {
			if w := send(t, s, "POST", "/api/shares", ama.AccountToken, body); w.Code != http.StatusBadRequest {
				t.Errorf("%s: expected 400, got %d", name, w.Code)
			}
		}
	})
}
