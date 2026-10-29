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

// Private replies to a shared item (Edwin, 2026-10-29). Each person an item
// went to has one thread with its author, and only those two ever see it: no
// audience, no reaction totals, no ranking, nobody watching. A reply is one
// of a few gentle openings or a short message in the person's own words.
// The author can turn replies off, and can remove one person quietly, which
// ends that person's access to the item and deletes their thread. Nobody is
// told; already-read words cannot be taken back, and the app says so.

// The openings a reply can be, besides the person's own words.
var noteKinds = []string{"resonated", "talk", "similar", "encourage", "celebrate", "words"}

const (
	noteTextMax       = 300
	maxNotesPerThread = 50
)

// ErrNoShare: no such item, or not one this person may reply to.
var ErrNoShare = errors.New("no such share")

// ShareNote is one reply, kept with its item and its thread: With is the
// person the item went to, From who wrote this reply (them or the author).
type ShareNote struct {
	ID      string
	ShareID string
	With    string
	From    string
	Kind    string
	Text    string
	Created time.Time
}

// NoteView is a reply as either person in the thread sees it.
type NoteView struct {
	ID   string `json:"id"`
	From string `json:"from"` // the writer's name
	Mine bool   `json:"mine"`
	Kind string `json:"kind"`
	Text string `json:"text,omitempty"`
	Date string `json:"date"`
}

// SharedPerson is one person an item went to, as its author sees them.
type SharedPerson struct {
	ID    string     `json:"id"`
	Name  string     `json:"name"`
	Notes []NoteView `json:"notes"`
}

type noteBody struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
	With string `json:"with"` // the author names whose thread they answer in
}

// notesFor gathers the replies to every item a person sent or received.
func (s *Server) notesFor(ctx context.Context, lists ...[]Share) (map[string][]ShareNote, error) {
	out := map[string][]ShareNote{}
	for _, list := range lists {
		for _, sh := range list {
			if _, done := out[sh.ID]; done {
				continue
			}
			notes, err := s.social.ShareNotes(ctx, sh.ID)
			if err != nil {
				return nil, err
			}
			out[sh.ID] = notes
		}
	}
	return out, nil
}

// names maps account ids to the names this person knows them by.
func names(acc Account, friends []Friend) map[string]string {
	out := map[string]string{acc.ID: acc.Name}
	for _, f := range friends {
		out[f.AccountID] = f.Name
	}
	return out
}

// threadView is one thread, oldest first, as viewer sees it.
func threadView(notes []ShareNote, with, viewer string, known map[string]string) []NoteView {
	out := []NoteView{}
	for _, n := range notes {
		if n.With != with {
			continue
		}
		out = append(out, NoteView{ID: n.ID, From: known[n.From], Mine: n.From == viewer, Kind: n.Kind, Text: n.Text, Date: n.Created.Format(dateLayout)})
	}
	return out
}

func (s *Server) PostShareNote(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b noteBody
	if !readJSON(w, r, &b) {
		return
	}
	text := strings.Join(strings.Fields(b.Text), " ")
	switch {
	case !slices.Contains(noteKinds, b.Kind),
		b.Kind == "words" && text == "",
		utf8.RuneCountInString(text) > noteTextMax,
		linkPattern.MatchString(text):
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	ctx := r.Context()
	sh, err := s.social.ShareByID(ctx, r.PathValue("id"))
	if errors.Is(err, ErrNoShare) {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	friends, ferr := s.social.Friends(ctx, acc.ID)
	if err := errors.Join(err, ferr); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	with := acc.ID
	if sh.From == acc.ID {
		// The author answers in one person's thread.
		if !slices.Contains(sh.To, b.With) || !slices.ContainsFunc(friends, func(f Friend) bool { return f.AccountID == b.With }) {
			writeError(w, http.StatusNotFound, "not_found")
			return
		}
		with = b.With
	} else {
		if _, visible := visibleFrom(acc, friends, sh.From); !visible || !slices.Contains(sh.To, acc.ID) {
			writeError(w, http.StatusNotFound, "not_found")
			return
		}
		if !sh.Replies {
			writeError(w, http.StatusForbidden, "replies_off")
			return
		}
	}
	notes, err := s.social.ShareNotes(ctx, sh.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if len(threadView(notes, with, acc.ID, nil)) >= maxNotesPerThread {
		writeError(w, http.StatusConflict, "thread_full")
		return
	}
	n := ShareNote{ID: randomID(), ShareID: sh.ID, With: with, From: acc.ID, Kind: b.Kind, Text: text, Created: s.clock().UTC()}
	if err := s.social.PutShareNote(ctx, n); err != nil {
		log.Printf("share note: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": n.ID})
}

func (s *Server) RemoveSharePerson(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	switch found, err := s.social.RemoveShareRecipient(r.Context(), acc.ID, r.PathValue("id"), r.PathValue("friendId")); {
	case err != nil:
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	case !found:
		writeError(w, http.StatusNotFound, "not_found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// The in-memory store.

func (m *memoryStore) ShareByID(_ context.Context, id string) (Share, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sh, ok := m.closer.shares[id]
	if !ok {
		return Share{}, ErrNoShare
	}
	sh.To = slices.Clone(sh.To)
	return sh, nil
}

func (m *memoryStore) PutShareNote(_ context.Context, n ShareNote) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.closer.shares[n.ShareID]; !ok {
		return ErrNoShare
	}
	m.closer.notes[n.ShareID] = append(m.closer.notes[n.ShareID], n)
	return nil
}

func (m *memoryStore) ShareNotes(_ context.Context, shareID string) ([]ShareNote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return slices.Clone(m.closer.notes[shareID]), nil
}

func (m *memoryStore) RemoveShareRecipient(_ context.Context, from, id, friend string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sh, ok := m.closer.shares[id]
	if !ok || sh.From != from || !slices.Contains(sh.To, friend) {
		return false, nil
	}
	sh.To = slices.DeleteFunc(slices.Clone(sh.To), func(x string) bool { return x == friend })
	m.closer.notes[id] = slices.DeleteFunc(m.closer.notes[id], func(n ShareNote) bool { return n.With == friend })
	if len(sh.To) == 0 {
		delete(m.closer.shares, id)
		delete(m.closer.notes, id)
	} else {
		m.closer.shares[id] = sh
	}
	return true, nil
}

// The Postgres store (migration 014).

func (p *pgStore) ShareByID(ctx context.Context, id string) (Share, error) {
	list, err := scanShares(p.pool.Query(ctx, `SELECT `+shareColumns+` FROM shares s WHERE s.id = $1`, id))
	if err != nil {
		return Share{}, fmt.Errorf("share: %w", err)
	}
	if len(list) == 0 {
		return Share{}, ErrNoShare
	}
	return list[0], nil
}

func (p *pgStore) PutShareNote(ctx context.Context, n ShareNote) error {
	t, err := p.pool.Exec(ctx, `INSERT INTO share_notes (id, share_id, with_account, sender, kind, body, created_at)
		SELECT $1, $2, $3, $4, $5, $6, $7 WHERE EXISTS (SELECT 1 FROM shares WHERE id = $2)`,
		n.ID, n.ShareID, n.With, n.From, n.Kind, n.Text, n.Created)
	if err != nil {
		return fmt.Errorf("put share note: %w", err)
	}
	if t.RowsAffected() == 0 {
		return ErrNoShare
	}
	return nil
}

func (p *pgStore) ShareNotes(ctx context.Context, shareID string) ([]ShareNote, error) {
	rows, err := p.pool.Query(ctx, `SELECT id, share_id, with_account, sender, kind, body, created_at FROM share_notes
		WHERE share_id = $1 ORDER BY created_at, id`, shareID)
	if err != nil {
		return nil, fmt.Errorf("share notes: %w", err)
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (ShareNote, error) {
		var n ShareNote
		err := r.Scan(&n.ID, &n.ShareID, &n.With, &n.From, &n.Kind, &n.Text, &n.Created)
		n.Created = n.Created.UTC()
		return n, err
	})
}

func (p *pgStore) RemoveShareRecipient(ctx context.Context, from, id, friend string) (bool, error) {
	removed := false
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		t, err := tx.Exec(ctx, `DELETE FROM share_recipients r USING shares s
			WHERE r.share_id = s.id AND s.id = $1 AND s.sender = $2 AND r.recipient = $3`, id, from, friend)
		if err != nil {
			return err
		}
		if removed = t.RowsAffected() > 0; !removed {
			return nil
		}
		if _, err := tx.Exec(ctx, `DELETE FROM share_notes WHERE share_id = $1 AND with_account = $2`, id, friend); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM shares s WHERE s.id = $1 AND NOT EXISTS (SELECT 1 FROM share_recipients r WHERE r.share_id = s.id)`, id)
		return err
	})
	if err != nil {
		return false, fmt.Errorf("remove share recipient: %w", err)
	}
	return removed, nil
}
