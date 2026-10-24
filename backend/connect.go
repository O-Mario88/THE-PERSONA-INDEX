package main

import (
	"errors"
	"log"
	"net/http"
	"slices"
	"time"
)

// Small ways to reach a friend (Stage 5).
//
// Quiet nods: one of 24 fixed cards, one per friend a day, no free text and
// no reply. Answer Together: one of today's questions for two friends, each
// choice sealed until both are in, gone after 48 hours. Neither feeds a
// mirror, neither is counted, and neither ever pushes in real time: they
// wait for the next open. A friend who muted the sender, or turned these
// off, never sees them, and the sender is never told.

// NodCards are the only words a nod can carry.
var NodCards = []string{
	"Rooting for you this week.",
	"Glad you're in my circle.",
	"Appreciate how steady you've been.",
	"Thinking of you today.",
	"Hope today is gentle with you.",
	"Thank you for the other day.",
	"You made my week easier.",
	"Proud of you.",
	"Here if you need me.",
	"Sending a bit of calm your way.",
	"You've got this.",
	"Thanks for listening.",
	"Miss you. Let's catch up soon.",
	"Your laugh is missed.",
	"Hope you're resting.",
	"Good luck today.",
	"Well done, truly.",
	"Thanks for being honest with me.",
	"You were kind when it counted.",
	"No reply needed. Just a nod.",
	"Hope the week ends well.",
	"Saw something that reminded me of you.",
	"Grateful for you.",
	"Take it one day at a time.",
}

const (
	togetherLife       = 48 * time.Hour
	togetherShownAfter = 24 * time.Hour // an expired one stays a day for the asker: "That one came and went"
	nodsShownDays      = 7
	maxOpenTogethers   = 3 // asked by one person, open at once
)

type nodBody struct {
	To   string `json:"to"`
	Card int    `json:"card"`
	Date string `json:"date"`
}

// NodView is one nod as its receiver sees it.
type NodView struct {
	From FriendView `json:"from"`
	Card int        `json:"card"`
	Text string     `json:"text"`
	Date string     `json:"date"`
}

// NodsView is GET /api/nods?date=: the cards, the nods received this week,
// and who the person already nodded to today.
type NodsView struct {
	Cards    []string  `json:"cards"`
	Received []NodView `json:"received"`
	SentTo   []string  `json:"sentTo"`
}

func (s *Server) SendNod(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b nodBody
	if !readJSON(w, r, &b) {
		return
	}
	if b.Card < 0 || b.Card >= len(NodCards) {
		writeError(w, http.StatusBadRequest, "unknown_card")
		return
	}
	if !s.friendDate(w, r, b.Date) {
		return
	}
	if !acc.Connect {
		writeError(w, http.StatusForbidden, "connect_off")
		return
	}
	ctx := r.Context()
	if friends, err := s.social.AreFriends(ctx, acc.ID, b.To); err != nil || !friends {
		writeError(w, http.StatusNotFound, "not_friends")
		return
	}
	switch err := s.social.PutNod(ctx, Nod{From: acc.ID, To: b.To, Date: b.Date, Card: NodCards[b.Card]}); {
	case errors.Is(err, ErrAlreadyNodded):
		writeError(w, http.StatusConflict, "already_nodded")
	case err != nil:
		log.Printf("nod: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "sent"})
	}
}

// visibleFrom reports whether the receiver sees what friend sends: friends,
// not muted, and with nods on.
func visibleFrom(receiver Account, friends []Friend, sender string) (Friend, bool) {
	i := slices.IndexFunc(friends, func(f Friend) bool { return f.AccountID == sender })
	if i < 0 || friends[i].Muted || !receiver.Connect {
		return Friend{}, false
	}
	return friends[i], true
}

func (s *Server) GetNods(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if !s.friendDate(w, r, date) {
		return
	}
	ctx := r.Context()
	friends, err := s.social.Friends(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	received, err1 := s.social.NodsTo(ctx, acc.ID, mustDate(date).AddDate(0, 0, -(nodsShownDays-1)).Format(dateLayout))
	sent, err2 := s.social.NodsFrom(ctx, acc.ID, date)
	if err := errors.Join(err1, err2); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := NodsView{Cards: NodCards, Received: []NodView{}, SentTo: []string{}}
	for _, n := range received {
		f, ok := visibleFrom(acc, friends, n.From)
		if !ok || n.Date > date {
			continue
		}
		out.Received = append(out.Received, NodView{From: FriendView{ID: f.AccountID, Name: f.Name, Handle: f.Handle, Tag: f.Tag}, Card: slices.Index(NodCards, n.Card), Text: n.Card, Date: n.Date})
	}
	for _, n := range sent {
		out.SentTo = append(out.SentTo, n.To)
	}
	writeJSON(w, http.StatusOK, out)
}

type togetherBody struct {
	FriendID   string `json:"friendId"`
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
}

// TogetherView is one Answer Together as one side sees it. Theirs is empty
// until both have answered.
type TogetherView struct {
	ID         string     `json:"id"`
	With       FriendView `json:"with"`
	Asked      bool       `json:"asked"` // this side asked
	QuestionID string     `json:"questionId"`
	Prompt     string     `json:"prompt"`
	Theme      string     `json:"theme,omitempty"`
	Options    []Option   `json:"options"`
	Mine       string     `json:"mine,omitempty"`
	Theirs     string     `json:"theirs,omitempty"`
	State      string     `json:"state"` // waiting | yours | revealed | expired
	Expires    time.Time  `json:"expires"`
}

// together questions are today's everyday or personal ones, never intimate
// and never one with a heavy answer.
func (s *Server) togetherQuestion(id string) (Question, bool) {
	q, _, ok := s.findQuestion(id, resultsWindow)
	if !ok || q.Care == careIntimate || slices.ContainsFunc(q.Options, func(o Option) bool { return o.Heavy }) {
		return Question{}, false
	}
	return q, true
}

func (s *Server) AskTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b togetherBody
	if !readJSON(w, r, &b) {
		return
	}
	if !acc.Connect {
		writeError(w, http.StatusForbidden, "connect_off")
		return
	}
	q, _, found := s.findQuestion(b.QuestionID, resultsWindow)
	if !found {
		writeError(w, http.StatusNotFound, "unknown_question")
		return
	}
	if _, ok := s.togetherQuestion(b.QuestionID); !ok {
		writeError(w, http.StatusForbidden, "private_question")
		return
	}
	if !hasOption(q, b.OptionID) {
		writeError(w, http.StatusBadRequest, "unknown_option")
		return
	}
	ctx := r.Context()
	if friends, err := s.social.AreFriends(ctx, acc.ID, b.FriendID); err != nil || !friends {
		writeError(w, http.StatusNotFound, "not_friends")
		return
	}
	mine, err := s.social.Togethers(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	now, open := s.clock(), 0
	for _, t := range mine {
		if t.Asker == acc.ID && now.Before(t.Expires) {
			open++
			if t.Invitee == b.FriendID && t.QuestionID == b.QuestionID {
				writeError(w, http.StatusConflict, "already_asked")
				return
			}
		}
	}
	if open >= maxOpenTogethers {
		writeError(w, http.StatusTooManyRequests, "too_many_open")
		return
	}
	t := Together{ID: randomID(), Asker: acc.ID, Invitee: b.FriendID, QuestionID: q.ID, AskerOption: b.OptionID, Expires: now.Add(togetherLife)}
	if err := s.social.PutTogether(ctx, t); err != nil {
		log.Printf("together: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": t.ID})
}

func (s *Server) GetTogethers(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx, now := r.Context(), s.clock()
	friends, err1 := s.social.Friends(ctx, acc.ID)
	all, err2 := s.social.Togethers(ctx, acc.ID)
	if err := errors.Join(err1, err2); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := []TogetherView{}
	for _, t := range all {
		asked := t.Asker == acc.ID
		other := t.Invitee
		if !asked {
			other = t.Asker
		}
		f, ok := visibleFrom(acc, friends, other)
		if !ok && !asked {
			continue
		}
		if !ok { // the person asked; the friend left the circle since
			i := slices.IndexFunc(friends, func(x Friend) bool { return x.AccountID == other })
			if i < 0 {
				continue
			}
			f = friends[i]
		}
		q, found := s.togetherQuestion(t.QuestionID)
		expired := !now.Before(t.Expires)
		if !found || (!asked && (t.InviteeHidden || expired)) {
			continue
		}
		v := TogetherView{ID: t.ID, With: FriendView{ID: f.AccountID, Name: f.Name, Handle: f.Handle, Tag: f.Tag}, Asked: asked,
			QuestionID: q.ID, Prompt: q.Prompt, Theme: q.Theme, Expires: t.Expires}
		for _, o := range q.Options {
			v.Options = append(v.Options, Option{ID: o.ID, Label: o.Label})
		}
		mine, theirs := t.AskerOption, t.InviteeOption
		if !asked {
			mine, theirs = theirs, mine
		}
		v.Mine = mine
		switch {
		case t.InviteeOption != "":
			v.State, v.Theirs = "revealed", theirs
		case expired:
			v.State = "expired"
		case asked:
			v.State = "waiting"
		default:
			v.State = "yours"
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}

type togetherAnswer struct {
	OptionID string `json:"optionId"`
}

func (s *Server) AnswerTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b togetherAnswer
	if !readJSON(w, r, &b) {
		return
	}
	ctx := r.Context()
	t, err := s.social.GetTogether(ctx, r.PathValue("id"))
	if err != nil || t.Invitee != acc.ID || !s.clock().Before(t.Expires) || t.InviteeHidden {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	q, ok := s.togetherQuestion(t.QuestionID)
	if !ok || !hasOption(q, b.OptionID) {
		writeError(w, http.StatusBadRequest, "unknown_option")
		return
	}
	switch err := s.social.AnswerTogether(ctx, t.ID, acc.ID, b.OptionID); {
	case errors.Is(err, ErrAlreadyAnswered):
		writeError(w, http.StatusConflict, "already_answered")
	case err != nil:
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusOK, map[string]string{"mine": b.OptionID, "theirs": t.AskerOption})
	}
}

// LeaveTogether is DELETE /api/together/{id}: the asker withdraws quietly,
// or the invitee says "Not this one", which only hides it for them. There is
// no declined state anywhere: the asker just sees it expire.
func (s *Server) LeaveTogether(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx, id := r.Context(), r.PathValue("id")
	t, err := s.social.GetTogether(ctx, id)
	switch {
	case err != nil:
		writeError(w, http.StatusNotFound, "not_found")
		return
	case t.Asker == acc.ID:
		err = s.social.DeleteTogether(ctx, id, acc.ID)
	case t.Invitee == acc.ID:
		err = s.social.HideTogether(ctx, id, acc.ID)
	default:
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
