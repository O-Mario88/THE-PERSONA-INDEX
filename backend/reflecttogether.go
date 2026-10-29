package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

// Reflect together (Edwin, 2026-10-29), the signature way to connect. One
// person sends a trusted friend a question from a short, fixed list. Both
// answer privately first; each then chooses whether to reveal. An answer is
// shown to the other only once both chose to reveal, which keeps the first
// answer honest. The app then offers one way in, for answers that overlap or
// that differ; different answers are as welcome as matching ones, and there
// is never a score or a verdict about the relationship. Either person can
// leave, which removes it for both. Kept 30 days.

const (
	reflectTogetherDays = 30
	maxOpenReflections  = 20
)

// RTQuestion is one question to reflect on together, with the way in shown
// when the answers are the same (Same) and when they differ (Differ).
type RTQuestion struct {
	ID      string   `json:"id"`
	Prompt  string   `json:"prompt"`
	Options []Option `json:"options"`
	Same    string   `json:"same"`
	Differ  string   `json:"differ"`
}

var RTQuestions = []RTQuestion{
	{ID: "support", Prompt: "When you’re overwhelmed, what feels most supportive?", Options: []Option{
		{ID: "quiet", Label: "Quiet company"}, {ID: "practical", Label: "Practical help"}, {ID: "talk", Label: "Talking it through"}, {ID: "alone", Label: "Some time alone"},
	}, Same: "What does that kind of support look like for each of you?", Differ: "How could you let each other know which kind of support you need?"},
	{ID: "close", Prompt: "What helps you feel close to someone?", Options: []Option{
		{ID: "time", Label: "Time together"}, {ID: "heard", Label: "Being listened to"}, {ID: "doing", Label: "Doing things for each other"}, {ID: "honest", Label: "Honest talk"},
	}, Same: "When did you last feel close in that way?", Differ: "What is one small way you could each offer what the other needs?"},
	{ID: "hardday", Prompt: "After a hard day, what do you need first?", Options: []Option{
		{ID: "space", Label: "A little space"}, {ID: "talk", Label: "To talk about it"}, {ID: "ordinary", Label: "Something ordinary"}, {ID: "reassure", Label: "Some reassurance"},
	}, Same: "How do you each know when the other has had a hard day?", Differ: "What could you say to each other at the door to ask what is needed?"},
	{ID: "appreciated", Prompt: "What makes you feel appreciated?", Options: []Option{
		{ID: "words", Label: "Words"}, {ID: "time", Label: "Time"}, {ID: "help", Label: "Help with something"}, {ID: "remembered", Label: "Being remembered"},
	}, Same: "What is something the other did recently that felt like that?", Differ: "What would it look like to show appreciation in the other’s way this week?"},
	{ID: "disagree", Prompt: "When you disagree with someone close, what helps most?", Options: []Option{
		{ID: "pause", Label: "A pause first"}, {ID: "now", Label: "Talking it through now"}, {ID: "understood", Label: "Feeling my side is understood"}, {ID: "small", Label: "Finding something small to agree on"},
	}, Same: "What has helped the two of you come back together before?", Differ: "How could you each ask for what helps, next time it happens?"},
	{ID: "news", Prompt: "How do you prefer to hear difficult news?", Options: []Option{
		{ID: "straight", Label: "Straight away"}, {ID: "time", Label: "When we have time"}, {ID: "writing", Label: "In writing first"}, {ID: "gently", Label: "Gently, a bit at a time"},
	}, Same: "Is there anything you would like to tell each other in that way?", Differ: "How could you each make it easier for the other to hear hard things?"},
}

// Reveal states: not chosen yet, shown, or kept private.
const (
	revealShown = "shown"
	revealKept  = "kept"
)

// ErrNoReflection: no such reflection for this person.
var ErrNoReflection = errors.New("no such reflection")

// ReflectTogether is one, as kept.
type ReflectTogether struct {
	ID            string
	Asker         string
	Invitee       string
	QuestionID    string
	AskerOption   string
	InviteeOption string // "" until answered
	AskerReveal   string // "", shown or kept
	InviteeReveal string
	Created       time.Time
}

// ReflectTogetherStore keeps them.
type ReflectTogetherStore interface {
	PutReflectTogether(ctx context.Context, r ReflectTogether) error
	GetReflectTogether(ctx context.Context, id string) (ReflectTogether, error)
	ReflectTogetherOf(ctx context.Context, accountID string, since time.Time) ([]ReflectTogether, error)
	DeleteReflectTogether(ctx context.Context, id string) error
}

// RTItem is one reflection as either person sees it. Theirs is set only once
// both chose to reveal.
type RTItem struct {
	ID           string     `json:"id"`
	With         FriendView `json:"with"`
	QuestionID   string     `json:"questionId"`
	Asked        bool       `json:"asked"` // this person sent it
	Mine         string     `json:"mine"`  // "" until answered
	IRevealed    bool       `json:"iRevealed"`
	IKept        bool       `json:"iKept"`
	TheyAnswered bool       `json:"theyAnswered"`
	TheyKept     bool       `json:"theyKept"`
	Theirs       string     `json:"theirs"`
	Date         string     `json:"date"`
}

// ReflectTogetherView is GET /api/reflect-together.
type ReflectTogetherView struct {
	Questions []RTQuestion `json:"questions"`
	Items     []RTItem     `json:"items"`
}

func rtQuestion(id string) (RTQuestion, bool) {
	i := slices.IndexFunc(RTQuestions, func(q RTQuestion) bool { return q.ID == id })
	if i < 0 {
		return RTQuestion{}, false
	}
	return RTQuestions[i], true
}

func rtHasOption(q RTQuestion, id string) bool {
	return slices.ContainsFunc(q.Options, func(o Option) bool { return o.ID == id })
}

func (s *Server) GetReflectTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	friends, err1 := s.social.Friends(ctx, acc.ID)
	list, err2 := s.reflectTogether.ReflectTogetherOf(ctx, acc.ID, s.clock().UTC().AddDate(0, 0, -reflectTogetherDays))
	if err := errors.Join(err1, err2); err != nil {
		log.Printf("reflect together: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := ReflectTogetherView{Questions: RTQuestions, Items: []RTItem{}}
	for _, rt := range list {
		asked := rt.Asker == acc.ID
		other, mine, theirs, myReveal, theirReveal := rt.Invitee, rt.AskerOption, rt.InviteeOption, rt.AskerReveal, rt.InviteeReveal
		if !asked {
			other, mine, theirs, myReveal, theirReveal = rt.Asker, rt.InviteeOption, rt.AskerOption, rt.InviteeReveal, rt.AskerReveal
		}
		f, visible := visibleFrom(acc, friends, other)
		if !visible {
			continue
		}
		item := RTItem{ID: rt.ID, With: friendView(f, s.today()), QuestionID: rt.QuestionID, Asked: asked, Mine: mine, IRevealed: myReveal == revealShown, IKept: myReveal == revealKept,
			TheyAnswered: theirs != "", TheyKept: theirReveal == revealKept, Date: rt.Created.Format(dateLayout)}
		if myReveal == revealShown && theirReveal == revealShown {
			item.Theirs = theirs
		}
		out.Items = append(out.Items, item)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) AskReflectTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		FriendID   string `json:"friendId"`
		QuestionID string `json:"questionId"`
		OptionID   string `json:"optionId"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	q, known := rtQuestion(b.QuestionID)
	if !known || !rtHasOption(q, b.OptionID) {
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
	open, err := s.reflectTogether.ReflectTogetherOf(ctx, acc.ID, s.clock().UTC().AddDate(0, 0, -reflectTogetherDays))
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if len(open) >= maxOpenReflections {
		writeError(w, http.StatusConflict, "too_many")
		return
	}
	rt := ReflectTogether{ID: randomID(), Asker: acc.ID, Invitee: b.FriendID, QuestionID: q.ID, AskerOption: b.OptionID, Created: s.clock().UTC()}
	if err := s.reflectTogether.PutReflectTogether(ctx, rt); err != nil {
		log.Printf("reflect together: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	s.tell(ctx, acc, b.FriendID, "rt_ask")
	writeJSON(w, http.StatusCreated, map[string]string{"id": rt.ID})
}

// mineToChange finds a reflection this person is in, or answers 404.
func (s *Server) mineToChange(w http.ResponseWriter, r *http.Request, acc Account) (ReflectTogether, bool) {
	rt, err := s.reflectTogether.GetReflectTogether(r.Context(), r.PathValue("id"))
	if errors.Is(err, ErrNoReflection) || (err == nil && rt.Asker != acc.ID && rt.Invitee != acc.ID) {
		writeError(w, http.StatusNotFound, "not_found")
		return ReflectTogether{}, false
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return ReflectTogether{}, false
	}
	return rt, true
}

func (s *Server) AnswerReflectTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		OptionID string `json:"optionId"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	rt, ok := s.mineToChange(w, r, acc)
	if !ok {
		return
	}
	q, _ := rtQuestion(rt.QuestionID)
	switch {
	case rt.Invitee != acc.ID:
		writeError(w, http.StatusNotFound, "not_found")
	case rt.InviteeOption != "":
		writeError(w, http.StatusConflict, "already_answered")
	case !rtHasOption(q, b.OptionID):
		writeError(w, http.StatusBadRequest, "invalid_request")
	default:
		rt.InviteeOption = b.OptionID
		s.saveReflectTogether(w, r, rt)
	}
}

func (s *Server) RevealReflectTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		Reveal bool `json:"reveal"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	rt, ok := s.mineToChange(w, r, acc)
	if !ok {
		return
	}
	choice := revealKept
	if b.Reveal {
		choice = revealShown
	}
	if rt.Asker == acc.ID {
		rt.AskerReveal = choice
	} else {
		if rt.InviteeOption == "" {
			writeError(w, http.StatusConflict, "not_answered")
			return
		}
		rt.InviteeReveal = choice
	}
	other := rt.Invitee
	if rt.Invitee == acc.ID {
		other = rt.Asker
	}
	if s.saveReflectTogether(w, r, rt) && b.Reveal {
		s.tell(r.Context(), acc, other, "rt_reveal")
	}
}

func (s *Server) saveReflectTogether(w http.ResponseWriter, r *http.Request, rt ReflectTogether) bool {
	if err := s.reflectTogether.PutReflectTogether(r.Context(), rt); err != nil {
		log.Printf("reflect together: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return false
	}
	w.WriteHeader(http.StatusNoContent)
	return true
}

func (s *Server) LeaveReflectTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	rt, ok := s.mineToChange(w, r, acc)
	if !ok {
		return
	}
	if err := s.reflectTogether.DeleteReflectTogether(r.Context(), rt.ID); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// The in-memory store.

func (m *memoryStore) PutReflectTogether(_ context.Context, r ReflectTogether) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.reflectTogether[r.ID] = r
	return nil
}

func (m *memoryStore) GetReflectTogether(_ context.Context, id string) (ReflectTogether, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.reflectTogether[id]
	if !ok {
		return ReflectTogether{}, ErrNoReflection
	}
	return r, nil
}

func (m *memoryStore) ReflectTogetherOf(_ context.Context, accountID string, since time.Time) ([]ReflectTogether, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ReflectTogether
	for _, r := range m.reflectTogether {
		if (r.Asker == accountID || r.Invitee == accountID) && !r.Created.Before(since) {
			out = append(out, r)
		}
	}
	slices.SortFunc(out, func(a, b ReflectTogether) int { return b.Created.Compare(a.Created) })
	return out, nil
}

func (m *memoryStore) DeleteReflectTogether(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.reflectTogether, id)
	return nil
}

// forgetReflectTogether drops an account's reflections. The caller holds the lock.
func (m *memoryStore) forgetReflectTogether(accountID string) {
	for id, r := range m.reflectTogether {
		if r.Asker == accountID || r.Invitee == accountID {
			delete(m.reflectTogether, id)
		}
	}
}

// The Postgres store (migration 015).

const rtColumns = `id, asker, invitee, question_id, asker_option, invitee_option, asker_reveal, invitee_reveal, created_at`

func scanRT(row pgx.Row) (ReflectTogether, error) {
	var r ReflectTogether
	err := row.Scan(&r.ID, &r.Asker, &r.Invitee, &r.QuestionID, &r.AskerOption, &r.InviteeOption, &r.AskerReveal, &r.InviteeReveal, &r.Created)
	r.Created = r.Created.UTC()
	return r, err
}

func (p *pgStore) PutReflectTogether(ctx context.Context, r ReflectTogether) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO reflect_together (`+rtColumns+`) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (id) DO UPDATE SET invitee_option = EXCLUDED.invitee_option, asker_reveal = EXCLUDED.asker_reveal, invitee_reveal = EXCLUDED.invitee_reveal`,
		r.ID, r.Asker, r.Invitee, r.QuestionID, r.AskerOption, r.InviteeOption, r.AskerReveal, r.InviteeReveal, r.Created)
	if err != nil {
		return fmt.Errorf("put reflect together: %w", err)
	}
	return nil
}

func (p *pgStore) GetReflectTogether(ctx context.Context, id string) (ReflectTogether, error) {
	r, err := scanRT(p.pool.QueryRow(ctx, `SELECT `+rtColumns+` FROM reflect_together WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return ReflectTogether{}, ErrNoReflection
	}
	if err != nil {
		return ReflectTogether{}, fmt.Errorf("get reflect together: %w", err)
	}
	return r, nil
}

func (p *pgStore) ReflectTogetherOf(ctx context.Context, accountID string, since time.Time) ([]ReflectTogether, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+rtColumns+` FROM reflect_together WHERE (asker = $1 OR invitee = $1) AND created_at >= $2 ORDER BY created_at DESC, id`, accountID, since)
	if err != nil {
		return nil, fmt.Errorf("reflect together: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ReflectTogether, error) { return scanRT(row) })
}

func (p *pgStore) DeleteReflectTogether(ctx context.Context, id string) error {
	if _, err := p.pool.Exec(ctx, `DELETE FROM reflect_together WHERE id = $1`, id); err != nil {
		return fmt.Errorf("delete reflect together: %w", err)
	}
	return nil
}
