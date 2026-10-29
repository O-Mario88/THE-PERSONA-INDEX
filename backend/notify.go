package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Telling a person when someone they trust reaches out (Edwin, 2026-10-29:
// "tackle that now"). When someone shares with them, replies, asks for or
// writes a note, or asks to reflect together, the phones they turned this on
// get a short notice that names the person and what happened, and nothing
// they wrote: "Ama shared something with you." Tapping it opens Connect.
//
//   - A phone turns it on by sending its push address (PUT /api/push) and off
//     by taking it back (DELETE /api/push). One address belongs to one person:
//     whoever signs in on that phone last. Deleting the account deletes them.
//   - Nothing is sent about someone the person muted.
//   - One notice per person, per kind of thing, per ten minutes, so a burst of
//     replies is one tap on the shoulder, not a stream.
//   - Notices go out through the Expo push service (PUSH_SERVICE=expo, with
//     EXPO_ACCESS_TOKEN when the project requires it). A local run logs them.

const (
	pushesPerPairWindow = 1
	pushPairWindow      = 10 * time.Minute
	pushTitle           = "The Persona Index"
	maxPushTokensEach   = 10 // phones one person can have it on
)

// The notice for each thing someone can do, with the name as they know them.
var pushLines = map[string]string{
	"share":        "%s shared something with you.",
	"reply":        "%s replied to you.",
	"note_ask":     "%s asked you for a note.",
	"note_written": "%s wrote you a note.",
	"rt_ask":       "%s asked you to reflect together.",
	"rt_reveal":    "%s is ready to reflect together.",
}

func pushLine(kind, name string) string { return fmt.Sprintf(pushLines[kind], name) }

var pushTokenPattern = regexp.MustCompile(`^Expo(nent)?PushToken\[[A-Za-z0-9_\-:.]{1,200}\]$`)

// PushToken is one phone's push address, held for one person.
type PushToken struct {
	Token     string
	AccountID string
	Platform  string // ios | android
	Updated   time.Time
}

// PushStore keeps the push addresses.
type PushStore interface {
	// PutPushToken stores the address for its account, taking it from anyone
	// who held it before.
	PutPushToken(ctx context.Context, t PushToken) error
	DeletePushToken(ctx context.Context, accountID, token string) error
	PushTokens(ctx context.Context, accountID string) ([]PushToken, error)
	// DropPushTokens forgets addresses the push service no longer knows.
	DropPushTokens(ctx context.Context, tokens []string) error
}

// PushMessage is one notice to one phone.
type PushMessage struct {
	To    string
	Title string
	Body  string
	Data  map[string]string
}

// Pusher hands notices to a push service and reports the addresses it no
// longer knows.
type Pusher interface {
	Push(ctx context.Context, msgs []PushMessage) (gone []string, err error)
}

type pushBody struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

func (s *Server) PutPush(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b pushBody
	if !readJSON(w, r, &b) {
		return
	}
	if !pushTokenPattern.MatchString(b.Token) || (b.Platform != "ios" && b.Platform != "android") {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	ctx := r.Context()
	have, err := s.push.PushTokens(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if len(have) >= maxPushTokensEach && !hasToken(have, b.Token) {
		writeError(w, http.StatusConflict, "too_many")
		return
	}
	if err := s.push.PutPushToken(ctx, PushToken{Token: b.Token, AccountID: acc.ID, Platform: b.Platform, Updated: s.clock().UTC()}); err != nil {
		log.Printf("push token: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) DeletePush(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b pushBody
	if !readJSON(w, r, &b) {
		return
	}
	if err := s.push.DeletePushToken(r.Context(), acc.ID, b.Token); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func hasToken(list []PushToken, token string) bool {
	for _, t := range list {
		if t.Token == token {
			return true
		}
	}
	return false
}

// tell sends a notice to `to` about something `from` did, when `to` has it on,
// hasn't muted `from`, and hasn't just been told the same. It never blocks the
// request: the notice goes out in the background.
func (s *Server) tell(ctx context.Context, from Account, to, kind string) {
	if s.pusher == nil || to == "" || to == from.ID || pushLines[kind] == "" {
		return
	}
	tokens, err := s.push.PushTokens(ctx, to)
	if err != nil || len(tokens) == 0 {
		return
	}
	friends, err := s.social.Friends(ctx, to)
	if err != nil {
		return
	}
	name := ""
	for _, f := range friends {
		if f.AccountID == from.ID {
			if f.Muted {
				return
			}
			name = f.Name
		}
	}
	if name == "" {
		return // not their friend any more
	}
	if ok, _ := s.pushLimit.Allow(to+"\x00"+from.ID+"\x00"+kind, s.clock()); !ok {
		return
	}
	msgs := make([]PushMessage, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, PushMessage{To: t.Token, Title: pushTitle, Body: pushLine(kind, name), Data: map[string]string{"open": "connect"}})
	}
	s.pushes.Add(1)
	go func() {
		defer s.pushes.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		gone, err := s.pusher.Push(ctx, msgs)
		if err != nil {
			log.Printf("push: %v", err)
		}
		if len(gone) > 0 {
			if err := s.push.DropPushTokens(ctx, gone); err != nil {
				log.Printf("push: drop: %v", err)
			}
		}
	}()
}

// pusherFromEnv picks how notices go out: the Expo push service when
// PUSH_SERVICE=expo, the log on a local run, otherwise nowhere.
func pusherFromEnv(getenv func(string) string, local bool) Pusher {
	if strings.TrimSpace(getenv("PUSH_SERVICE")) == "expo" {
		return expoPusher{url: expoPushURL, token: strings.TrimSpace(getenv("EXPO_ACCESS_TOKEN")), client: &http.Client{Timeout: 10 * time.Second}}
	}
	if local {
		return logPusher{}
	}
	return nil
}

type logPusher struct{}

func (logPusher) Push(_ context.Context, msgs []PushMessage) ([]string, error) {
	for _, m := range msgs {
		log.Printf("push (local run, not sent): %s", m.Body)
	}
	return nil, nil
}

const expoPushURL = "https://exp.host/--/api/v2/push/send"

type expoPusher struct {
	url    string
	token  string
	client *http.Client
}

type expoMessage struct {
	To       string            `json:"to"`
	Title    string            `json:"title"`
	Body     string            `json:"body"`
	Data     map[string]string `json:"data"`
	Priority string            `json:"priority"`
	Channel  string            `json:"channelId"` // Android's "People you trust" channel (mobile/src/platform/push.ts)
}

type expoReply struct {
	Data []struct {
		Status  string `json:"status"`
		Details struct {
			Error string `json:"error"`
		} `json:"details"`
	} `json:"data"`
}

func (e expoPusher) Push(ctx context.Context, msgs []PushMessage) ([]string, error) {
	out := make([]expoMessage, len(msgs))
	for i, m := range msgs {
		out[i] = expoMessage{To: m.To, Title: m.Title, Body: m.Body, Data: m.Data, Priority: "normal", Channel: "people"}
	}
	body, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if e.token != "" {
		req.Header.Set("Authorization", "Bearer "+e.token)
	}
	res, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("expo push: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("expo push: status %d", res.StatusCode)
	}
	var reply expoReply
	if err := json.NewDecoder(res.Body).Decode(&reply); err != nil {
		return nil, fmt.Errorf("expo push: %w", err)
	}
	var gone []string
	for i, d := range reply.Data {
		if i < len(msgs) && d.Status == "error" && d.Details.Error == "DeviceNotRegistered" {
			gone = append(gone, msgs[i].To)
		}
	}
	return gone, nil
}

// The in-memory store.

func (m *memoryStore) PutPushToken(_ context.Context, t PushToken) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pushTokens[t.Token] = t
	return nil
}

func (m *memoryStore) DeletePushToken(_ context.Context, accountID, token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t, ok := m.pushTokens[token]; ok && t.AccountID == accountID {
		delete(m.pushTokens, token)
	}
	return nil
}

func (m *memoryStore) PushTokens(_ context.Context, accountID string) ([]PushToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []PushToken
	for _, t := range m.pushTokens {
		if t.AccountID == accountID {
			out = append(out, t)
		}
	}
	return out, nil
}

func (m *memoryStore) DropPushTokens(_ context.Context, tokens []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, t := range tokens {
		delete(m.pushTokens, t)
	}
	return nil
}

// forgetPushTokens runs inside DeleteAccount, which holds the lock.
func (m *memoryStore) forgetPushTokens(accountID string) {
	for k, t := range m.pushTokens {
		if t.AccountID == accountID {
			delete(m.pushTokens, k)
		}
	}
}

// The Postgres store (migration 018).

func (p *pgStore) PutPushToken(ctx context.Context, t PushToken) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO push_tokens (token, account_id, platform, updated_at) VALUES ($1, $2, $3, $4)
		ON CONFLICT (token) DO UPDATE SET account_id = EXCLUDED.account_id, platform = EXCLUDED.platform, updated_at = EXCLUDED.updated_at`,
		t.Token, t.AccountID, t.Platform, t.Updated)
	if err != nil {
		return fmt.Errorf("put push token: %w", err)
	}
	return nil
}

func (p *pgStore) DeletePushToken(ctx context.Context, accountID, token string) error {
	if _, err := p.pool.Exec(ctx, `DELETE FROM push_tokens WHERE token = $1 AND account_id = $2`, token, accountID); err != nil {
		return fmt.Errorf("delete push token: %w", err)
	}
	return nil
}

func (p *pgStore) PushTokens(ctx context.Context, accountID string) ([]PushToken, error) {
	rows, err := p.pool.Query(ctx, `SELECT token, account_id, platform, updated_at FROM push_tokens WHERE account_id = $1`, accountID)
	if err != nil {
		return nil, fmt.Errorf("push tokens: %w", err)
	}
	defer rows.Close()
	var out []PushToken
	for rows.Next() {
		var t PushToken
		if err := rows.Scan(&t.Token, &t.AccountID, &t.Platform, &t.Updated); err != nil {
			return nil, fmt.Errorf("push tokens: %w", err)
		}
		t.Updated = t.Updated.UTC()
		out = append(out, t)
	}
	return out, rows.Err()
}

func (p *pgStore) DropPushTokens(ctx context.Context, tokens []string) error {
	if len(tokens) == 0 {
		return nil
	}
	if _, err := p.pool.Exec(ctx, `DELETE FROM push_tokens WHERE token = ANY($1)`, tokens); err != nil {
		return fmt.Errorf("drop push tokens: %w", err)
	}
	return nil
}
