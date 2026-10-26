package main

import (
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
)

// Device tokens are how the one-vote-per-device rule is enforced. The server
// mints each token as a random device id plus an HMAC signature over it, so a
// script cannot invent new devices: every new device costs a call to
// POST /api/device, which is rate limited per network address (see
// ratelimit.go) and at the edge. The token holds no personal data.
//
// Format: "v2.<kid>.<id>.<sig>". id is 16 random bytes; kid names the signing
// key (4 characters); sig is the first 16 bytes of HMAC-SHA256(key,
// "v2.<kid>.<id>"); all base64url without padding.
//
// Two secrets, each with one job (review of 2026-10-15: one secret doing four
// jobs could not be rotated without wiping everyone's history):
//
//   - The token secret signs tokens. It can be rotated: the previous secret
//     keeps verifying, so phones are not signed out, and the device id inside
//     a token never changes.
//   - The data secret keys every hash the server stores: the per-question
//     voter hash, the mirror key and the private question id. Each use has
//     its own key, derived with HKDF under its own label. Changing the data
//     secret orphans every phone's stored history, so it is never rotated in
//     the normal run of things (docs/operations.md).

const tokenVersion = "v2."

// DeviceIssued is the 201 body of POST /api/device.
type DeviceIssued struct {
	Token string `json:"token"`
}

// minSecretBytes is the shortest secret accepted for either key.
const minSecretBytes = 32

type signingKey struct {
	kid string
	key []byte
}

type deviceSigner struct {
	signing []signingKey // [0] signs new tokens; every entry verifies

	hashVoter, hashMirror, hashPrivate []byte

	// What Helped (whathelped.go): the key a phone's reports are kept under.
	hashHelped []byte

	// Accounts (accounts.go): the login hash, the account's device id, the
	// friend mark and the seal on a synced backup phrase, each its own key
	// from the data secret.
	hashLogin, accountDevice, friendMark, syncSeal []byte
}

// KeyConfig is the server's key material, from the environment (main.go).
type KeyConfig struct {
	TokenSecret         []byte // signs new tokens
	PreviousTokenSecret []byte // optional: still verifies tokens it signed
	DataSecret          []byte // keys stored hashes
}

var errWeakSecret = errors.New("secrets must be at least 32 bytes")

func newKeyring(c KeyConfig) (*deviceSigner, error) {
	if len(c.TokenSecret) < minSecretBytes || len(c.DataSecret) < minSecretBytes ||
		(c.PreviousTokenSecret != nil && len(c.PreviousTokenSecret) < minSecretBytes) {
		return nil, errWeakSecret
	}
	if hmac.Equal(c.TokenSecret, c.DataSecret) || hmac.Equal(c.PreviousTokenSecret, c.DataSecret) {
		return nil, errors.New("the data secret must differ from the token secrets")
	}
	d := &deviceSigner{signing: []signingKey{newSigningKey(c.TokenSecret)}}
	if c.PreviousTokenSecret != nil && !hmac.Equal(c.PreviousTokenSecret, c.TokenSecret) {
		prev := newSigningKey(c.PreviousTokenSecret)
		if prev.kid == d.signing[0].kid {
			return nil, errors.New("the previous token secret collides with the current one")
		}
		d.signing = append(d.signing, prev)
	}
	d.hashVoter = deriveKey(c.DataSecret, "voter-hash v1")
	d.hashMirror = deriveKey(c.DataSecret, "mirror-key v1")
	d.hashPrivate = deriveKey(c.DataSecret, "private-question v1")
	d.hashHelped = deriveKey(c.DataSecret, "helped-key v1")
	d.hashLogin = deriveKey(c.DataSecret, "login-key v1")
	d.accountDevice = deriveKey(c.DataSecret, "account-device v1")
	d.friendMark = deriveKey(c.DataSecret, "friend-mark v1")
	d.syncSeal = deriveKey(c.DataSecret, "sync-seal v1")
	return d, nil
}

// newDeviceSigner builds a keyring from one secret, for tests and for local
// runs without a database: the data secret is derived from it under its own
// label, so the two are still distinct keys.
func newDeviceSigner(secret []byte) *deviceSigner {
	if len(secret) < minSecretBytes {
		panic("device token secret must be at least 32 bytes")
	}
	d, err := newKeyring(KeyConfig{TokenSecret: secret, DataSecret: deriveKey(secret, "local data secret")})
	if err != nil {
		panic(err)
	}
	return d
}

func newSigningKey(secret []byte) signingKey {
	sum := sha256.Sum256(append([]byte("persona-index kid:"), secret...))
	return signingKey{kid: base64.RawURLEncoding.EncodeToString(sum[:3]), key: deriveKey(secret, "device-token v2")}
}

func deriveKey(secret []byte, label string) []byte {
	k, err := hkdf.Key(sha256.New, secret, []byte("persona-index"), label, 32)
	if err != nil {
		panic(err) // only fails for a key length HKDF cannot produce
	}
	return k
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
	k := d.signing[0]
	return tokenVersion + k.kid + "." + id + "." + sign(k, id)
}

func sign(k signingKey, id string) string {
	m := hmac.New(sha256.New, k.key)
	m.Write([]byte(tokenVersion + k.kid + "." + id))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

// parseToken splits a well-formed token into its key id, device id and
// signature, without checking the signature.
func parseToken(token string) (kid, id, sig string, ok bool) {
	rest, ok := strings.CutPrefix(token, tokenVersion)
	if !ok || len(token) > 64 {
		return "", "", "", false
	}
	parts := strings.Split(rest, ".")
	if len(parts) != 3 || len(parts[0]) != 4 || len(parts[1]) != 22 || len(parts[2]) != 22 {
		return "", "", "", false
	}
	for _, p := range parts {
		if _, err := base64.RawURLEncoding.DecodeString(p); err != nil {
			return "", "", "", false
		}
	}
	return parts[0], parts[1], parts[2], true
}

// Verify returns the device id inside a token the server signed, with the
// current key or the previous one.
func (d *deviceSigner) Verify(token string) (string, bool) {
	kid, id, sig, ok := parseToken(token)
	if !ok {
		return "", false
	}
	for _, k := range d.signing {
		if k.kid == kid && hmac.Equal([]byte(sig), []byte(sign(k, id))) {
			return id, true
		}
	}
	return "", false
}

// Holder returns the device id inside any well-formed token, signed or not.
// It is used only to delete what is kept for a device: holding the id is
// proof enough of owning that device's rows, because the id is 16 random
// bytes that only its phone has. So "Delete everything" still works for a
// phone whose token was signed by a key the server no longer has, and a
// made-up id deletes nothing.
func (d *deviceSigner) Holder(token string) (string, bool) {
	_, id, _, ok := parseToken(token)
	return id, ok
}

// voterHash is the only form of the device id stored with a vote. It is keyed
// and taken per question, so a leaked vote table can be joined neither back to
// tokens nor across questions into one person's answers.
func (d *deviceSigner) voterHash(id, questionID string) string {
	m := hmac.New(sha256.New, d.hashVoter)
	m.Write([]byte(id + "\x00" + questionID))
	return hex.EncodeToString(m.Sum(nil)[:16])
}

// mirrorKey is the key one phone's mirror rows are stored under: the same for
// all of its answers, so its week can be read back, but made with a different
// key from every per-question voterHash, so the vote table still cannot be
// joined on it.
func (d *deviceSigner) mirrorKey(id string) string {
	m := hmac.New(sha256.New, d.hashMirror)
	m.Write([]byte(id))
	return hex.EncodeToString(m.Sum(nil)[:16])
}

// helpedKey is the key one phone's What Helped reports are kept under: one
// per phone, so a report can be changed and deleted with everything else,
// but made with its own key, so the reports cannot be joined to the votes
// or to the mirror.
func (d *deviceSigner) helpedKey(id string) string {
	m := hmac.New(sha256.New, d.hashHelped)
	m.Write([]byte(id))
	return hex.EncodeToString(m.Sum(nil)[:16])
}

// privateQuestionID stands in for a private question's id in the mirror, so
// a stored row says only that a private answer was given.
func (d *deviceSigner) privateQuestionID(questionID string) string {
	m := hmac.New(sha256.New, d.hashPrivate)
	m.Write([]byte(questionID))
	return "private-" + hex.EncodeToString(m.Sum(nil)[:12])
}
