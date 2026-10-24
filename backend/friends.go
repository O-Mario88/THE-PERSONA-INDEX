package main

import (
	"crypto/sha256"
	_ "embed"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"slices"
	"strings"
)

// Friend questions and the Outside Mirror (Stage 5).
//
// Once someone has three friends who were in the app this week, the midday
// window asks one question a day about one friend: "When a shared deadline
// gets tight, what does Kofi usually do first?". Each option leans on a
// trait, the same eleven the person's own mirror speaks (traits.ts).
//
// The answer is kept in two places that cannot be joined:
//
//   - the prompt log: that the asker answered a friend question that day.
//     No friend, no question, no option;
//   - the friend's inputs: the question, the option, the week, and a keyed
//     mark of the sender and the friend, so the server can count distinct
//     friends without storing who they were. Never the sender, never the day.
//
// The friend sees a blend on Sunday, and only once at least three different
// friends answered over three weeks, per trait. With two, one could work out
// who said what by elimination; three keeps every answer anonymous by
// arithmetic, not by promise. Answers already given wait until then.

//go:embed content/friend_questions.json
var friendQuestionsJSON []byte

const (
	friendWindowWeeks = 3
	friendRetention   = 35 // days: inputs and the prompt log go after five weeks
	friendPerTag      = 30
)

type friendOption struct {
	ID     string         `json:"id"`
	Label  string         `json:"label"`
	Traits map[string]int `json:"traits"`
}

type friendQuestion struct {
	ID      string         `json:"id"`
	Tag     string         `json:"tag"`
	Prompt  string         `json:"prompt"`
	Options []friendOption `json:"options"`
}

type friendBank struct {
	byID  map[string]friendQuestion
	byTag map[string][]friendQuestion
}

// asQuestion lets the mirror's traitPosition read a friend question.
func (q friendQuestion) asQuestion() Question {
	out := Question{ID: q.ID, Prompt: q.Prompt}
	for _, o := range q.Options {
		out.Options = append(out.Options, Option{ID: o.ID, Label: o.Label, Traits: o.Traits})
	}
	return out
}

// loadFriendBank reads and checks the friend questions. The server refuses
// to start on a bad one, as with the main bank (content.go).
func loadFriendBank(raw []byte) (friendBank, error) {
	var f struct {
		Version   int              `json:"version"`
		Questions []friendQuestion `json:"questions"`
	}
	if err := decodeStrict(raw, &f); err != nil {
		return friendBank{}, fmt.Errorf("friend questions: %w", err)
	}
	var errs []error
	fail := func(format string, a ...any) { errs = append(errs, fmt.Errorf(format, a...)) }
	b := friendBank{byID: map[string]friendQuestion{}, byTag: map[string][]friendQuestion{}}
	for _, q := range f.Questions {
		where := q.ID
		if _, dup := b.byID[q.ID]; dup || !strings.HasPrefix(q.ID, "fq-"+q.Tag+"-") {
			fail("%s: id must be unique and start fq-<tag>-", where)
		}
		if !validTag(q.Tag) {
			fail("%s: tag %q is not one of %v", where, q.Tag, circleTags)
		}
		if !strings.Contains(q.Prompt, "{name}") {
			fail("%s: the prompt names the friend, as {name}", where)
		}
		checkText(fail, where+" prompt", q.Prompt, 30, 140)
		checkWording(fail, where+" prompt", q.Prompt)
		if len(q.Options) != 4 {
			fail("%s: four options", where)
		}
		ids := map[string]bool{}
		for _, o := range q.Options {
			ow := where + "/" + o.ID
			if ids[o.ID] || o.ID == "" {
				fail("%s: option ids must be unique", ow)
			}
			ids[o.ID] = true
			checkText(fail, ow+" label", strings.ReplaceAll(o.Label, "{name}", "Name"), 6, 70)
			checkWording(fail, ow+" label", o.Label)
			if len(o.Traits) == 0 || len(o.Traits) > 2 {
				fail("%s: one or two trait weights", ow)
			}
			for k, w := range o.Traits {
				if !traitKeys[k] || w == 0 || w < -2 || w > 2 {
					fail("%s: bad trait weight %s=%d", ow, k, w)
				}
			}
		}
		// Every question must place its answers apart on at least one trait.
		shows := false
		for t := range traitKeys {
			if len(q.Options) == 0 {
				break
			}
			if _, ok := traitPosition(q.asQuestion(), q.Options[0].ID, t); ok {
				shows = true
				break
			}
		}
		if len(q.Options) > 0 && !shows {
			fail("%s: no trait tells its options apart", where)
		}
		b.byID[q.ID] = q
		b.byTag[q.Tag] = append(b.byTag[q.Tag], q)
	}
	for _, t := range circleTags {
		if n := len(b.byTag[t]); n != friendPerTag {
			fail("tag %s: %d questions, want %d", t, n, friendPerTag)
		}
	}
	if len(errs) > 0 {
		return friendBank{}, errors.Join(errs...)
	}
	return b, nil
}

func mustFriendBank() friendBank {
	b, err := loadFriendBank(friendQuestionsJSON)
	if err != nil {
		panic(err)
	}
	return b
}

func mondayOf(date string) string {
	m, _ := weekOf(date)
	return m.Format(dateLayout)
}

func hashPick(parts ...string) uint64 {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return binary.BigEndian.Uint64(sum[:8])
}

// eligibleFriends are the friends the person can be asked about: in the app
// this week, not muted.
func eligibleFriends(friends []Friend, today string) []Friend {
	var out []Friend
	for _, f := range friends {
		if !f.Muted && activeOn(f.SeenOn, today) && f.Name != "" {
			out = append(out, f)
		}
	}
	return out
}

// pickFriend is today's friend for the asker: one per day, the same all day.
func pickFriend(asker, date string, eligible []Friend) Friend {
	slices.SortFunc(eligible, func(a, b Friend) int { return strings.Compare(a.AccountID, b.AccountID) })
	return eligible[hashPick("friend", asker, date)%uint64(len(eligible))]
}

// pickFriendQuestion walks the friend's tag in a fixed order for each pair,
// so all thirty come round before one repeats.
func (b friendBank) pick(asker, friend, tag, date string) friendQuestion {
	qs := b.byTag[tag]
	day := uint64(mustDate(date).Unix() / 86400)
	return qs[(hashPick("question", asker, friend)+day)%uint64(len(qs))]
}

// FriendToday is GET /api/friends/today?date=YYYY-MM-DD.
type FriendToday struct {
	Open     bool              `json:"open"`
	Have     int               `json:"have"` // friends active this week, not muted
	Need     int               `json:"need"`
	Answered bool              `json:"answered,omitempty"`
	Friend   *FriendView       `json:"friend,omitempty"`
	Question *FriendQuestionUI `json:"question,omitempty"`
}

type FriendQuestionUI struct {
	ID      string           `json:"id"`
	Prompt  string           `json:"prompt"` // with the friend's name in place
	Options []FriendOptionUI `json:"options"`
}

type FriendOptionUI struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

func (s *Server) friendDate(w http.ResponseWriter, r *http.Request, date string) bool {
	if !slices.Contains(s.openDates(editionWindow), date) {
		writeError(w, http.StatusBadRequest, "invalid_date")
		return false
	}
	return true
}

func (s *Server) FriendTodayHandler(w http.ResponseWriter, r *http.Request) {
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
	eligible := eligibleFriends(friends, s.today())
	out := FriendToday{Have: len(eligible), Need: outsideMirrorNeed}
	if len(eligible) < outsideMirrorNeed {
		writeJSON(w, http.StatusOK, out)
		return
	}
	out.Open = true
	f := pickFriend(acc.ID, date, eligible)
	q := s.friends.pick(acc.ID, f.AccountID, f.Tag, date)
	out.Answered, _ = s.social.AnsweredFriendOn(ctx, acc.ID, date)
	out.Friend = &FriendView{ID: f.AccountID, Name: f.Name, Handle: f.Handle, Tag: f.Tag, Since: f.Since, Active: true, Connect: f.Connect}
	ui := &FriendQuestionUI{ID: q.ID, Prompt: strings.ReplaceAll(q.Prompt, "{name}", f.Name)}
	for _, o := range q.Options {
		ui.Options = append(ui.Options, FriendOptionUI{ID: o.ID, Label: strings.ReplaceAll(o.Label, "{name}", f.Name)})
	}
	out.Question = ui
	writeJSON(w, http.StatusOK, out)
}

type friendVote struct {
	Date       string `json:"date"`
	FriendID   string `json:"friendId"`
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
}

// FriendVote is POST /api/friends/votes: the answer to today's friend
// question. Only today's pick is taken, so nobody can choose whom to
// describe, or answer twice.
func (s *Server) FriendVote(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var v friendVote
	if !readJSON(w, r, &v) {
		return
	}
	if !s.friendDate(w, r, v.Date) {
		return
	}
	ctx := r.Context()
	friends, err := s.social.Friends(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	eligible := eligibleFriends(friends, s.today())
	if len(eligible) < outsideMirrorNeed {
		writeError(w, http.StatusForbidden, "circle_too_small")
		return
	}
	f := pickFriend(acc.ID, v.Date, eligible)
	q := s.friends.pick(acc.ID, f.AccountID, f.Tag, v.Date)
	if v.FriendID != f.AccountID || v.QuestionID != q.ID {
		writeError(w, http.StatusBadRequest, "not_todays_question")
		return
	}
	if !slices.ContainsFunc(q.Options, func(o friendOption) bool { return o.ID == v.OptionID }) {
		writeError(w, http.StatusBadRequest, "unknown_option")
		return
	}
	in := FriendInput{Subject: f.AccountID, Monday: mondayOf(v.Date), QuestionID: q.ID, OptionID: v.OptionID, Mark: s.devices.friendMarkOf(acc.ID, f.AccountID)}
	switch err := s.social.AnswerFriend(ctx, acc.ID, v.Date, in); {
	case errors.Is(err, ErrAlreadyAnswered):
		writeError(w, http.StatusConflict, "already_answered")
	case err != nil:
		log.Printf("friend vote: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
	}
}

// OutsideMirror is GET /api/friends/mirror.
type OutsideMirror struct {
	Open    bool          `json:"open"`
	Friends int           `json:"friends"` // distinct friends who answered in the window, up to Need while closed
	Need    int           `json:"need"`
	Weeks   int           `json:"weeks"`
	Traits  []OutsideLean `json:"traits"`
}

// OutsideLean is where the person's friends, blended, place them on one
// trait, 0 to 100, as the mirror's own leans are placed.
type OutsideLean struct {
	Trait    string  `json:"trait"`
	Position float64 `json:"position"`
}

func (s *Server) OutsideMirrorHandler(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	from := mustDate(mondayOf(s.today())).AddDate(0, 0, -7*(friendWindowWeeks-1)).Format(dateLayout)
	inputs, err := s.social.FriendInputs(r.Context(), acc.ID, from)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, s.friends.blend(inputs))
}

// blend turns friend inputs into the Outside Mirror. A trait shows only
// when at least three different friends placed the person on it.
func (b friendBank) blend(inputs []FriendInput) OutsideMirror {
	marks := map[string]bool{}
	type acc struct {
		sum   float64
		n     int
		marks map[string]bool
	}
	traits := map[string]*acc{}
	for _, in := range inputs {
		q, ok := b.byID[in.QuestionID]
		if !ok {
			continue
		}
		marks[in.Mark] = true
		for t := range traitKeys {
			p, ok := traitPosition(q.asQuestion(), in.OptionID, t)
			if !ok {
				continue
			}
			a := traits[t]
			if a == nil {
				a = &acc{marks: map[string]bool{}}
				traits[t] = a
			}
			a.sum += p
			a.n++
			a.marks[in.Mark] = true
		}
	}
	out := OutsideMirror{Friends: len(marks), Need: outsideMirrorNeed, Weeks: friendWindowWeeks, Traits: []OutsideLean{}}
	if len(marks) < outsideMirrorNeed {
		return out
	}
	for t, a := range traits {
		if len(a.marks) >= outsideMirrorNeed {
			out.Traits = append(out.Traits, OutsideLean{Trait: t, Position: math.Round(100*a.sum/float64(a.n)*10) / 10})
		}
	}
	slices.SortFunc(out.Traits, func(x, y OutsideLean) int { return strings.Compare(x.Trait, y.Trait) })
	out.Open = len(out.Traits) > 0
	return out
}
