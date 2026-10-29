package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// Edwin, 2026-10-29: "tackle that now" — tell a person when someone they
// trust shares with them or replies, while the app is closed. The notice
// names the person and what happened, never their words, and only reaches a
// phone whose owner turned it on there.

type fakePusher struct {
	mu   sync.Mutex
	sent []PushMessage
	gone map[string]bool // addresses the push service says no longer exist
}

func (f *fakePusher) Push(_ context.Context, msgs []PushMessage) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var gone []string
	for _, m := range msgs {
		if f.gone[m.To] {
			gone = append(gone, m.To)
			continue
		}
		f.sent = append(f.sent, m)
	}
	return gone, nil
}

func (f *fakePusher) take(s *Server) []PushMessage {
	s.pushes.Wait()
	f.mu.Lock()
	defer f.mu.Unlock()
	out := f.sent
	f.sent = nil
	return out
}

const (
	kofiPhone = "ExponentPushToken[kofi-phone-1]"
	amaPhone  = "ExponentPushToken[ama-phone-1]"
)

func TestTellingPeopleWhenSomeoneTheyTrustReachesOut(t *testing.T) {
	s, codes := accountServer(t)
	push := &fakePusher{gone: map[string]bool{}}
	s.pusher = push
	ama, kofi, joel := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Joel")
	befriend(t, s, ama, kofi)
	befriend(t, s, ama, joel)

	only := func(t *testing.T, got []PushMessage, to, body string) {
		t.Helper()
		if len(got) != 1 || got[0].To != to || got[0].Body != body || got[0].Data["open"] != "connect" {
			t.Fatalf("expected one notice %q to %s, got %+v", body, to, got)
		}
	}

	t.Run("takes a push address only from a signed-in phone, and only one that looks right", func(t *testing.T) {
		expectStatus(t, send(t, s, "PUT", "/api/push", "", map[string]string{"token": kofiPhone, "platform": "ios"}), http.StatusUnauthorized)
		for _, bad := range []map[string]string{
			{"token": "hello", "platform": "ios"},
			{"token": kofiPhone, "platform": "windows"},
			{"token": "ExponentPushToken[" + strings.Repeat("a", 300) + "]", "platform": "ios"},
		} {
			expectError(t, send(t, s, "PUT", "/api/push", kofi.AccountToken, bad), http.StatusBadRequest, "invalid_request")
		}
		expectStatus(t, send(t, s, "PUT", "/api/push", kofi.AccountToken, map[string]string{"token": kofiPhone, "platform": "ios"}), http.StatusNoContent)
	})

	var shareID string
	t.Run("names who shared and nothing they wrote", func(t *testing.T) {
		w := send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{"kind": "reflection", "text": "I said no to an extra shift, but I still feel guilty.", "mode": "encourage", "replies": true, "to": []string{kofi.Account.ID}})
		expectStatus(t, w, http.StatusCreated)
		shareID = decode[map[string]string](t, w)["id"]
		got := push.take(s)
		only(t, got, kofiPhone, "Ama shared something with you.")
		if strings.Contains(got[0].Title+got[0].Body, "shift") {
			t.Fatalf("a notice never carries the words: %+v", got[0])
		}
	})

	t.Run("sends nothing to someone who never turned it on", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/shares/"+shareID+"/notes", kofi.AccountToken, map[string]any{"kind": "encourage"}), http.StatusCreated)
		if got := push.take(s); len(got) != 0 {
			t.Fatalf("Ama has no push address yet, got %+v", got)
		}
	})

	t.Run("says when someone replies, asks for a note, or writes one", func(t *testing.T) {
		expectStatus(t, send(t, s, "PUT", "/api/push", ama.AccountToken, map[string]string{"token": amaPhone, "platform": "android"}), http.StatusNoContent)
		s.pushLimit = newWindowLimiter(pushesPerPairWindow, pushPairWindow) // Kofi's first reply above was not sent anywhere
		expectStatus(t, send(t, s, "POST", "/api/shares/"+shareID+"/notes", kofi.AccountToken, map[string]any{"kind": "words", "text": "I'm glad you gave yourself room."}), http.StatusCreated)
		only(t, push.take(s), amaPhone, "Kofi replied to you.")

		expectStatus(t, send(t, s, "POST", "/api/shares/"+shareID+"/notes", ama.AccountToken, map[string]any{"kind": "words", "text": "Thank you.", "with": kofi.Account.ID}), http.StatusCreated)
		only(t, push.take(s), kofiPhone, "Ama replied to you.")

		w := send(t, s, "POST", "/api/outside", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "promptId": "appreciate"})
		expectStatus(t, w, http.StatusCreated)
		only(t, push.take(s), kofiPhone, "Ama asked you for a note.")
		id := decode[map[string]string](t, w)["id"]
		expectStatus(t, send(t, s, "POST", "/api/outside/"+id+"/write", kofi.AccountToken, map[string]string{"text": "You listen without rushing me."}), http.StatusNoContent)
		only(t, push.take(s), amaPhone, "Kofi wrote you a note.")
	})

	t.Run("says when someone asks to reflect together, and when they reveal", func(t *testing.T) {
		q := decode[ReflectTogetherView](t, send(t, s, "GET", "/api/reflect-together", ama.AccountToken, nil)).Questions[0]
		w := send(t, s, "POST", "/api/reflect-together", ama.AccountToken, map[string]string{"friendId": kofi.Account.ID, "questionId": q.ID, "optionId": q.Options[0].ID})
		expectStatus(t, w, http.StatusCreated)
		only(t, push.take(s), kofiPhone, "Ama asked you to reflect together.")
		id := decode[map[string]string](t, w)["id"]
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+id+"/answer", kofi.AccountToken, map[string]string{"optionId": q.Options[1].ID}), http.StatusNoContent)
		if got := push.take(s); len(got) != 0 {
			t.Fatalf("answering privately tells nobody, got %+v", got)
		}
		expectStatus(t, send(t, s, "POST", "/api/reflect-together/"+id+"/reveal", kofi.AccountToken, map[string]bool{"reveal": true}), http.StatusNoContent)
		only(t, push.take(s), amaPhone, "Kofi is ready to reflect together.")
	})

	t.Run("sends one notice, not a stream, when the same thing happens again soon", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/shares/"+shareID+"/notes", kofi.AccountToken, map[string]any{"kind": "resonated"}), http.StatusCreated)
		expectStatus(t, send(t, s, "POST", "/api/shares/"+shareID+"/notes", kofi.AccountToken, map[string]any{"kind": "similar"}), http.StatusCreated)
		if got := push.take(s); len(got) != 0 {
			t.Fatalf("Ama was told about Kofi's reply minutes ago, got %+v", got)
		}
	})

	t.Run("stays quiet about someone the person muted", func(t *testing.T) {
		s.pushLimit = newWindowLimiter(pushesPerPairWindow, pushPairWindow) // so only the mute can keep it quiet
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, map[string]any{"muted": true}), http.StatusOK)
		expectStatus(t, send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{"kind": "helped", "text": "Taking ten minutes before replying helped.", "mode": "share", "to": []string{kofi.Account.ID}}), http.StatusCreated)
		if got := push.take(s); len(got) != 0 {
			t.Fatalf("Kofi muted Ama, got %+v", got)
		}
		expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, map[string]any{"muted": false}), http.StatusOK)
	})

	t.Run("forgets an address the phone turned off, or the push service no longer knows", func(t *testing.T) {
		s.pushLimit = newWindowLimiter(pushesPerPairWindow, pushPairWindow) // a fresh window
		expectStatus(t, send(t, s, "DELETE", "/api/push", kofi.AccountToken, map[string]string{"token": kofiPhone}), http.StatusNoContent)
		expectStatus(t, send(t, s, "POST", "/api/shares", ama.AccountToken, map[string]any{"kind": "reflection", "text": "A third thing I wanted to share.", "mode": "share", "to": []string{kofi.Account.ID}}), http.StatusCreated)
		if got := push.take(s); len(got) != 0 {
			t.Fatalf("Kofi turned it off, got %+v", got)
		}

		push.gone[amaPhone] = true
		expectStatus(t, send(t, s, "POST", "/api/shares/"+shareID+"/notes", kofi.AccountToken, map[string]any{"kind": "talk"}), http.StatusCreated)
		push.take(s)
		if toks, _ := s.push.PushTokens(context.Background(), ama.Account.ID); len(toks) != 0 {
			t.Fatalf("an address the service no longer knows is dropped, got %+v", toks)
		}
	})

	t.Run("moves an address to whoever signs in on that phone next, and deletes it with the account", func(t *testing.T) {
		expectStatus(t, send(t, s, "PUT", "/api/push", kofi.AccountToken, map[string]string{"token": kofiPhone, "platform": "ios"}), http.StatusNoContent)
		expectStatus(t, send(t, s, "PUT", "/api/push", joel.AccountToken, map[string]string{"token": kofiPhone, "platform": "ios"}), http.StatusNoContent)
		ctx := context.Background()
		if k, _ := s.push.PushTokens(ctx, kofi.Account.ID); len(k) != 0 {
			t.Fatalf("one phone, one person: Kofi should no longer hold it, got %+v", k)
		}
		expectStatus(t, send(t, s, "DELETE", "/api/account", joel.AccountToken, nil), http.StatusNoContent)
		if j, _ := s.push.PushTokens(ctx, joel.Account.ID); len(j) != 0 {
			t.Fatalf("deleting the account deletes its push addresses, got %+v", j)
		}
	})
}

func TestPushNoticesKeepTheVoice(t *testing.T) {
	for kind := range pushLines {
		line := pushLine(kind, "Ama")
		if !strings.HasPrefix(line, "Ama ") || strings.ContainsAny(line, "!%") || len(line) > 60 {
			t.Errorf("%s: %q should be short, start with the name, and be calm", kind, line)
		}
	}
}

// The Expo push service gets the notice with no words from the item, and an
// address it no longer knows comes back to be forgotten.
func TestExpoPusher(t *testing.T) {
	var got []expoMessage
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode: %v", err)
		}
		_, _ = w.Write([]byte(`{"data":[{"status":"ok","id":"a"},{"status":"error","message":"gone","details":{"error":"DeviceNotRegistered"}}]}`))
	}))
	defer srv.Close()
	p := expoPusher{url: srv.URL, token: "secret", client: srv.Client()}
	gone, err := p.Push(context.Background(), []PushMessage{
		{To: kofiPhone, Title: pushTitle, Body: "Ama shared something with you.", Data: map[string]string{"open": "connect"}},
		{To: amaPhone, Title: pushTitle, Body: "Ama shared something with you.", Data: map[string]string{"open": "connect"}},
	})
	if err != nil || len(gone) != 1 || gone[0] != amaPhone {
		t.Fatalf("expected the second address back as gone, got %v (%v)", gone, err)
	}
	if auth != "Bearer secret" || len(got) != 2 || got[0].Body != "Ama shared something with you." || got[0].Data["open"] != "connect" || got[0].Priority != "normal" {
		t.Fatalf("unexpected request: auth %q, %+v", auth, got)
	}
}
