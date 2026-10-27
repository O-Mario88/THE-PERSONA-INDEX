package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Lazy accounts (Stage 5, Edwin 2026-10-24). Nobody needs an account to
// answer: the app offers one after the third card, to keep the notebook on
// every device and to open the circle. Signing in is one tap with Google or
// Apple, or a 6-digit code sent to an email address or phone number. There
// is no password.
//
// A signed-in phone holds two tokens:
//
//   - its device token (devicetoken.go), now for the account's own device
//     id, so every phone of one person votes and keeps its mirror under one
//     id: the one-vote rule (voterule.go) becomes one vote per account;
//   - an account token, "s1.<kid>.<session>.<sig>", for the account's own
//     calls. Signing out deletes the session, so the token stops working.

const (
	codeLife          = 10 * time.Minute
	maxCodeTries      = 5
	codesPerLoginHour = 5  // codes sent to one address an hour
	codesPerAddrHour  = 20 // codes asked for from one network address an hour
	signInsPerAddrHr  = 60 // verify and OAuth calls from one network address an hour
	accountsCallsMin  = 60 // account and circle calls per session a minute
	maxNameRunes      = 40
	maxLabelRunes     = 60
	maxPhraseBytes    = 240
	sessionVersion    = "s1."
)

// CodeSender sends a 6-digit sign-in code. kind is "email" or "phone".
type CodeSender interface {
	Send(ctx context.Context, kind, to, code string) error
}

// IDVerifier checks a Google or Apple ID token and returns the account's
// stable subject and, when the provider gives one, its email for the hint.
type IDVerifier interface {
	Verify(ctx context.Context, provider, idToken string) (subject, email string, err error)
}

// SignInConfig is what the server can offer, from the environment.
type SignInConfig struct {
	Codes          CodeSender // nil: no email or phone codes
	CodeKinds      []string   // which of "email", "phone" the sender handles
	IDs            IDVerifier // nil: no Google or Apple
	GoogleClientID string     // the web's
	AppleClientID  string     // the web's (a Services ID)
	GoogleAppIDs   []string   // the phone app's Google client IDs
	AppleAppIDs    []string   // the phone app's bundle IDs
}

// SignInMethods is GET /api/auth/methods: which buttons the app shows.
type SignInMethods struct {
	Email          bool   `json:"email"`
	Phone          bool   `json:"phone"`
	Google         bool   `json:"google"`
	Apple          bool   `json:"apple"`
	GoogleClientID string `json:"googleClientId,omitempty"`
	AppleClientID  string `json:"appleClientId,omitempty"`
	// The phone app's buttons: on when the server accepts the app's tokens.
	GoogleApp bool `json:"googleApp,omitempty"`
	AppleApp  bool `json:"appleApp,omitempty"`
}

// AccountView is an account as its own phones see it.
type AccountView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Handle  string `json:"handle"`
	Suggest bool   `json:"suggest"`
	Connect bool   `json:"connect"`
	Sync    bool   `json:"sync"`
}

// SignedIn is the 200 body of a sign-in.
type SignedIn struct {
	Account      AccountView `json:"account"`
	AccountToken string      `json:"accountToken"`
	DeviceToken  string      `json:"deviceToken"`
	Created      bool        `json:"created"`
	Merged       bool        `json:"merged"` // this phone's mirror moved to the account
}

// AccountDetails is GET /api/account.
type AccountDetails struct {
	Account  AccountView   `json:"account"`
	Logins   []LoginView   `json:"logins"`
	Sessions []SessionView `json:"sessions"`
}

type LoginView struct {
	Kind string `json:"kind"`
	Hint string `json:"hint"`
}

type SessionView struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	SeenOn  string `json:"seenOn"`
	Current bool   `json:"current"`
}

func (a Account) view() AccountView {
	return AccountView{ID: a.ID, Name: a.Name, Handle: a.Handle, Suggest: a.Suggest, Connect: a.Connect, Sync: a.Sync}
}

// Keys and tokens.

func (d *deviceSigner) loginKey(kind, subject string) string {
	m := hmac.New(sha256.New, d.hashLogin)
	m.Write([]byte(kind + ":" + subject))
	return hex.EncodeToString(m.Sum(nil)[:16])
}

func (d *deviceSigner) codeHash(loginKey, code string) string {
	m := hmac.New(sha256.New, d.hashLogin)
	m.Write([]byte("code:" + loginKey + ":" + code))
	return hex.EncodeToString(m.Sum(nil)[:16])
}

// accountDeviceID is the device id every phone of an account uses. It is
// made, not stored: from the account's id and how many times it deleted
// everything.
func (d *deviceSigner) accountDeviceID(a Account) string {
	m := hmac.New(sha256.New, d.accountDevice)
	m.Write([]byte(a.ID + ":" + strconv.Itoa(a.Epoch)))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

func sessionSign(k signingKey, id string) string {
	m := hmac.New(sha256.New, deriveKey(k.key, "account-session v1"))
	m.Write([]byte(sessionVersion + k.kid + "." + id))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}

func (d *deviceSigner) sessionToken(id string) string {
	k := d.signing[0]
	return sessionVersion + k.kid + "." + id + "." + sessionSign(k, id)
}

func (d *deviceSigner) verifySession(token string) (string, bool) {
	rest, ok := strings.CutPrefix(token, sessionVersion)
	if !ok || len(token) > 64 {
		return "", false
	}
	parts := strings.Split(rest, ".")
	if len(parts) != 3 || len(parts[0]) != 4 || len(parts[1]) != 22 || len(parts[2]) != 22 {
		return "", false
	}
	for _, k := range d.signing {
		if k.kid == parts[0] && hmac.Equal([]byte(parts[2]), []byte(sessionSign(k, parts[1]))) {
			return parts[1], true
		}
	}
	return "", false
}

func (d *deviceSigner) friendMarkOf(sender, subject string) string {
	m := hmac.New(sha256.New, d.friendMark)
	m.Write([]byte(sender + "\x00" + subject))
	return hex.EncodeToString(m.Sum(nil)[:12])
}

func (d *deviceSigner) syncCipher(accountID string) cipher.AEAD {
	m := hmac.New(sha256.New, d.syncSeal)
	m.Write([]byte(accountID))
	block, err := aes.NewCipher(m.Sum(nil))
	if err != nil {
		panic(err)
	}
	g, err := cipher.NewGCM(block)
	if err != nil {
		panic(err)
	}
	return g
}

func (d *deviceSigner) sealPhrase(accountID, phrase string) []byte {
	g := d.syncCipher(accountID)
	nonce := make([]byte, g.NonceSize())
	rand.Read(nonce)
	return g.Seal(nonce, nonce, []byte(phrase), []byte(accountID))
}

func (d *deviceSigner) openPhrase(accountID string, sealed []byte) (string, bool) {
	g := d.syncCipher(accountID)
	if len(sealed) < g.NonceSize() {
		return "", false
	}
	p, err := g.Open(nil, sealed[:g.NonceSize()], sealed[g.NonceSize():], []byte(accountID))
	return string(p), err == nil
}

func randomID() string {
	var b [16]byte
	rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}

func sixDigits() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// Addresses.

var (
	emailPattern  = regexp.MustCompile(`^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$`)
	handlePattern = regexp.MustCompile(`^[a-z0-9_]{3,20}$`)
)

// normalizeAddress reads what the person typed as an email address or a
// phone number with its country code.
func normalizeAddress(in string) (kind, address string, ok bool) {
	s := strings.TrimSpace(in)
	if len(s) > 254 {
		return "", "", false
	}
	if strings.Contains(s, "@") {
		s = strings.ToLower(s)
		return "email", s, emailPattern.MatchString(s)
	}
	var b strings.Builder
	for i, r := range s {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '+' && i == 0:
		case r == ' ' || r == '-' || r == '(' || r == ')' || r == '.':
		default:
			return "", "", false
		}
	}
	digits := b.String()
	if !strings.HasPrefix(s, "+") || len(digits) < 8 || len(digits) > 15 || digits[0] == '0' {
		return "", "", false
	}
	return "phone", "+" + digits, true
}

// hintFor is what the account screen shows of a sign-in: never all of it.
func hintFor(kind, address string) string {
	switch kind {
	case "email", "google", "apple":
		user, domain, ok := strings.Cut(address, "@")
		if !ok || user == "" {
			return ""
		}
		first, _ := utf8.DecodeRuneInString(user)
		return string(first) + "•••@" + domain
	case "phone":
		if len(address) < 8 {
			return ""
		}
		return address[:4] + " ••• " + address[len(address)-3:]
	}
	return ""
}

// Handlers.

func (s *Server) SignInMethods(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=300")
	c := s.signIn
	m := SignInMethods{}
	if c.Codes != nil {
		for _, k := range c.CodeKinds {
			m.Email = m.Email || k == "email"
			m.Phone = m.Phone || k == "phone"
		}
	}
	if c.IDs != nil {
		m.Google, m.GoogleClientID = c.GoogleClientID != "", c.GoogleClientID
		m.Apple, m.AppleClientID = c.AppleClientID != "", c.AppleClientID
		m.GoogleApp, m.AppleApp = len(c.GoogleAppIDs) > 0, len(c.AppleAppIDs) > 0
	}
	writeJSON(w, http.StatusOK, m)
}

type codeRequest struct {
	Address string `json:"address"`
}

// SendCode is POST /api/auth/code: a 6-digit code to an email address or
// phone, good for ten minutes and five tries.
func (s *Server) SendCode(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var req codeRequest
	if !readJSON(w, r, &req) {
		return
	}
	kind, address, ok := normalizeAddress(req.Address)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_address")
		return
	}
	if s.signIn.Codes == nil || !containsString(s.signIn.CodeKinds, kind) {
		writeError(w, http.StatusServiceUnavailable, "sign_in_unavailable")
		return
	}
	now := s.clock()
	if ok, retry := s.codeAddrLimit.Allow(clientAddress(r, s.trustCF), now); !ok {
		rateLimited(w, retry)
		return
	}
	key := s.devices.loginKey(kind, address)
	if ok, retry := s.codeLoginLimit.Allow(key, now); !ok {
		rateLimited(w, retry)
		return
	}
	code := sixDigits()
	if err := s.social.PutCode(r.Context(), LoginCode{Key: key, CodeHash: s.devices.codeHash(key, code), Expires: now.Add(codeLife)}); err != nil {
		log.Printf("put code: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if err := s.signIn.Codes.Send(r.Context(), kind, address, code); err != nil {
		log.Printf("send code: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "sent", "kind": kind})
}

type verifyRequest struct {
	Address string `json:"address"`
	Code    string `json:"code"`
	VoterID string `json:"voterId,omitempty"` // the phone's device token, to bring its mirror along
	Device  string `json:"device,omitempty"`  // a label for the account screen
}

// VerifyCode is POST /api/auth/verify.
func (s *Server) VerifyCode(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var req verifyRequest
	if !readJSON(w, r, &req) {
		return
	}
	if ok, retry := s.signInLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	kind, address, ok := normalizeAddress(req.Address)
	code := strings.TrimSpace(req.Code)
	if !ok || len(code) != 6 || strings.Trim(code, "0123456789") != "" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	key := s.devices.loginKey(kind, address)
	good, err := s.social.CheckCode(r.Context(), key, s.devices.codeHash(key, code), s.clock())
	if err != nil {
		log.Printf("check code: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if !good {
		writeError(w, http.StatusUnauthorized, "wrong_code")
		return
	}
	s.signInWith(w, r, Login{Key: key, Kind: kind, Hint: hintFor(kind, address)}, req.VoterID, req.Device)
}

type oauthRequest struct {
	Provider string `json:"provider"` // google | apple
	IDToken  string `json:"idToken"`
	VoterID  string `json:"voterId,omitempty"`
	Device   string `json:"device,omitempty"`
}

// SignInWithID is POST /api/auth/id: Google or Apple.
func (s *Server) SignInWithID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var req oauthRequest
	if !readJSON(w, r, &req) {
		return
	}
	if req.Provider != "google" && req.Provider != "apple" || req.IDToken == "" || len(req.IDToken) > 8<<10 {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if s.signIn.IDs == nil || (req.Provider == "google" && len(s.signIn.googleAudiences()) == 0) || (req.Provider == "apple" && len(s.signIn.appleAudiences()) == 0) {
		writeError(w, http.StatusServiceUnavailable, "sign_in_unavailable")
		return
	}
	if ok, retry := s.signInLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	sub, email, err := s.signIn.IDs.Verify(r.Context(), req.Provider, req.IDToken)
	if err != nil || sub == "" {
		writeError(w, http.StatusUnauthorized, "invalid_id_token")
		return
	}
	s.signInWith(w, r, Login{Key: s.devices.loginKey(req.Provider, sub), Kind: req.Provider, Hint: hintFor(req.Provider, email)}, req.VoterID, req.Device)
}

// signInWith finishes a sign-in: it finds or makes the account (or, when the
// request already carries an account token, adds this way of signing in to
// it), opens a session, and moves the phone's mirror to the account's id.
func (s *Server) signInWith(w http.ResponseWriter, r *http.Request, l Login, voterID, label string) {
	ctx := r.Context()
	today := s.today()
	created := false
	acc, err := s.social.AccountByLogin(ctx, l.Key)
	if current, _, ok := s.accountFromHeader(r); ok {
		switch {
		case err == nil && acc.ID != current.ID:
			writeError(w, http.StatusConflict, "login_taken")
			return
		case errors.Is(err, ErrNoAccount):
			l.AccountID = current.ID
			if err := s.social.AddLogin(ctx, l); err != nil {
				log.Printf("add login: %v", err)
				writeError(w, http.StatusServiceUnavailable, "unavailable")
				return
			}
		case err != nil:
			log.Printf("account by login: %v", err)
			writeError(w, http.StatusServiceUnavailable, "unavailable")
			return
		}
		acc, err = current, nil
	}
	switch {
	case errors.Is(err, ErrNoAccount):
		acc = Account{ID: randomID(), CreatedOn: today, SeenOn: today, Suggest: true, Connect: true}
		if err := s.social.CreateAccount(ctx, acc, l); err != nil {
			if errors.Is(err, ErrLoginTaken) { // two first sign-ins at once: the other won
				acc, err = s.social.AccountByLogin(ctx, l.Key)
			}
			if err != nil {
				log.Printf("create account: %v", err)
				writeError(w, http.StatusServiceUnavailable, "unavailable")
				return
			}
		} else {
			created = true
		}
	case err != nil:
		log.Printf("account by login: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	sess := Session{ID: randomID(), AccountID: acc.ID, Label: clip(label, maxLabelRunes), SeenOn: today}
	if err := s.social.PutSession(ctx, sess); err != nil {
		log.Printf("put session: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	devID := s.devices.accountDeviceID(acc)
	merged := false
	if old, ok := s.devices.Verify(voterID); ok && old != devID {
		if err := s.social.MoveMirror(ctx, s.devices.mirrorKey(old), s.devices.mirrorKey(devID)); err != nil {
			log.Printf("move mirror: %v", err) // the answers stay where they were; signing in still works
		} else {
			merged = true
		}
	}
	writeJSON(w, http.StatusOK, SignedIn{Account: acc.view(), AccountToken: s.devices.sessionToken(sess.ID),
		DeviceToken: s.devices.tokenFor(devID), Created: created, Merged: merged})
}

// accountFromHeader reads "Authorization: Account <token>" and notes today
// on the session.
func (s *Server) accountFromHeader(r *http.Request) (Account, Session, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Account ")
	if !ok {
		return Account{}, Session{}, false
	}
	id, ok := s.devices.verifySession(token)
	if !ok {
		return Account{}, Session{}, false
	}
	sess, err := s.social.TouchSession(r.Context(), id, s.today())
	if err != nil {
		return Account{}, Session{}, false
	}
	acc, err := s.social.GetAccount(r.Context(), sess.AccountID)
	if err != nil {
		return Account{}, Session{}, false
	}
	return acc, sess, true
}

// signedIn is accountFromHeader for handlers: it writes the error itself.
func (s *Server) signedIn(w http.ResponseWriter, r *http.Request) (Account, Session, bool) {
	w.Header().Set("Cache-Control", "private, no-store")
	acc, sess, ok := s.accountFromHeader(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "signed_out")
		return Account{}, Session{}, false
	}
	if ok, retry := s.accountLimit.Allow(sess.ID, s.clock()); !ok {
		rateLimited(w, retry)
		return Account{}, Session{}, false
	}
	return acc, sess, true
}

func (s *Server) GetAccountDetails(w http.ResponseWriter, r *http.Request) {
	acc, sess, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	logins, err1 := s.social.Logins(r.Context(), acc.ID)
	sessions, err2 := s.social.Sessions(r.Context(), acc.ID)
	if err := errors.Join(err1, err2); err != nil {
		log.Printf("account: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := AccountDetails{Account: acc.view(), Logins: []LoginView{}, Sessions: []SessionView{}}
	for _, l := range logins {
		out.Logins = append(out.Logins, LoginView{Kind: l.Kind, Hint: l.Hint})
	}
	for _, x := range sessions {
		out.Sessions = append(out.Sessions, SessionView{ID: x.ID, Label: x.Label, SeenOn: x.SeenOn, Current: x.ID == sess.ID})
	}
	writeJSON(w, http.StatusOK, out)
}

type accountPatch struct {
	Name    *string `json:"name,omitempty"`
	Handle  *string `json:"handle,omitempty"`
	Suggest *bool   `json:"suggest,omitempty"`
	Connect *bool   `json:"connect,omitempty"`
}

func (s *Server) PatchAccount(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var p accountPatch
	if !readJSON(w, r, &p) {
		return
	}
	if p.Name != nil {
		name := strings.Join(strings.Fields(*p.Name), " ")
		if name == "" || utf8.RuneCountInString(name) > maxNameRunes || strings.ContainsAny(name, "<>@") {
			writeError(w, http.StatusBadRequest, "invalid_name")
			return
		}
		acc.Name = name
	}
	if p.Handle != nil {
		h := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(*p.Handle), "@"))
		if !handlePattern.MatchString(h) {
			writeError(w, http.StatusBadRequest, "invalid_handle")
			return
		}
		acc.Handle = h
	}
	if p.Suggest != nil {
		acc.Suggest = *p.Suggest
	}
	if p.Connect != nil {
		acc.Connect = *p.Connect
	}
	switch err := s.social.UpdateAccount(r.Context(), acc); {
	case errors.Is(err, ErrHandleTaken):
		writeError(w, http.StatusConflict, "handle_taken")
	case err != nil:
		log.Printf("update account: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusOK, acc.view())
	}
}

// DeleteAccount is DELETE /api/account: the account and everything social
// kept for it, and everything its device id kept (answers, steps, weekly
// notes, votes), in one call. Friends are not told; they just stop seeing it.
func (s *Server) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	devID := s.devices.accountDeviceID(acc)
	if _, err := s.mirror.ForgetDevice(r.Context(), s.devices.mirrorKey(devID), s.deviceVoteHashes(devID), s.today()); err != nil {
		log.Printf("delete account mirror: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if err := s.social.DeleteAccount(r.Context(), acc.ID); err != nil {
		log.Printf("delete account: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// FreshDevice is POST /api/account/fresh: after "Delete everything" a
// signed-in phone starts again under a new account device id.
func (s *Server) FreshDevice(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	acc.Epoch++
	if err := s.social.UpdateAccount(r.Context(), acc); err != nil {
		log.Printf("fresh device: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, DeviceIssued{Token: s.devices.tokenFor(s.devices.accountDeviceID(acc))})
}

// AccountDevice is GET /api/account/device: the account's current pass, for
// a signed-in phone whose pass was refused (another phone deleted
// everything) or that restored an older one from a backup.
func (s *Server) AccountDevice(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, DeviceIssued{Token: s.devices.tokenFor(s.devices.accountDeviceID(acc))})
}

// SignOut is DELETE /api/account/sessions/{id}: this phone, or another one
// from the account screen ("Sign out there").
func (s *Server) SignOut(w http.ResponseWriter, r *http.Request) {
	acc, sess, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if id == "current" {
		id = sess.ID
	}
	gone, err := s.social.DeleteSession(r.Context(), acc.ID, id)
	if err != nil {
		log.Printf("sign out: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if !gone {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type syncBody struct {
	Phrase string `json:"phrase"`
}

// phrasePattern is what easy sync keeps: since the October 2026 Reflect the main backup
// copy's two keys ("sk2.<vault key>.<seal key>"), never the 12 words, so the
// journal copy stays end-to-end; the 12 words are still taken from phones
// made before, which swap them for the keys on their next sign-in.
var phrasePattern = regexp.MustCompile(`^(?:[a-z]{3,8}( [a-z]{3,8}){11}|sk2\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43})$`)

// PutSync is PUT /api/account/sync: keep the backup phrase sealed with a
// server key so the account's other phones open the backup without typing
// it. The person turns it on knowing the server could then open the backup.
func (s *Server) PutSync(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b syncBody
	if !readJSON(w, r, &b) {
		return
	}
	if len(b.Phrase) > maxPhraseBytes || !phrasePattern.MatchString(b.Phrase) {
		writeError(w, http.StatusBadRequest, "invalid_phrase")
		return
	}
	acc.Sync = true
	err := errors.Join(s.social.PutSyncPhrase(r.Context(), acc.ID, s.devices.sealPhrase(acc.ID, b.Phrase)), s.social.UpdateAccount(r.Context(), acc))
	if err != nil {
		log.Printf("put sync: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) GetSync(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	sealed, err := s.social.SyncPhrase(r.Context(), acc.ID)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "no_sync")
		return
	}
	if err != nil {
		log.Printf("get sync: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	phrase, ok := s.devices.openPhrase(acc.ID, sealed)
	if !ok {
		writeError(w, http.StatusNotFound, "no_sync")
		return
	}
	writeJSON(w, http.StatusOK, syncBody{Phrase: phrase})
}

func (s *Server) DeleteSync(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	acc.Sync = false
	if err := errors.Join(s.social.DeleteSyncPhrase(r.Context(), acc.ID), s.social.UpdateAccount(r.Context(), acc)); err != nil {
		log.Printf("delete sync: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Helpers.

const maxSocialBodyBytes = 16 << 10

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSocialBodyBytes))
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return false
	}
	return true
}

func clip(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

func containsString(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func (s *Server) today() string { return s.clock().UTC().Format(dateLayout) }
