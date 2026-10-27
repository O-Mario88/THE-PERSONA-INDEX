package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
)

// Where sign-in codes go and how Google and Apple tokens are checked. The
// server never sends email or SMS itself: it hands the code to a webhook the
// operator runs (an email or SMS provider's API, or a small function in front
// of one), so no provider is built in and none of their keys live here.
//
// Environment (main.go):
//
//	SIGNIN_CODE_WEBHOOK        https URL that receives {"kind","to","code","text"}
//	SIGNIN_CODE_WEBHOOK_TOKEN  sent as "Authorization: Bearer <token>"
//	SIGNIN_CODE_KINDS          "email,phone" (default), or one of them
//	GOOGLE_CLIENT_ID           turns on "Continue with Google"
//	APPLE_CLIENT_ID            turns on "Continue with Apple" (the Services ID)
//	GOOGLE_APP_CLIENT_IDS      the phone app's Google client IDs (iOS, Android), comma-separated
//	APPLE_APP_IDS              the phone app's bundle ID(s), for Apple sign-in on iPhone
//
// The web's IDs are what the browser buttons use; a phone app's token is made
// for the app instead, so its IDs are accepted as well.
//
// With none of them set the sign-in sheet shows nothing it cannot do. A
// local run with no database prints codes to the log instead.

type webhookSender struct {
	url, token string
	client     *http.Client
}

func (w webhookSender) Send(ctx context.Context, kind, to, code string) error {
	body, _ := json.Marshal(map[string]string{
		"kind": kind, "to": to, "code": code,
		"text": fmt.Sprintf("%s is your Persona Index code. It works for 10 minutes. If you didn't ask for it, ignore this.", code),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if w.token != "" {
		req.Header.Set("Authorization", "Bearer "+w.token)
	}
	res, err := w.client.Do(req)
	if err != nil {
		return err
	}
	res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("code webhook answered %d", res.StatusCode)
	}
	return nil
}

// logSender is for local runs only: the code goes to the server's log.
type logSender struct{}

func (logSender) Send(_ context.Context, kind, to, code string) error {
	slog.Warn("sign-in code (local run, not sent)", "kind", kind, "to", hintFor(kind, to), "code", code)
	return nil
}

// jwksVerifier checks RS256 ID tokens from Google and Apple against their
// published keys, cached for an hour.
type jwksVerifier struct {
	client  *http.Client
	clock   func() time.Time
	issuers map[string]idIssuer

	mu   sync.Mutex
	keys map[string]cachedKeys
}

type idIssuer struct {
	jwksURL   string
	issuers   []string
	audiences []string
}

type cachedKeys struct {
	keys    map[string]*rsa.PublicKey
	fetched time.Time
}

func newJWKSVerifier(google, apple []string, client *http.Client, clock func() time.Time) *jwksVerifier {
	v := &jwksVerifier{client: client, clock: clock, issuers: map[string]idIssuer{}, keys: map[string]cachedKeys{}}
	if len(google) > 0 {
		v.issuers["google"] = idIssuer{jwksURL: "https://www.googleapis.com/oauth2/v3/certs",
			issuers: []string{"https://accounts.google.com", "accounts.google.com"}, audiences: google}
	}
	if len(apple) > 0 {
		v.issuers["apple"] = idIssuer{jwksURL: "https://appleid.apple.com/auth/keys", issuers: []string{"https://appleid.apple.com"}, audiences: apple}
	}
	return v
}

var errBadIDToken = errors.New("bad id token")

func (v *jwksVerifier) Verify(ctx context.Context, provider, token string) (string, string, error) {
	iss, ok := v.issuers[provider]
	if !ok {
		return "", "", errBadIDToken
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", "", errBadIDToken
	}
	var head struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := decodeSegment(parts[0], &head); err != nil || head.Alg != "RS256" {
		return "", "", errBadIDToken
	}
	key, err := v.key(ctx, provider, iss.jwksURL, head.Kid)
	if err != nil {
		return "", "", err
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", "", errBadIDToken
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig) != nil {
		return "", "", errBadIDToken
	}
	var claims struct {
		Iss           string          `json:"iss"`
		Aud           json.RawMessage `json:"aud"`
		Sub           string          `json:"sub"`
		Exp           int64           `json:"exp"`
		Email         string          `json:"email"`
		EmailVerified any             `json:"email_verified"`
	}
	if err := decodeSegment(parts[1], &claims); err != nil {
		return "", "", errBadIDToken
	}
	var auds []string
	if json.Unmarshal(claims.Aud, &auds) != nil {
		var one string
		if json.Unmarshal(claims.Aud, &one) != nil {
			return "", "", errBadIDToken
		}
		auds = []string{one}
	}
	now := v.clock().Unix()
	if !slices.Contains(iss.issuers, claims.Iss) || !slices.ContainsFunc(auds, func(a string) bool { return slices.Contains(iss.audiences, a) }) || claims.Sub == "" || claims.Exp < now-60 {
		return "", "", errBadIDToken
	}
	return claims.Sub, claims.Email, nil
}

func decodeSegment(seg string, v any) error {
	b, err := base64.RawURLEncoding.DecodeString(seg)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func (v *jwksVerifier) key(ctx context.Context, provider, url, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	c := v.keys[provider]
	v.mu.Unlock()
	if k, ok := c.keys[kid]; ok && v.clock().Sub(c.fetched) < time.Hour {
		return k, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := v.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var set struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(res.Body).Decode(&set); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" {
			continue
		}
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 != nil || err2 != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	v.mu.Lock()
	v.keys[provider] = cachedKeys{keys: keys, fetched: v.clock()}
	v.mu.Unlock()
	k, ok := keys[kid]
	if !ok {
		return nil, errBadIDToken
	}
	return k, nil
}

// signInFromEnv builds the sign-in settings. local is true for a run with no
// database, where codes go to the log.
func signInFromEnv(getenv func(string) string, local bool, clock func() time.Time) SignInConfig {
	c := SignInConfig{GoogleClientID: strings.TrimSpace(getenv("GOOGLE_CLIENT_ID")), AppleClientID: strings.TrimSpace(getenv("APPLE_CLIENT_ID")),
		GoogleAppIDs: idList(getenv("GOOGLE_APP_CLIENT_IDS")), AppleAppIDs: idList(getenv("APPLE_APP_IDS"))}
	client := &http.Client{Timeout: 10 * time.Second}
	kinds := []string{"email", "phone"}
	if k := strings.TrimSpace(getenv("SIGNIN_CODE_KINDS")); k != "" {
		kinds = nil
		for _, x := range strings.Split(k, ",") {
			if x = strings.TrimSpace(x); x == "email" || x == "phone" {
				kinds = append(kinds, x)
			}
		}
	}
	if url := strings.TrimSpace(getenv("SIGNIN_CODE_WEBHOOK")); strings.HasPrefix(url, "https://") {
		c.Codes, c.CodeKinds = webhookSender{url: url, token: getenv("SIGNIN_CODE_WEBHOOK_TOKEN"), client: client}, kinds
	} else if local {
		c.Codes, c.CodeKinds = logSender{}, kinds
	}
	google, apple := c.googleAudiences(), c.appleAudiences()
	if len(google) > 0 || len(apple) > 0 {
		c.IDs = newJWKSVerifier(google, apple, client, clock)
	}
	return c
}

// idList reads a comma-separated list of IDs.
func idList(s string) []string {
	var out []string
	for _, x := range strings.Split(s, ",") {
		if x = strings.TrimSpace(x); x != "" && !slices.Contains(out, x) {
			out = append(out, x)
		}
	}
	return out
}

func withOne(one string, more []string) []string {
	if one == "" {
		return more
	}
	return append([]string{one}, more...)
}

// The audiences a Google or Apple token may be made for: the web's ID and
// the phone app's.
func (c SignInConfig) googleAudiences() []string { return withOne(c.GoogleClientID, c.GoogleAppIDs) }
func (c SignInConfig) appleAudiences() []string  { return withOne(c.AppleClientID, c.AppleAppIDs) }
