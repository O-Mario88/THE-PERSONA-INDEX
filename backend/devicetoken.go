package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
)

// Device tokens are how the one-vote-per-device rule is enforced. The server
// mints each token as a random device id plus an HMAC signature over it, so a
// script cannot invent new devices: every new device costs a call to
// POST /api/device, which is rate limited per network address (see
// ratelimit.go) and at the edge.
//
// Format: "v1.<id>.<sig>", where id is 16 random bytes and sig is the first
// 16 bytes of HMAC-SHA256(secret, "v1.<id>"), both base64url without padding.
// The token holds no personal data. Rotating the secret signs every device
// out; a new token is then issued on the next visit.

const tokenVersion = "v1."

// DeviceIssued is the 201 body of POST /api/device.
type DeviceIssued struct {
	Token string `json:"token"`
}

type deviceSigner struct{ key []byte }

func newDeviceSigner(secret []byte) *deviceSigner {
	if len(secret) < 32 {
		panic("device token secret must be at least 32 bytes")
	}
	return &deviceSigner{key: append([]byte(nil), secret...)}
}

// Issue mints a token for a brand-new device.
func (d *deviceSigner) Issue() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err) // crypto/rand does not fail on supported platforms
	}
	return d.tokenFor(base64.RawURLEncoding.EncodeToString(b[:]))
}

func (d *deviceSigner) tokenFor(id string) string {
	return tokenVersion + id + "." + d.sign(id)
}

func (d *deviceSigner) sign(id string) string {
	m := hmac.New(sha256.New, d.key)
	m.Write([]byte(tokenVersion + id))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

// Verify returns the device id inside a token the server signed.
func (d *deviceSigner) Verify(token string) (string, bool) {
	rest, ok := strings.CutPrefix(token, tokenVersion)
	if !ok || len(token) > 64 {
		return "", false
	}
	id, sig, ok := strings.Cut(rest, ".")
	if !ok || len(id) != 22 || len(sig) != 22 {
		return "", false
	}
	if _, err := base64.RawURLEncoding.DecodeString(id); err != nil {
		return "", false
	}
	if !hmac.Equal([]byte(sig), []byte(d.sign(id))) {
		return "", false
	}
	return id, true
}

// voterHash is the only form of the device id that is stored. It is keyed by
// the server secret and by the question, so a leaked vote table can be joined
// neither back to tokens nor across questions into one person's answers.
func (d *deviceSigner) voterHash(id, questionID string) string {
	m := hmac.New(sha256.New, d.key)
	m.Write([]byte("voter:" + id + "\x00" + questionID))
	return hex.EncodeToString(m.Sum(nil)[:16])
}
