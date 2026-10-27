package main

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"
)

// A Google or Apple token is checked against every ID the server was given:
// the web's, and the phone app's.
func TestIDTokenAudiences(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	b64 := base64.RawURLEncoding.EncodeToString
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "kid": "k1", "n": b64(key.N.Bytes()), "e": b64(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	defer jwks.Close()

	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	token := func(iss string, aud any) string {
		head, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "k1"})
		body, _ := json.Marshal(map[string]any{"iss": iss, "aud": aud, "sub": "s-1", "exp": now.Add(time.Hour).Unix(), "email": "ama@example.com"})
		signed := b64(head) + "." + b64(body)
		sum := sha256.Sum256([]byte(signed))
		sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
		if err != nil {
			t.Fatal(err)
		}
		return signed + "." + b64(sig)
	}

	c := signInFromEnv(func(k string) string {
		return map[string]string{
			"GOOGLE_CLIENT_ID":      "web.apps.googleusercontent.com",
			"GOOGLE_APP_CLIENT_IDS": " ios.apps.googleusercontent.com, android.apps.googleusercontent.com ,",
			"APPLE_APP_IDS":         "com.personaindex.app",
		}[k]
	}, false, func() time.Time { return now })
	if !slices.Equal(c.googleAudiences(), []string{"web.apps.googleusercontent.com", "ios.apps.googleusercontent.com", "android.apps.googleusercontent.com"}) {
		t.Fatalf("google audiences %v", c.googleAudiences())
	}
	v := c.IDs.(*jwksVerifier)
	for p, iss := range v.issuers {
		iss.jwksURL = jwks.URL
		v.issuers[p] = iss
	}

	ok := []struct {
		provider, iss string
		aud           any
	}{
		{"google", "https://accounts.google.com", "web.apps.googleusercontent.com"},
		{"google", "accounts.google.com", "ios.apps.googleusercontent.com"},
		{"google", "https://accounts.google.com", []string{"other", "android.apps.googleusercontent.com"}},
		{"apple", "https://appleid.apple.com", "com.personaindex.app"},
	}
	for _, x := range ok {
		if sub, _, err := v.Verify(context.Background(), x.provider, token(x.iss, x.aud)); err != nil || sub != "s-1" {
			t.Errorf("%s token for %v: got %q, %v", x.provider, x.aud, sub, err)
		}
	}
	bad := []struct {
		provider, iss string
		aud           any
	}{
		{"google", "https://accounts.google.com", "someone-else.apps.googleusercontent.com"},
		{"google", "https://appleid.apple.com", "web.apps.googleusercontent.com"},
		{"apple", "https://appleid.apple.com", "com.someone.else"},
		{"apple", "https://appleid.apple.com", "web.apps.googleusercontent.com"},
	}
	for _, x := range bad {
		if _, _, err := v.Verify(context.Background(), x.provider, token(x.iss, x.aud)); err == nil {
			t.Errorf("%s token from %s for %v was accepted", x.provider, x.iss, x.aud)
		}
	}
}

// The app's buttons show only when the server takes the app's tokens; the
// web's buttons only when it has the web's IDs.
func TestSignInMethodsForTheApp(t *testing.T) {
	s := newTestServer()
	s.signIn = SignInConfig{IDs: fakeIDs{"apple:tok-ama": "a-ama"}, AppleAppIDs: []string{"com.personaindex.app"}}
	m := decode[SignInMethods](t, get(t, s, "/api/auth/methods"))
	if m.Apple || m.Google || !m.AppleApp || m.GoogleApp {
		t.Fatalf("got %+v", m)
	}
	r := send(t, s, "POST", "/api/auth/id", "", map[string]string{"provider": "apple", "idToken": "tok-ama"})
	if r.Code != http.StatusOK {
		t.Fatalf("an app-only Apple sign-in got %d: %s", r.Code, r.Body)
	}
	expectError(t, send(t, s, "POST", "/api/auth/id", "", map[string]string{"provider": "google", "idToken": "tok-ama"}), http.StatusServiceUnavailable, "sign_in_unavailable")
}
