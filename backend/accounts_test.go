package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// Lazy accounts: sign in with a code or a Google/Apple token, sessions,
// sync, delete. The server keeps no address, only a keyed hash and a hint.

type sentCode struct{ kind, to, code string }

type fakeSender struct {
	mu   sync.Mutex
	sent []sentCode
	fail bool
}

func (f *fakeSender) Send(_ context.Context, kind, to, code string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("provider down")
	}
	f.sent = append(f.sent, sentCode{kind, to, code})
	return nil
}

func (f *fakeSender) last(t *testing.T) sentCode {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.sent) == 0 {
		t.Fatal("no code was sent")
	}
	return f.sent[len(f.sent)-1]
}

type fakeIDs map[string]string // token -> subject

func (f fakeIDs) Verify(_ context.Context, provider, token string) (string, string, error) {
	sub, ok := f[provider+":"+token]
	if !ok {
		return "", "", errBadIDToken
	}
	return sub, sub + "@example.com", nil
}

func accountServer(t *testing.T) (*Server, *fakeSender) {
	t.Helper()
	s := newTestServer()
	codes := &fakeSender{}
	s.signIn = SignInConfig{Codes: codes, CodeKinds: []string{"email", "phone"},
		IDs: fakeIDs{"google:tok-ama": "g-ama", "apple:tok-ama": "a-ama"}, GoogleClientID: "gid", AppleClientID: "aid"}
	return s, codes
}

func send(t *testing.T, s *Server, method, path, auth string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == nil {
		r = httptest.NewRequest(method, path, nil)
	} else {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r = httptest.NewRequest(method, path, bytes.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
	}
	if auth != "" {
		r.Header.Set("Authorization", "Account "+auth)
	}
	return do(t, s, r)
}

// signInByCode runs the whole code flow and returns what the phone gets.
func signInByCode(t *testing.T, s *Server, codes *fakeSender, address, voterID string) SignedIn {
	t.Helper()
	expectStatus(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": address}), http.StatusAccepted)
	c := codes.last(t)
	w := send(t, s, "POST", "/api/auth/verify", "", map[string]string{"address": address, "code": c.code, "voterId": voterID, "device": "Test phone"})
	expectStatus(t, w, http.StatusOK)
	return decode[SignedIn](t, w)
}

// named signs someone in and gives them a name and handle, ready for the circle.
func named(t *testing.T, s *Server, codes *fakeSender, name string) SignedIn {
	t.Helper()
	in := signInByCode(t, s, codes, strings.ToLower(name)+"@example.com", "")
	w := send(t, s, "PATCH", "/api/account", in.AccountToken, map[string]string{"name": name, "handle": strings.ToLower(name)})
	expectStatus(t, w, http.StatusOK)
	in.Account = decode[AccountView](t, w)
	return in
}

func TestSignInMethods(t *testing.T) {
	t.Run("a server with nothing configured offers nothing", func(t *testing.T) {
		s := newTestServer()
		m := decode[SignInMethods](t, get(t, s, "/api/auth/methods"))
		if m.Email || m.Phone || m.Google || m.Apple {
			t.Fatalf("offered %+v with nothing configured", m)
		}
		expectError(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "ama@example.com"}), http.StatusServiceUnavailable, "sign_in_unavailable")
		expectError(t, send(t, s, "POST", "/api/auth/id", "", map[string]string{"provider": "google", "idToken": "x"}), http.StatusServiceUnavailable, "sign_in_unavailable")
	})
	t.Run("a configured server offers each way it can", func(t *testing.T) {
		s, _ := accountServer(t)
		m := decode[SignInMethods](t, get(t, s, "/api/auth/methods"))
		if !m.Email || !m.Phone || !m.Google || !m.Apple || m.GoogleClientID != "gid" || m.AppleClientID != "aid" {
			t.Fatalf("got %+v", m)
		}
	})
	t.Run("from the environment: a webhook, or the log on a local run, never both", func(t *testing.T) {
		env := map[string]string{}
		get := func(k string) string { return env[k] }
		if c := signInFromEnv(get, false, nil); c.Codes != nil || c.IDs != nil {
			t.Fatal("production with no settings must offer nothing")
		}
		if _, ok := signInFromEnv(get, true, nil).Codes.(logSender); !ok {
			t.Fatal("a local run prints codes to the log")
		}
		env["SIGNIN_CODE_WEBHOOK"] = "http://insecure.example"
		if c := signInFromEnv(get, false, nil); c.Codes != nil {
			t.Fatal("a webhook must be https")
		}
		env["SIGNIN_CODE_WEBHOOK"], env["SIGNIN_CODE_KINDS"], env["GOOGLE_CLIENT_ID"] = "https://hooks.example/code", "phone", "g"
		c := signInFromEnv(get, false, nil)
		if _, ok := c.Codes.(webhookSender); !ok || len(c.CodeKinds) != 1 || c.CodeKinds[0] != "phone" || c.IDs == nil {
			t.Fatalf("got %+v", c)
		}
	})
}

func TestSignInWithACode(t *testing.T) {
	t.Run("a new address makes an account; the same address signs in to it again", func(t *testing.T) {
		s, codes := accountServer(t)
		first := signInByCode(t, s, codes, "  Ama@Example.com ", "")
		if !first.Created || first.AccountToken == "" || first.DeviceToken == "" {
			t.Fatalf("got %+v", first)
		}
		if c := codes.last(t); c.kind != "email" || c.to != "ama@example.com" || len(c.code) != 6 {
			t.Fatalf("sent %+v", c)
		}
		again := signInByCode(t, s, codes, "ama@example.com", "")
		if again.Created || again.Account.ID != first.Account.ID {
			t.Fatalf("expected the same account, got %+v", again)
		}
		// Every phone of the account votes as one device.
		if again.DeviceToken != first.DeviceToken {
			t.Fatal("two phones of one account must share the account's device id")
		}
	})

	t.Run("phone numbers need their country code", func(t *testing.T) {
		s, codes := accountServer(t)
		expectError(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "0772 123 456"}), http.StatusBadRequest, "invalid_address")
		in := signInByCode(t, s, codes, "+256 772 123 418", "")
		if c := codes.last(t); c.kind != "phone" || c.to != "+256772123418" {
			t.Fatalf("sent %+v", c)
		}
		d := decode[AccountDetails](t, send(t, s, "GET", "/api/account", in.AccountToken, nil))
		if len(d.Logins) != 1 || d.Logins[0].Kind != "phone" || d.Logins[0].Hint != "+256 ••• 418" {
			t.Fatalf("logins %+v", d.Logins)
		}
	})

	t.Run("a wrong code fails, and five wrong tries end the code", func(t *testing.T) {
		s, codes := accountServer(t)
		expectStatus(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "ama@example.com"}), http.StatusAccepted)
		good := codes.last(t).code
		wrong := "000000"
		if good == wrong {
			wrong = "111111"
		}
		for range maxCodeTries {
			expectError(t, send(t, s, "POST", "/api/auth/verify", "", map[string]string{"address": "ama@example.com", "code": wrong}), http.StatusUnauthorized, "wrong_code")
		}
		expectError(t, send(t, s, "POST", "/api/auth/verify", "", map[string]string{"address": "ama@example.com", "code": good}), http.StatusUnauthorized, "wrong_code")
	})

	t.Run("a code works once", func(t *testing.T) {
		s, codes := accountServer(t)
		signInByCode(t, s, codes, "ama@example.com", "")
		c := codes.last(t)
		expectError(t, send(t, s, "POST", "/api/auth/verify", "", map[string]string{"address": "ama@example.com", "code": c.code}), http.StatusUnauthorized, "wrong_code")
	})

	t.Run("one address gets a few codes an hour, no more", func(t *testing.T) {
		s, _ := accountServer(t)
		for range codesPerLoginHour {
			expectStatus(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "ama@example.com"}), http.StatusAccepted)
		}
		expectError(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "ama@example.com"}), http.StatusTooManyRequests, "rate_limited")
	})

	t.Run("a provider that is down is an error, not a silent success", func(t *testing.T) {
		s, codes := accountServer(t)
		codes.fail = true
		expectError(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "ama@example.com"}), http.StatusServiceUnavailable, "unavailable")
	})
}

func TestSignInKeepsNoAddress(t *testing.T) {
	s, codes := accountServer(t)
	in := signInByCode(t, s, codes, "ama.mensah@example.com", "")
	type kept struct{ key, hint string }
	var logins []kept
	codesLeft := 0
	switch st := s.social.(type) {
	case *memoryStore:
		for key, l := range st.social.logins {
			logins = append(logins, kept{key, l.Hint})
		}
		codesLeft = len(st.social.codes)
	case *pgStore:
		ctx := context.Background()
		rows, err := st.pool.Query(ctx, `SELECT login_key, hint FROM account_logins`)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var k kept
			if err := rows.Scan(&k.key, &k.hint); err != nil {
				t.Fatal(err)
			}
			logins = append(logins, k)
		}
		rows.Close()
		if err := st.pool.QueryRow(ctx, `SELECT count(*) FROM login_codes`).Scan(&codesLeft); err != nil {
			t.Fatal(err)
		}
	default:
		t.Fatalf("unknown store %T", st)
	}
	if len(logins) != 1 {
		t.Fatalf("logins: %+v", logins)
	}
	for _, l := range logins {
		if strings.Contains(l.key, "ama") || strings.Contains(l.hint, "mensah") {
			t.Fatalf("login kept the address: %+v", l)
		}
		if l.hint != "a•••@example.com" {
			t.Fatalf("hint %q", l.hint)
		}
	}
	if codesLeft != 0 {
		t.Fatalf("a used code was kept (%d left)", codesLeft)
	}
	if strings.Contains(in.Account.ID, "ama") {
		t.Fatal("account ids are random")
	}
}

func TestSignInWithGoogleOrApple(t *testing.T) {
	s, codes := accountServer(t)
	w := send(t, s, "POST", "/api/auth/id", "", map[string]string{"provider": "google", "idToken": "tok-ama", "device": "Chrome"})
	expectStatus(t, w, http.StatusOK)
	google := decode[SignedIn](t, w)
	if !google.Created {
		t.Fatal("expected a new account")
	}
	expectError(t, send(t, s, "POST", "/api/auth/id", "", map[string]string{"provider": "google", "idToken": "forged"}), http.StatusUnauthorized, "invalid_id_token")
	expectError(t, send(t, s, "POST", "/api/auth/id", "", map[string]string{"provider": "myspace", "idToken": "tok-ama"}), http.StatusBadRequest, "invalid_request")

	// Signed in, adding Apple and an email address joins them to the same account.
	w = send(t, s, "POST", "/api/auth/id", google.AccountToken, map[string]string{"provider": "apple", "idToken": "tok-ama"})
	expectStatus(t, w, http.StatusOK)
	if got := decode[SignedIn](t, w); got.Created || got.Account.ID != google.Account.ID {
		t.Fatalf("apple made a second account: %+v", got)
	}
	expectStatus(t, send(t, s, "POST", "/api/auth/code", "", map[string]string{"address": "ama@example.com"}), http.StatusAccepted)
	w = send(t, s, "POST", "/api/auth/verify", google.AccountToken, map[string]string{"address": "ama@example.com", "code": codes.last(t).code})
	expectStatus(t, w, http.StatusOK)
	d := decode[AccountDetails](t, send(t, s, "GET", "/api/account", google.AccountToken, nil))
	if len(d.Logins) != 3 {
		t.Fatalf("expected google, apple and email on one account, got %+v", d.Logins)
	}

	// A sign-in that already belongs to someone else is never moved.
	other := signInByCode(t, s, codes, "kofi@example.com", "")
	w = send(t, s, "POST", "/api/auth/id", other.AccountToken, map[string]string{"provider": "google", "idToken": "tok-ama"})
	expectError(t, w, http.StatusConflict, "login_taken")
}

func TestSigningInBringsThePhonesMirror(t *testing.T) {
	s, codes := accountServer(t)
	phone := tokenFor(s, "phone-before-sign-in")
	expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: phone}, "k1"), http.StatusAccepted)

	in := signInByCode(t, s, codes, "ama@example.com", phone)
	if !in.Merged {
		t.Fatal("expected the phone's mirror to move to the account")
	}
	accDev, _ := s.devices.Verify(in.DeviceToken)
	oldDev, _ := s.devices.Verify(phone)
	answers, _, err := s.mirror.DeviceHistory(context.Background(), s.devices.mirrorKey(accDev), "2026-01-01", "2026-12-31")
	if err != nil || len(answers) != 1 || answers[0].QuestionID != "q-dishes" {
		t.Fatalf("account mirror: %+v %v", answers, err)
	}
	left, _, _ := s.mirror.DeviceHistory(context.Background(), s.devices.mirrorKey(oldDev), "2026-01-01", "2026-12-31")
	if len(left) != 0 {
		t.Fatalf("the phone's old rows stayed behind: %+v", left)
	}

	// From now on the account votes once per question, whatever phone it uses.
	second := signInByCode(t, s, codes, "ama@example.com", "")
	expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-bill", OptionID: "even", VoterID: in.DeviceToken}, "k2"), http.StatusAccepted)
	expectError(t, postVote(t, s, VoteRequest{QuestionID: "q-bill", OptionID: "itemised", VoterID: second.DeviceToken}, "k3"), http.StatusConflict, "duplicate_vote")
}

func TestAccountProfileAndSessions(t *testing.T) {
	s, codes := accountServer(t)
	a := signInByCode(t, s, codes, "ama@example.com", "")
	b := signInByCode(t, s, codes, "ama@example.com", "")

	expectError(t, send(t, s, "PATCH", "/api/account", a.AccountToken, map[string]string{"name": "  "}), http.StatusBadRequest, "invalid_name")
	expectError(t, send(t, s, "PATCH", "/api/account", a.AccountToken, map[string]string{"handle": "A!"}), http.StatusBadRequest, "invalid_handle")
	w := send(t, s, "PATCH", "/api/account", a.AccountToken, map[string]any{"name": "Ama", "handle": "@Ama", "connect": false})
	expectStatus(t, w, http.StatusOK)
	if v := decode[AccountView](t, w); v.Name != "Ama" || v.Handle != "ama" || v.Connect {
		t.Fatalf("got %+v", v)
	}
	other := signInByCode(t, s, codes, "kofi@example.com", "")
	expectError(t, send(t, s, "PATCH", "/api/account", other.AccountToken, map[string]string{"handle": "ama"}), http.StatusConflict, "handle_taken")

	d := decode[AccountDetails](t, send(t, s, "GET", "/api/account", a.AccountToken, nil))
	if len(d.Sessions) != 2 {
		t.Fatalf("expected two phones, got %+v", d.Sessions)
	}
	var otherPhone string
	for _, x := range d.Sessions {
		if !x.Current {
			otherPhone = x.ID
		}
	}
	// "Sign out there" ends the other phone's session.
	expectStatus(t, send(t, s, "DELETE", "/api/account/sessions/"+otherPhone, a.AccountToken, nil), http.StatusNoContent)
	expectError(t, send(t, s, "GET", "/api/account", b.AccountToken, nil), http.StatusUnauthorized, "signed_out")
	// And this phone signs itself out.
	expectStatus(t, send(t, s, "DELETE", "/api/account/sessions/current", a.AccountToken, nil), http.StatusNoContent)
	expectError(t, send(t, s, "GET", "/api/account", a.AccountToken, nil), http.StatusUnauthorized, "signed_out")
	expectError(t, send(t, s, "GET", "/api/account", "s1.made.up.token", nil), http.StatusUnauthorized, "signed_out")
}

func TestNotebookSync(t *testing.T) {
	s, codes := accountServer(t)
	a := signInByCode(t, s, codes, "ama@example.com", "")
	phrase := "apple river stone cloud amber maple quiet orbit lemon tiger velvet zebra"
	expectError(t, send(t, s, "GET", "/api/account/sync", a.AccountToken, nil), http.StatusNotFound, "no_sync")
	expectError(t, send(t, s, "PUT", "/api/account/sync", a.AccountToken, map[string]string{"phrase": "not twelve words"}), http.StatusBadRequest, "invalid_phrase")
	expectStatus(t, send(t, s, "PUT", "/api/account/sync", a.AccountToken, map[string]string{"phrase": phrase}), http.StatusNoContent)

	// The phrase is sealed at rest, and only this account opens it.
	sealed, err := s.social.SyncPhrase(context.Background(), a.Account.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte("apple")) {
		t.Fatal("the phrase is kept in the clear")
	}
	if _, ok := s.devices.openPhrase("someone-else", sealed); ok {
		t.Fatal("another account's key opened the phrase")
	}

	b := signInByCode(t, s, codes, "ama@example.com", "")
	w := send(t, s, "GET", "/api/account/sync", b.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	if got := decode[syncBody](t, w).Phrase; got != phrase {
		t.Fatalf("got %q", got)
	}
	if !b.Account.Sync {
		t.Fatal("the account should say sync is on")
	}
	expectStatus(t, send(t, s, "DELETE", "/api/account/sync", b.AccountToken, nil), http.StatusNoContent)
	expectError(t, send(t, s, "GET", "/api/account/sync", a.AccountToken, nil), http.StatusNotFound, "no_sync")
}

func TestDeleteAccount(t *testing.T) {
	s, codes := accountServer(t)
	ama := named(t, s, codes, "Ama")
	kofi := named(t, s, codes, "Kofi")
	befriend(t, s, ama, kofi)
	expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: ama.DeviceToken}, "k1"), http.StatusAccepted)
	expectStatus(t, send(t, s, "PUT", "/api/account/sync", ama.AccountToken, map[string]string{"phrase": "apple river stone cloud amber maple quiet orbit lemon tiger velvet zebra"}), http.StatusNoContent)

	expectStatus(t, send(t, s, "DELETE", "/api/account", ama.AccountToken, nil), http.StatusNoContent)
	expectError(t, send(t, s, "GET", "/api/account", ama.AccountToken, nil), http.StatusUnauthorized, "signed_out")
	c := decode[CircleView](t, send(t, s, "GET", "/api/circle", kofi.AccountToken, nil))
	if len(c.Friends) != 0 {
		t.Fatalf("a deleted account still shows in a friend's circle: %+v", c.Friends)
	}
	ctx := context.Background()
	if _, err := s.social.SyncPhrase(ctx, ama.Account.ID); err == nil {
		t.Fatal("the deleted account's phrase was kept")
	}
	if _, err := s.social.AccountByLogin(ctx, s.devices.loginKey("email", "ama@example.com")); !errors.Is(err, ErrNoAccount) {
		t.Fatalf("the deleted account's login was kept: %v", err)
	}
	if _, err := s.social.AccountByLogin(ctx, s.devices.loginKey("email", "kofi@example.com")); err != nil {
		t.Fatalf("Kofi's login must stay: %v", err)
	}
	dev, _ := s.devices.Verify(ama.DeviceToken)
	answers, _, _ := s.mirror.DeviceHistory(context.Background(), s.devices.mirrorKey(dev), "2026-01-01", "2026-12-31")
	if len(answers) != 0 {
		t.Fatal("the account's answers were kept")
	}
	// Signing in again with the same address starts a new, empty account.
	again := signInByCode(t, s, codes, "ama@example.com", "")
	if !again.Created || again.Account.ID == ama.Account.ID {
		t.Fatalf("got %+v", again)
	}
}

func TestFreshDeviceAfterDeletingEverything(t *testing.T) {
	s, codes := accountServer(t)
	a := signInByCode(t, s, codes, "ama@example.com", "")
	req := httptest.NewRequest("DELETE", "/api/device/data", nil)
	req.Header.Set("Authorization", "Device "+a.DeviceToken)
	expectStatus(t, do(t, s, req), http.StatusOK)
	expectError(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: a.DeviceToken}, "k1"), http.StatusGone, "device_forgotten")

	w := send(t, s, "POST", "/api/account/fresh", a.AccountToken, nil)
	expectStatus(t, w, http.StatusOK)
	fresh := decode[DeviceIssued](t, w).Token
	expectStatus(t, postVote(t, s, VoteRequest{QuestionID: "q-dishes", OptionID: "right-away", VoterID: fresh}, "k2"), http.StatusAccepted)
	// The account's other phones get the new id when they sign in.
	if again := signInByCode(t, s, codes, "ama@example.com", ""); again.DeviceToken != fresh {
		t.Fatal("a later sign-in must use the fresh device id")
	}
	t.Run("any phone on the account can fetch its current pass without moving it on", func(t *testing.T) {
		expectStatus(t, send(t, s, "GET", "/api/account/device", "", nil), http.StatusUnauthorized)
		for range 2 {
			w := send(t, s, "GET", "/api/account/device", a.AccountToken, nil)
			expectStatus(t, w, http.StatusOK)
			if got := decode[DeviceIssued](t, w).Token; got != fresh {
				t.Fatalf("current pass %q, want %q", got, fresh)
			}
		}
	})
}

func TestAddressesAndHints(t *testing.T) {
	for _, c := range []struct{ in, kind, out string }{
		{"Ama@Example.COM", "email", "ama@example.com"},
		{"+256 (772) 123-418", "phone", "+256772123418"},
		{"+44 7700 900123", "phone", "+447700900123"},
	} {
		kind, out, ok := normalizeAddress(c.in)
		if !ok || kind != c.kind || out != c.out {
			t.Fatalf("%q: got %s %s %v", c.in, kind, out, ok)
		}
	}
	for _, bad := range []string{"", "ama", "ama@", "@example.com", "07721234", "+0772123456", "+256 abc", "+1234"} {
		if _, _, ok := normalizeAddress(bad); ok {
			t.Fatalf("%q was accepted", bad)
		}
	}
	if h := hintFor("email", "ama@gmail.com"); h != "a•••@gmail.com" {
		t.Fatal(h)
	}
}
