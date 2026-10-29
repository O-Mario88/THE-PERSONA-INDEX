package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The Persona Index Patron (Edwin's brief, 2026-10-29): whatever a person
// bought, held under their account once they sign in, or under this phone
// until then. Test purchases stand in for the stores until the App Store,
// Google Play and the web checkout are set up.

func patronRequest(t *testing.T, s *Server, method, device, account string, body any) *httptest.ResponseRecorder {
	t.Helper()
	path := "/api/patron"
	if method != http.MethodGet {
		path = "/api/patron/test"
	}
	if account != "" {
		return send(t, s, method, path, account, body)
	}
	var req *http.Request
	if body == nil {
		req = httptest.NewRequest(method, path, nil)
	} else {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req = httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
	}
	if device != "" {
		req.Header.Set("Authorization", "Device "+tokenFor(s, device))
	}
	return do(t, s, req)
}

func patronOf(t *testing.T, s *Server, device, account string) PatronView {
	t.Helper()
	w := patronRequest(t, s, http.MethodGet, device, account, nil)
	expectStatus(t, w, http.StatusOK)
	return decode[PatronView](t, w)
}

func buy(t *testing.T, s *Server, device, plan string) *httptest.ResponseRecorder {
	t.Helper()
	return patronRequest(t, s, http.MethodPost, device, "", map[string]string{"plan": plan})
}

func TestPatron(t *testing.T) {
	t.Run("nobody is a Patron until they buy one", func(t *testing.T) {
		s := newTestServer()
		s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1000}
		if v := patronOf(t, s, "phone-a", ""); v.Plan != "" || v.Until != "" || v.FoundingLeft != 1000 || !v.Test {
			t.Fatalf("got %+v", v)
		}
	})

	t.Run("needs this phone's pass or an account", func(t *testing.T) {
		s := newTestServer()
		expectError(t, get(t, s, "/api/patron"), http.StatusUnauthorized, "invalid_device")
	})

	t.Run("a test purchase holds until the plan's last day, and a Founding place never ends", func(t *testing.T) {
		s := newTestServer()
		s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1000}
		expectStatus(t, buy(t, s, "phone-a", planMonthly), http.StatusOK)
		if v := patronOf(t, s, "phone-a", ""); v.Plan != planMonthly || v.Until != "2026-11-11" {
			t.Fatalf("got %+v", v)
		}
		expectStatus(t, buy(t, s, "phone-a", planFounding), http.StatusOK)
		if v := patronOf(t, s, "phone-a", ""); v.Plan != planFounding || v.Until != "" || v.FoundingLeft != 999 {
			t.Fatalf("got %+v", v)
		}
		// Another phone is not a Patron because this one is.
		if v := patronOf(t, s, "phone-b", ""); v.Plan != "" {
			t.Fatalf("phone-b got %+v", v)
		}
	})

	t.Run("test purchases are refused wherever they are off", func(t *testing.T) {
		s := newTestServer()
		expectError(t, buy(t, s, "phone-a", planMonthly), http.StatusNotFound, "not_found")
	})

	t.Run("an unknown plan is refused", func(t *testing.T) {
		s := newTestServer()
		s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1000}
		expectError(t, buy(t, s, "phone-a", "forever-free"), http.StatusBadRequest, "invalid_request")
	})

	t.Run("the Founding places run out", func(t *testing.T) {
		s := newTestServer()
		s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1}
		expectStatus(t, buy(t, s, "phone-a", planFounding), http.StatusOK)
		expectError(t, buy(t, s, "phone-b", planFounding), http.StatusConflict, "founding_full")
		if v := patronOf(t, s, "phone-b", ""); v.FoundingLeft != 0 {
			t.Fatalf("got %+v", v)
		}
	})

	t.Run("a phone's Patron moves to the account it signs in to, and follows it to every phone", func(t *testing.T) {
		s, codes := accountServer(t)
		s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1000}
		expectStatus(t, buy(t, s, "phone-a", planPass90), http.StatusOK)
		in := signInByCode(t, s, codes, "ama@example.com", tokenFor(s, "phone-a"))
		if v := patronOf(t, s, "", in.AccountToken); v.Plan != planPass90 || v.Until != "2027-01-09" {
			t.Fatalf("got %+v", v)
		}
		again := signInByCode(t, s, codes, "ama@example.com", tokenFor(s, "phone-b"))
		if v := patronOf(t, s, "", again.AccountToken); v.Plan != planPass90 {
			t.Fatalf("second phone got %+v", v)
		}
	})

	t.Run("test purchases can be cleared, to try again", func(t *testing.T) {
		s := newTestServer()
		s.patronCfg = PatronConfig{Test: true, FoundingLimit: 1000}
		expectStatus(t, buy(t, s, "phone-a", planYearly), http.StatusOK)
		expectStatus(t, patronRequest(t, s, http.MethodDelete, "phone-a", "", nil), http.StatusOK)
		if v := patronOf(t, s, "phone-a", ""); v.Plan != "" {
			t.Fatalf("got %+v", v)
		}
	})
}

func TestPatronFromEnv(t *testing.T) {
	env := map[string]string{}
	getenv := func(k string) string { return env[k] }
	if c := patronFromEnv(getenv, false); c.Test || c.FoundingLimit != defaultFoundingLimit {
		t.Fatalf("production with no settings: %+v", c)
	}
	if !patronFromEnv(getenv, true).Test {
		t.Fatal("a local run allows test purchases")
	}
	env["PATRON_TEST"] = "1"
	env["FOUNDING_LIMIT"] = "500"
	if c := patronFromEnv(getenv, false); !c.Test || c.FoundingLimit != 500 {
		t.Fatalf("got %+v", c)
	}
}
