package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// The Outside Mirror as named notes (Edwin, 2026-10-29). Human Pulse says
// "other people recognise this experience"; the Outside Mirror says "here is
// something a trusted person noticed or appreciated about you". It is an
// occasional invitation: a person asks one friend a concrete prompt, the
// friend writes a short note with their name on it (anonymous notes in a
// tiny circle invite guessing and make hurtful words harder to address), or
// quietly declines. The person can keep the note, dismiss it, or reflect on
// it. It never becomes a verdict about who they are. One open invitation per
// friend at a time; an unanswered one lapses after 30 days.

const (
	outsideNoteMax  = 300
	outsideAskDays  = 30
	maxOpenOutsides = 6
)

type OutsidePrompt struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

var OutsidePrompts = []OutsidePrompt{
	{ID: "ease", Text: "When have you seen me seem most at ease?"},
	{ID: "appreciate", Text: "What is something I do that you appreciate?"},
	{ID: "understood", Text: "What helped us understand each other recently?"},
}

// Note states.
const (
	outsideAsked   = "asked"
	outsideWritten = "written"
	outsideKept    = "kept"
)

var ErrNoOutside = errors.New("no such note")

// OutsideNote is one invitation and, once written, its note.
type OutsideNote struct {
	ID       string
	Asker    string // the person the note is about
	Friend   string // the person invited to write it
	PromptID string
	Text     string
	Status   string
	Created  time.Time
}

type OutsideNoteStore interface {
	PutOutsideNote(ctx context.Context, n OutsideNote) error
	GetOutsideNote(ctx context.Context, id string) (OutsideNote, error)
	OutsideNotesOf(ctx context.Context, accountID string) ([]OutsideNote, error) // asked by or of this person
	DeleteOutsideNote(ctx context.Context, id string) error
}

type OutsideAskView struct {
	ID       string     `json:"id"`
	With     FriendView `json:"with"`
	PromptID string     `json:"promptId"`
	Date     string     `json:"date"`
}

// OutsideInviteView is an invitation waiting for this person to write.
type OutsideInviteView struct {
	ID       string     `json:"id"`
	From     FriendView `json:"from"`
	PromptID string     `json:"promptId"`
	Date     string     `json:"date"`
}

type OutsideNoteView struct {
	ID       string     `json:"id"`
	From     FriendView `json:"from"`
	PromptID string     `json:"promptId"`
	Text     string     `json:"text"`
	Kept     bool       `json:"kept"`
	Date     string     `json:"date"`
}

// OutsideView is GET /api/outside: the prompts, the invitations this person
// sent and is waiting on, the invitations waiting for them to write, and the
// notes written about them.
type OutsideView struct {
	Prompts     []OutsidePrompt     `json:"prompts"`
	Asked       []OutsideAskView    `json:"asked"`
	Invitations []OutsideInviteView `json:"invitations"`
	Notes       []OutsideNoteView   `json:"notes"`
}

func outsidePrompt(id string) bool {
	return slices.ContainsFunc(OutsidePrompts, func(p OutsidePrompt) bool { return p.ID == id })
}

func (s *Server) GetOutside(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	friends, err1 := s.social.Friends(ctx, acc.ID)
	list, err2 := s.outsideNotes.OutsideNotesOf(ctx, acc.ID)
	if err := errors.Join(err1, err2); err != nil {
		log.Printf("outside: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	lapsed := s.clock().UTC().AddDate(0, 0, -outsideAskDays)
	out := OutsideView{Prompts: OutsidePrompts, Asked: []OutsideAskView{}, Invitations: []OutsideInviteView{}, Notes: []OutsideNoteView{}}
	for _, n := range list {
		mine := n.Asker == acc.ID
		other := n.Friend
		if !mine {
			other = n.Asker
		}
		f, visible := visibleFrom(acc, friends, other)
		if !visible {
			continue
		}
		fv, date := friendView(f, s.today()), n.Created.Format(dateLayout)
		switch {
		case n.Status == outsideAsked && n.Created.Before(lapsed):
		case mine && n.Status == outsideAsked:
			out.Asked = append(out.Asked, OutsideAskView{ID: n.ID, With: fv, PromptID: n.PromptID, Date: date})
		case mine:
			out.Notes = append(out.Notes, OutsideNoteView{ID: n.ID, From: fv, PromptID: n.PromptID, Text: n.Text, Kept: n.Status == outsideKept, Date: date})
		case n.Status == outsideAsked:
			out.Invitations = append(out.Invitations, OutsideInviteView{ID: n.ID, From: fv, PromptID: n.PromptID, Date: date})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) AskOutside(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		FriendID string `json:"friendId"`
		PromptID string `json:"promptId"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	if !outsidePrompt(b.PromptID) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	if !acc.Connect {
		writeError(w, http.StatusForbidden, "connect_off")
		return
	}
	ctx := r.Context()
	if friends, err := s.social.AreFriends(ctx, acc.ID, b.FriendID); err != nil || !friends {
		writeError(w, http.StatusNotFound, "not_friends")
		return
	}
	list, err := s.outsideNotes.OutsideNotesOf(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	lapsed := s.clock().UTC().AddDate(0, 0, -outsideAskDays)
	open := 0
	for _, n := range list {
		if n.Asker != acc.ID || n.Status != outsideAsked || n.Created.Before(lapsed) {
			continue
		}
		open++
		if n.Friend == b.FriendID {
			writeError(w, http.StatusConflict, "already_asked")
			return
		}
	}
	if open >= maxOpenOutsides {
		writeError(w, http.StatusConflict, "too_many")
		return
	}
	n := OutsideNote{ID: randomID(), Asker: acc.ID, Friend: b.FriendID, PromptID: b.PromptID, Status: outsideAsked, Created: s.clock().UTC()}
	if err := s.outsideNotes.PutOutsideNote(ctx, n); err != nil {
		log.Printf("outside: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": n.ID})
}

// outsideFor finds a note where this person plays the given part, or answers 404.
func (s *Server) outsideFor(w http.ResponseWriter, r *http.Request, accountID string, asker bool) (OutsideNote, bool) {
	n, err := s.outsideNotes.GetOutsideNote(r.Context(), r.PathValue("id"))
	if errors.Is(err, ErrNoOutside) || (err == nil && ((asker && n.Asker != accountID) || (!asker && n.Friend != accountID))) {
		writeError(w, http.StatusNotFound, "not_found")
		return OutsideNote{}, false
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return OutsideNote{}, false
	}
	return n, true
}

func (s *Server) WriteOutside(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		Text string `json:"text"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	text := strings.Join(strings.Fields(b.Text), " ")
	n, ok := s.outsideFor(w, r, acc.ID, false)
	if !ok {
		return
	}
	switch {
	case text == "" || utf8.RuneCountInString(text) > outsideNoteMax || linkPattern.MatchString(text):
		writeError(w, http.StatusBadRequest, "invalid_request")
	case n.Status != outsideAsked:
		writeError(w, http.StatusConflict, "already_written")
	default:
		n.Text, n.Status = text, outsideWritten
		s.putOutside(w, r, n)
	}
}

func (s *Server) DeclineOutside(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if n, ok := s.outsideFor(w, r, acc.ID, false); ok && n.Status == outsideAsked {
		s.deleteOutside(w, r, n.ID)
	} else if ok {
		writeError(w, http.StatusConflict, "already_written")
	}
}

// KeepOutside: the person keeps a note, or dismisses it, which deletes it.
func (s *Server) KeepOutside(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		Keep bool `json:"keep"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	n, ok := s.outsideFor(w, r, acc.ID, true)
	if !ok {
		return
	}
	switch {
	case !b.Keep:
		s.deleteOutside(w, r, n.ID)
	case n.Status == outsideAsked:
		writeError(w, http.StatusConflict, "not_written")
	default:
		n.Status = outsideKept
		s.putOutside(w, r, n)
	}
}

func (s *Server) putOutside(w http.ResponseWriter, r *http.Request, n OutsideNote) {
	if err := s.outsideNotes.PutOutsideNote(r.Context(), n); err != nil {
		log.Printf("outside: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deleteOutside(w http.ResponseWriter, r *http.Request, id string) {
	if err := s.outsideNotes.DeleteOutsideNote(r.Context(), id); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// The in-memory store.

func (m *memoryStore) PutOutsideNote(_ context.Context, n OutsideNote) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.outsideNotes[n.ID] = n
	return nil
}

func (m *memoryStore) GetOutsideNote(_ context.Context, id string) (OutsideNote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, ok := m.outsideNotes[id]
	if !ok {
		return OutsideNote{}, ErrNoOutside
	}
	return n, nil
}

func (m *memoryStore) OutsideNotesOf(_ context.Context, accountID string) ([]OutsideNote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []OutsideNote
	for _, n := range m.outsideNotes {
		if n.Asker == accountID || n.Friend == accountID {
			out = append(out, n)
		}
	}
	slices.SortFunc(out, func(a, b OutsideNote) int { return b.Created.Compare(a.Created) })
	return out, nil
}

func (m *memoryStore) DeleteOutsideNote(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.outsideNotes, id)
	return nil
}

// forgetOutsideNotes drops an account's notes. The caller holds the lock.
func (m *memoryStore) forgetOutsideNotes(accountID string) {
	for id, n := range m.outsideNotes {
		if n.Asker == accountID || n.Friend == accountID {
			delete(m.outsideNotes, id)
		}
	}
}

// The Postgres store (migration 016).

const outsideColumns = `id, asker, friend, prompt_id, body, status, created_at`

func scanOutside(row pgx.Row) (OutsideNote, error) {
	var n OutsideNote
	err := row.Scan(&n.ID, &n.Asker, &n.Friend, &n.PromptID, &n.Text, &n.Status, &n.Created)
	n.Created = n.Created.UTC()
	return n, err
}

func (p *pgStore) PutOutsideNote(ctx context.Context, n OutsideNote) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO outside_notes (`+outsideColumns+`) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, status = EXCLUDED.status`,
		n.ID, n.Asker, n.Friend, n.PromptID, n.Text, n.Status, n.Created)
	if err != nil {
		return fmt.Errorf("put outside note: %w", err)
	}
	return nil
}

func (p *pgStore) GetOutsideNote(ctx context.Context, id string) (OutsideNote, error) {
	n, err := scanOutside(p.pool.QueryRow(ctx, `SELECT `+outsideColumns+` FROM outside_notes WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return OutsideNote{}, ErrNoOutside
	}
	if err != nil {
		return OutsideNote{}, fmt.Errorf("get outside note: %w", err)
	}
	return n, nil
}

func (p *pgStore) OutsideNotesOf(ctx context.Context, accountID string) ([]OutsideNote, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+outsideColumns+` FROM outside_notes WHERE asker = $1 OR friend = $1 ORDER BY created_at DESC, id`, accountID)
	if err != nil {
		return nil, fmt.Errorf("outside notes: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (OutsideNote, error) { return scanOutside(row) })
}

func (p *pgStore) DeleteOutsideNote(ctx context.Context, id string) error {
	if _, err := p.pool.Exec(ctx, `DELETE FROM outside_notes WHERE id = $1`, id); err != nil {
		return fmt.Errorf("delete outside note: %w", err)
	}
	return nil
}
