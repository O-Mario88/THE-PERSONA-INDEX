package main

import (
	"net/http"
	"testing"
	"time"
)

// The circle: invite links, room codes, suggestions, tags, silent mute.

// befriend connects a and b through a's work invite link.
func befriend(t *testing.T, s *Server, a, b SignedIn) {
	t.Helper()
	w := send(t, s, "POST", "/api/circle/invites", a.AccountToken, map[string]string{"tag": "work"})
	expectStatus(t, w, http.StatusOK)
	code := decode[map[string]string](t, w)["code"]
	expectStatus(t, send(t, s, "POST", "/api/circle/invites/"+code, b.AccountToken, map[string]string{"tag": "work"}), http.StatusOK)
}

func circleOf(t *testing.T, s *Server, who SignedIn) CircleView {
	t.Helper()
	w := send(t, s, "GET", "/api/circle", who.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[CircleView](t, w)
}

func TestCircleNeedsAccountAndName(t *testing.T) {
	s, codes := accountServer(t)
	expectStatus(t, send(t, s, "GET", "/api/circle", "", nil), http.StatusUnauthorized)
	nameless := signInByCode(t, s, codes, "nobody@example.com", "")
	expectError(t, send(t, s, "POST", "/api/circle/invites", nameless.AccountToken, map[string]string{"tag": "work"}), http.StatusConflict, "name_needed")
	expectError(t, send(t, s, "POST", "/api/circle/rooms", nameless.AccountToken, map[string]string{"tag": "work"}), http.StatusConflict, "name_needed")
	ama := named(t, s, codes, "Ama")
	expectError(t, send(t, s, "POST", "/api/circle/invites", ama.AccountToken, map[string]string{"tag": "gym"}), http.StatusBadRequest, "invalid_tag")
}

func TestInviteLinks(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")

	w := send(t, s, "POST", "/api/circle/invites", ama.AccountToken, map[string]string{"tag": "family"})
	expectStatus(t, w, http.StatusOK)
	code := decode[map[string]string](t, w)["code"]
	again := decode[map[string]string](t, send(t, s, "POST", "/api/circle/invites", ama.AccountToken, map[string]string{"tag": "family"}))["code"]
	if code == "" || again != code {
		t.Fatalf("the same tag should give the same link while it lives: %q then %q", code, again)
	}

	peek := decode[InvitePeek](t, get(t, s, "/api/circle/invites/"+code))
	if peek.Name != "Ama" || peek.Tag != "family" {
		t.Fatalf("peek: %+v", peek)
	}
	expectError(t, get(t, s, "/api/circle/invites/nosuchcode"), http.StatusNotFound, "no_invite")
	expectError(t, send(t, s, "POST", "/api/circle/invites/"+code, ama.AccountToken, map[string]string{}), http.StatusBadRequest, "own_invite")

	w = send(t, s, "POST", "/api/circle/invites/"+code, kofi.AccountToken, map[string]string{"tag": "school"})
	expectStatus(t, w, http.StatusOK)
	if f := decode[FriendView](t, w); f.Name != "Ama" || f.Tag != "school" {
		t.Fatalf("Kofi files Ama under his own tag: %+v", f)
	}
	ac := circleOf(t, s, ama)
	if len(ac.Friends) != 1 || ac.Friends[0].Name != "Kofi" || ac.Friends[0].Tag != "family" || !ac.Friends[0].Active {
		t.Fatalf("Ama files Kofi under the link's tag: %+v", ac.Friends)
	}
	if ac.Active != 1 || ac.Need != outsideMirrorNeed {
		t.Fatalf("active %d need %d", ac.Active, ac.Need)
	}

	t.Run("a link stops working after 30 days", func(t *testing.T) {
		s.clock = func() time.Time { return fixedNow.Add(inviteLife + 48*time.Hour) }
		defer func() { s.clock = func() time.Time { return fixedNow } }()
		expectError(t, get(t, s, "/api/circle/invites/"+code), http.StatusNotFound, "no_invite")
	})
}

func TestRoomCodes(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi, esi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Esi")

	w := send(t, s, "POST", "/api/circle/rooms", ama.AccountToken, map[string]string{"tag": "work"})
	expectStatus(t, w, http.StatusOK)
	room := decode[RoomView](t, w)
	if again := decode[RoomView](t, send(t, s, "POST", "/api/circle/rooms", ama.AccountToken, map[string]string{"tag": "work"})); again.Code != room.Code {
		t.Fatalf("one open room each: %s then %s", room.Code, again.Code)
	}
	if code, ok := normalizeRoom(room.Code); !ok || code != room.Code {
		t.Fatalf("room code %q does not read back", room.Code)
	}
	for in, want := range map[string]string{"lima 42": "LIMA-42", "LIMA-42": "LIMA-42", "lima42": "LIMA-42"} {
		if got, ok := normalizeRoom(in); !ok || got != want {
			t.Errorf("normalizeRoom(%q) = %q", in, got)
		}
	}
	for _, bad := range []string{"", "li-42", "lima", "lima 4", "42 lima", "lima;42"} {
		if _, ok := normalizeRoom(bad); ok {
			t.Errorf("normalizeRoom(%q) should refuse", bad)
		}
	}

	expectError(t, send(t, s, "POST", "/api/circle/rooms/ZZZZ-11", kofi.AccountToken, nil), http.StatusNotFound, "no_room")
	w = send(t, s, "POST", "/api/circle/rooms/"+room.Code, kofi.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	// Inside counts the host too.
	if v := decode[RoomView](t, w); v.Host != "Ama" || v.Inside != 2 {
		t.Fatalf("join: %+v", v)
	}
	expectStatus(t, send(t, s, "POST", "/api/circle/rooms/"+room.Code, esi.AccountToken, nil), http.StatusOK)

	// Everyone in a room is offered everyone else, never connected without asking.
	kc := circleOf(t, s, kofi)
	if len(kc.Friends) != 0 {
		t.Fatalf("joining a room connects no one: %+v", kc.Friends)
	}
	names := map[string]SuggestionView{}
	for _, x := range kc.Suggestions {
		names[x.Name] = x
	}
	if names["Ama"].Room != room.Code || names["Esi"].Room != room.Code {
		t.Fatalf("Kofi should be offered Ama and Esi from the room: %+v", kc.Suggestions)
	}
	if len(kc.Joined) != 1 || kc.Joined[0].Host != "Ama" || kc.Joined[0].Inside != 3 {
		t.Fatalf("joined: %+v", kc.Joined)
	}
	if ac := circleOf(t, s, ama); ac.Room == nil || ac.Room.Inside != 3 {
		t.Fatalf("Ama sees her open room: %+v", ac.Room)
	}

	t.Run("asking then being asked connects", func(t *testing.T) {
		w := send(t, s, "POST", "/api/circle/connect/"+esi.Account.ID, kofi.AccountToken, map[string]string{"tag": "friends"})
		if decode[map[string]string](t, w)["status"] != "asked" {
			t.Fatal("first side only asks")
		}
		for _, x := range circleOf(t, s, esi).Suggestions {
			if x.Name == "Kofi" && !x.Asked {
				t.Fatal("Esi should see that Kofi asked")
			}
		}
		w = send(t, s, "POST", "/api/circle/connect/"+kofi.Account.ID, esi.AccountToken, map[string]string{"tag": "school"})
		if decode[map[string]string](t, w)["status"] != "connected" {
			t.Fatal("second side connects")
		}
		if ec := circleOf(t, s, esi); len(ec.Friends) != 1 || ec.Friends[0].Tag != "school" {
			t.Fatalf("Esi: %+v", ec.Friends)
		}
	})

	t.Run("only someone offered can be asked", func(t *testing.T) {
		stranger := named(t, s, codes, "Yaw")
		expectError(t, send(t, s, "POST", "/api/circle/connect/"+stranger.Account.ID, kofi.AccountToken, map[string]string{}), http.StatusNotFound, "not_offered")
	})

	t.Run("a dismissed suggestion stays gone", func(t *testing.T) {
		expectStatus(t, send(t, s, "POST", "/api/circle/dismiss/"+ama.Account.ID, kofi.AccountToken, nil), http.StatusNoContent)
		for _, x := range circleOf(t, s, kofi).Suggestions {
			if x.Name == "Ama" {
				t.Fatal("Ama was dismissed")
			}
		}
	})

	t.Run("a room closes after a day", func(t *testing.T) {
		s.clock = func() time.Time { return fixedNow.Add(roomLife + time.Minute) }
		defer func() { s.clock = func() time.Time { return fixedNow } }()
		expectError(t, send(t, s, "POST", "/api/circle/rooms/"+room.Code, named(t, s, codes, "Abena").AccountToken, nil), http.StatusNotFound, "no_room")
	})
}

func TestFriendsOfFriends(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi, esi, yaw := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi"), named(t, s, codes, "Esi"), named(t, s, codes, "Yaw")
	befriend(t, s, ama, kofi)
	befriend(t, s, ama, esi)
	befriend(t, s, yaw, kofi)

	offered := func(who SignedIn, name string) bool {
		for _, x := range circleOf(t, s, who).Suggestions {
			if x.Name == name {
				return true
			}
		}
		return false
	}
	if offered(ama, "Yaw") {
		t.Fatal("one mutual friend is not enough")
	}
	befriend(t, s, yaw, esi)
	if !offered(ama, "Yaw") {
		t.Fatal("two mutual friends offers Yaw to Ama")
	}

	t.Run("someone who turned suggestions off is never offered", func(t *testing.T) {
		expectStatus(t, send(t, s, "PATCH", "/api/account", yaw.AccountToken, map[string]any{"suggest": false}), http.StatusOK)
		if offered(ama, "Yaw") {
			t.Fatal("Yaw turned suggestions off")
		}
	})
}

func TestTagsMuteAndDisconnect(t *testing.T) {
	s, codes := accountServer(t)
	ama, kofi := named(t, s, codes, "Ama"), named(t, s, codes, "Kofi")
	befriend(t, s, ama, kofi)

	w := send(t, s, "PATCH", "/api/circle/friends/"+kofi.Account.ID, ama.AccountToken, map[string]any{"tag": "family"})
	expectStatus(t, w, http.StatusOK)
	if f := decode[FriendView](t, w); f.Tag != "family" {
		t.Fatalf("tag: %+v", f)
	}
	expectError(t, send(t, s, "PATCH", "/api/circle/friends/"+kofi.Account.ID, ama.AccountToken, map[string]any{"tag": "gym"}), http.StatusBadRequest, "invalid_tag")
	expectError(t, send(t, s, "PATCH", "/api/circle/friends/nobody", ama.AccountToken, map[string]any{"muted": true}), http.StatusNotFound, "not_friends")

	expectStatus(t, send(t, s, "PATCH", "/api/circle/friends/"+kofi.Account.ID, ama.AccountToken, map[string]any{"muted": true}), http.StatusOK)
	ac := circleOf(t, s, ama)
	if !ac.Friends[0].Muted || ac.Active != 0 {
		t.Fatalf("a muted friend does not count as active: %+v", ac)
	}
	// Kofi is never told.
	kc := circleOf(t, s, kofi)
	if len(kc.Friends) != 1 || kc.Friends[0].Muted || kc.Friends[0].Tag != "work" {
		t.Fatalf("Kofi must see no change: %+v", kc.Friends)
	}

	expectStatus(t, send(t, s, "DELETE", "/api/circle/friends/"+ama.Account.ID, kofi.AccountToken, nil), http.StatusNoContent)
	if len(circleOf(t, s, ama).Friends) != 0 || len(circleOf(t, s, kofi).Friends) != 0 {
		t.Fatal("disconnecting removes both sides")
	}
}
