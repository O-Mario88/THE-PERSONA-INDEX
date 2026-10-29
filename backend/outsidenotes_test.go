package main

import (
	"net/http"
	"strings"
	"testing"
)

// The Outside Mirror, as named notes (Edwin, 2026-10-29): an occasional
// invitation to a trusted person, with a concrete prompt; they write a short
// note with their name on it; the person can keep it, dismiss it, or reflect
// on it. Never anonymous, never a verdict.

func TestOutsideNotes(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi, joel := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Joel")
	befriend(t, s, ama, kofi)

	view := func(who SignedIn) OutsideView {
		t.Helper()
		return decode[OutsideView](t, send(t, s, "GET", "/api/outside", who.AccountToken, nil))
	}

	t.Run("offers concrete prompts, with no verdicts", func(t *testing.T) {
		ps := view(ama).Prompts
		if len(ps) != 3 || ps[0].Text != "When have you seen me seem most at ease?" {
			t.Fatalf("expected the three prompts, got %+v", ps)
		}
	})

	var id string
	t.Run("invites only a friend, who sees whose invitation it is", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/outside", ama.AccountToken, map[string]string{"friendId": joel.Account.ID, "promptId": "appreciate"}), http.StatusNotFound)
		w := send(t, s, "POST", "/api/outside", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "promptId": "appreciate"})
		expectStatus(t, w, http.StatusCreated)
		id = decode[map[string]string](t, w)["id"]
		inv := view(kofi).Invitations
		if len(inv) != 1 || inv[0].From.Name != "Ama" || inv[0].PromptID != "appreciate" {
			t.Fatalf("Kofi should see Ama's invitation, got %+v", inv)
		}
		// One open invitation to the same friend at a time: occasional, not a stream.
		expectStatus(t, send(t, s, "POST", "/api/outside", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "promptId": "ease"}), http.StatusConflict)
	})

	t.Run("brings back a named note, which the person can keep or dismiss", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/outside/"+id+"/write", ama.AccountToken, map[string]string{"text": "Not mine to write."}), http.StatusNotFound)
		expectStatus(t, send(t, s, "POST", "/api/outside/"+id+"/write", kofi.AccountToken, map[string]string{"text": "You always remember the small things people tell you."}), http.StatusNoContent)
		notes := view(ama).Notes
		if len(notes) != 1 || notes[0].From.Name != "Kofi" || notes[0].Text != "You always remember the small things people tell you." || notes[0].Kept {
			t.Fatalf("Ama should see Kofi's note, with his name, got %+v", notes)
		}
		if len(view(kofi).Invitations) != 0 {
			t.Fatalf("once written, the invitation is done")
		}
		expectStatus(t, send(t, s, "POST", "/api/outside/"+id+"/keep", ama.AccountToken, map[string]bool{"keep": true}), http.StatusNoContent)
		if !view(ama).Notes[0].Kept {
			t.Fatalf("a kept note stays, marked kept")
		}
		expectStatus(t, send(t, s, "POST", "/api/outside/"+id+"/keep", ama.AccountToken, map[string]bool{"keep": false}), http.StatusNoContent)
		if len(view(ama).Notes) != 0 {
			t.Fatalf("a dismissed note is gone")
		}
	})

	t.Run("lets the friend decline quietly, and takes only short words without links", func(t *testing.T) {
		w := send(t, s, "POST", "/api/outside", kofi.AccountToken, map[string]string{"friendId": ama.Account.ID, "promptId": "understood"})
		expectStatus(t, w, http.StatusCreated)
		other := decode[map[string]string](t, w)["id"]
		for name, text := range map[string]string{"empty": "  ", "long": strings.Repeat("a", 301), "link": "see www.example.com"} {
			if w := send(t, s, "POST", "/api/outside/"+other+"/write", ama.AccountToken, map[string]string{"text": text}); w.Code != http.StatusBadRequest {
				t.Errorf("%s: expected 400, got %d", name, w.Code)
			}
		}
		expectStatus(t, send(t, s, "POST", "/api/outside/"+other+"/decline", ama.AccountToken, nil), http.StatusNoContent)
		if len(view(ama).Invitations) != 0 || len(view(kofi).Asked) != 0 {
			t.Fatalf("a declined invitation is gone for both")
		}
	})
}
