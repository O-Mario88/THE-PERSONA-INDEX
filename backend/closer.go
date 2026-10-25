package main

import (
	"errors"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// Closer Together (Connect 3.0, Edwin, 2026-10-25). Three permissions, each
// asked for on its own, and each one can be taken back:
//
//   - Everything stays private by default.
//   - Shared insights: a person picks one thing that helped, or a win,
//     approves the exact words, and picks which friends see it. The server
//     keeps those words and those friends, nothing else, until the person
//     withdraws it or the friendship ends.
//   - Common Ground: the phone works out a few broad tags from the person's
//     own answers (never the answers). Two friends see the tags they share
//     only when each has opted in to the other.
//   - Support & Celebrate: one fixed phrase to one friend. The friend may put
//     it away, send a nod, or reach out outside the app. The sender never
//     learns whether it was seen.
//
// Like nods, none of this feeds a mirror, none of it is counted, and a
// friend who muted the sender, or turned Connect off, never sees it.

// ShareThemes are the themes a shared insight can carry, the chips of
// "What Helped Us".
var ShareThemes = []Option{
	{ID: "managing-stress", Label: "Managing stress"},
	{ID: "building-habits", Label: "Building habits"},
	{ID: "mindset", Label: "Mindset"},
	{ID: "rest", Label: "Rest"},
	{ID: "relationships", Label: "Relationships"},
	{ID: "work-life", Label: "Work and life"},
	{ID: "confidence", Label: "Confidence"},
	{ID: "focus", Label: "Focus"},
}

var shareKinds = []string{"helped", "win"}

// CommonTag is one thing two friends may find they share, with the words
// shown when they do.
type CommonTag struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Value   string `json:"value"`   // "You both value {value}."
	Explore string `json:"explore"` // "Something to explore together"
}

// CommonTags is the fixed list. A phone only ever sends ids from it.
var CommonTags = []CommonTag{
	{ID: "peace-calm", Label: "Peace and calm", Value: "peace and calm", Explore: "What small habit has helped you create more peace in your day?"},
	{ID: "work-life", Label: "Work-life balance", Value: "a balance between work and the rest of life", Explore: "What helps you leave work at work?"},
	{ID: "growth", Label: "Personal growth", Value: "growing as a person", Explore: "What is one thing you have changed your mind about this year?"},
	{ID: "meaningful-time", Label: "Meaningful time", Value: "time that means something", Explore: "When did time with someone last feel well spent?"},
	{ID: "health", Label: "Looking after yourself", Value: "looking after yourself", Explore: "What does a good week for your body look like?"},
	{ID: "family", Label: "Family", Value: "family", Explore: "What is a small family ritual you would keep for ever?"},
	{ID: "adventure", Label: "Adventure", Value: "trying new things", Explore: "What new thing would you try if a friend came along?"},
	{ID: "creativity", Label: "Making things", Value: "making things", Explore: "What have you made lately that you are glad of?"},
	{ID: "learning", Label: "Learning", Value: "learning", Explore: "What are you curious about at the moment?"},
	{ID: "honesty", Label: "Honesty", Value: "honesty", Explore: "When has an honest word from someone helped you?"},
	{ID: "kindness", Label: "Kindness", Value: "kindness", Explore: "What small kindness has stayed with you?"},
	{ID: "independence", Label: "Room of your own", Value: "room to decide for yourself", Explore: "Where do you most need room to decide for yourself?"},
}

// ReachPhrases are the only words a reach-out can carry, by kind.
var ReachPhrases = map[string][]Option{
	"support": {
		{ID: "talk", Label: "Could we talk for a few minutes?"},
		{ID: "think", Label: "Could you help me think something through?"},
		{ID: "company", Label: "I could use some company this week."},
		{ID: "hard-week", Label: "It has been a hard week. A kind word would help."},
	},
	"celebrate": {
		{ID: "win", Label: "Something went well for me today. I wanted you to know."},
		{ID: "progress", Label: "I made progress on something that matters to me."},
		{ID: "thanks", Label: "You helped me get here. Thank you."},
	},
}

const (
	shareTextMin  = 10
	shareTextMax  = 280
	shareNoteMax  = 160 // "Why it helped" and "Try it for yourself"
	shareMaxTo    = 12
	maxOpenShares = 20 // shared by one person and not withdrawn
	maxCommonTags = 6
	// commonChangeDays is how often Common Ground tags may change. Without
	// it, a friend could swap in new tags and read the other's whole list
	// from the overlaps (coordinator review of #30).
	commonChangeDays = 7
	reachShownDays   = 7
)

// ErrReachedToday: one reach-out of each kind a day per pair.
var ErrReachedToday = errors.New("already reached out today")

// linkPattern keeps links out of shared words: a share is a perspective, not
// a feed.
var linkPattern = regexp.MustCompile(`(?i)(https?://|www\.|\b[a-z0-9-]+\.(com|org|net|io|co|app|ly)\b)`)

// Share is one shared insight as kept.
type Share struct {
	ID      string
	From    string
	Kind    string // helped | win
	Theme   string
	Text    string
	Why     string
	Try     string
	Created time.Time
	To      []string // account ids
}

// ReachOut is one fixed phrase from one friend to another.
type ReachOut struct {
	ID     string
	From   string
	To     string
	Kind   string // support | celebrate
	Phrase string // an id from ReachPhrases
	Date   string
}

// CommonMatch is a friend who opted in to Common Ground with someone who
// opted in to them, and that friend's tags.
type CommonMatch struct {
	Friend    Friend
	Tags      []string
	TheyMuted bool // the friend muted this person
}

// CommonTagSet is a person's Common Ground tags and the day they last
// changed.
type CommonTagSet struct {
	Tags      []string
	ChangedOn string
}

type shareBody struct {
	Kind  string   `json:"kind"`
	Theme string   `json:"theme"`
	Text  string   `json:"text"`
	Why   string   `json:"why"`
	Try   string   `json:"try"`
	To    []string `json:"to"`
}

// ShareView is a shared insight as a friend sees it.
type ShareView struct {
	ID    string     `json:"id"`
	From  FriendView `json:"from"`
	Kind  string     `json:"kind"`
	Theme string     `json:"theme"`
	Text  string     `json:"text"`
	Why   string     `json:"why,omitempty"`
	Try   string     `json:"try,omitempty"`
	Date  string     `json:"date"`
}

// SentShareView is a shared insight as its sender sees it: with the names
// of the friends it went to, so it is clear what is shared and with whom.
type SentShareView struct {
	ID    string   `json:"id"`
	Kind  string   `json:"kind"`
	Theme string   `json:"theme"`
	Text  string   `json:"text"`
	Why   string   `json:"why,omitempty"`
	Try   string   `json:"try,omitempty"`
	Date  string   `json:"date"`
	To    []string `json:"to"`
}

// SharesView is GET /api/shares.
type SharesView struct {
	Themes   []Option        `json:"themes"`
	Received []ShareView     `json:"received"`
	Sent     []SentShareView `json:"sent"`
}

// CommonPair is what two friends share, once both have opted in.
type CommonPair struct {
	Friend   FriendView `json:"friend"`
	Shared   []string   `json:"shared"`
	Headline string     `json:"headline"`
	Explore  string     `json:"explore"`
}

// CommonView is GET /api/common.
type CommonView struct {
	Tags []CommonTag `json:"tags"`
	Mine []string    `json:"mine"`
	// NextChange is the first day the tags may change again, once set.
	NextChange string       `json:"nextChange,omitempty"`
	OptedIn    []string     `json:"optedIn"` // friends this person opted in to
	Pairs      []CommonPair `json:"pairs"`
}

type reachBody struct {
	To     string `json:"to"`
	Kind   string `json:"kind"`
	Phrase string `json:"phrase"`
}

// ReachOutView is a reach-out as its receiver sees it.
type ReachOutView struct {
	ID   string     `json:"id"`
	From FriendView `json:"from"`
	Kind string     `json:"kind"`
	Text string     `json:"text"`
	Date string     `json:"date"`
}

// ReachOutsView is GET /api/reachouts: the phrases, and what this person
// received this week. Never what they sent.
type ReachOutsView struct {
	Phrases  map[string][]Option `json:"phrases"`
	Received []ReachOutView      `json:"received"`
}

func friendView(f Friend, today string) FriendView {
	return FriendView{ID: f.AccountID, Name: f.Name, Handle: f.Handle, Tag: f.Tag, Since: f.Since, Active: activeOn(f.SeenOn, today), Connect: f.Connect}
}

func (s *Server) PostShare(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b shareBody
	if !readJSON(w, r, &b) {
		return
	}
	sh, code := s.checkShare(acc, b)
	if code != "" {
		writeError(w, http.StatusBadRequest, code)
		return
	}
	if !acc.Connect {
		writeError(w, http.StatusForbidden, "connect_off")
		return
	}
	ctx := r.Context()
	friends, err := s.social.Friends(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	for _, id := range sh.To {
		if !slices.ContainsFunc(friends, func(f Friend) bool { return f.AccountID == id }) {
			writeError(w, http.StatusForbidden, "not_friends")
			return
		}
	}
	sent, err := s.social.SharesFrom(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	if len(sent) >= maxOpenShares {
		writeError(w, http.StatusConflict, "too_many_shares")
		return
	}
	if err := s.social.PutShare(ctx, sh); err != nil {
		log.Printf("share: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": sh.ID})
}

// checkShare turns a body into a share, or names what is wrong with it.
func (s *Server) checkShare(acc Account, b shareBody) (Share, string) {
	text := strings.Join(strings.Fields(b.Text), " ")
	why, try := strings.Join(strings.Fields(b.Why), " "), strings.Join(strings.Fields(b.Try), " ")
	switch n := utf8.RuneCountInString(text); {
	case !slices.Contains(shareKinds, b.Kind):
		return Share{}, "unknown_kind"
	case !slices.ContainsFunc(ShareThemes, func(o Option) bool { return o.ID == b.Theme }):
		return Share{}, "unknown_theme"
	case n < shareTextMin || n > shareTextMax:
		return Share{}, "text_length"
	case utf8.RuneCountInString(why) > shareNoteMax || utf8.RuneCountInString(try) > shareNoteMax:
		return Share{}, "note_length"
	case linkPattern.MatchString(text + " " + why + " " + try):
		return Share{}, "no_links"
	}
	to := slices.Compact(slices.Sorted(slices.Values(b.To)))
	to = slices.DeleteFunc(to, func(id string) bool { return id == "" || id == acc.ID })
	if len(to) == 0 || len(to) > shareMaxTo {
		return Share{}, "recipients"
	}
	return Share{ID: randomID(), From: acc.ID, Kind: b.Kind, Theme: b.Theme, Text: text, Why: why, Try: try, Created: s.clock().UTC(), To: to}, ""
}

func (s *Server) GetShares(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx, today := r.Context(), s.today()
	friends, err1 := s.social.Friends(ctx, acc.ID)
	received, err2 := s.social.SharesTo(ctx, acc.ID)
	sent, err3 := s.social.SharesFrom(ctx, acc.ID)
	if err := errors.Join(err1, err2, err3); err != nil {
		log.Printf("shares: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := SharesView{Themes: ShareThemes, Received: []ShareView{}, Sent: []SentShareView{}}
	for _, sh := range received {
		f, ok := visibleFrom(acc, friends, sh.From)
		if !ok {
			continue
		}
		out.Received = append(out.Received, ShareView{ID: sh.ID, From: friendView(f, today), Kind: sh.Kind, Theme: sh.Theme, Text: sh.Text, Why: sh.Why, Try: sh.Try, Date: sh.Created.Format(dateLayout)})
	}
	for _, sh := range sent {
		v := SentShareView{ID: sh.ID, Kind: sh.Kind, Theme: sh.Theme, Text: sh.Text, Why: sh.Why, Try: sh.Try, Date: sh.Created.Format(dateLayout), To: []string{}}
		for _, f := range friends {
			if slices.Contains(sh.To, f.AccountID) {
				v.To = append(v.To, f.Name)
			}
		}
		out.Sent = append(out.Sent, v)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) WithdrawShare(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	switch found, err := s.social.DeleteShare(r.Context(), acc.ID, r.PathValue("id")); {
	case err != nil:
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	case !found:
		writeError(w, http.StatusNotFound, "not_found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) PutCommon(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		Tags []string `json:"tags"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	tags := slices.Compact(slices.Sorted(slices.Values(b.Tags)))
	if len(tags) > maxCommonTags {
		writeError(w, http.StatusBadRequest, "too_many_tags")
		return
	}
	for _, t := range tags {
		if !slices.ContainsFunc(CommonTags, func(c CommonTag) bool { return c.ID == t }) {
			writeError(w, http.StatusBadRequest, "unknown_tag")
			return
		}
	}
	ctx, today := r.Context(), s.today()
	cur, err := s.social.CommonTagsOf(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	// The same tags, or fewer of them, never probe anything: always fine,
	// and they leave the clock where it was. New tags wait a week.
	changedOn := cur.ChangedOn
	if !isSubset(tags, cur.Tags) {
		if next := nextCommonChange(cur); next != "" && today < next {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "tags_changed_recently", "nextChange": next})
			return
		}
		changedOn = today
	}
	if err := s.social.PutCommonTags(ctx, acc.ID, CommonTagSet{Tags: tags, ChangedOn: changedOn}); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func isSubset(xs, of []string) bool {
	for _, x := range xs {
		if !slices.Contains(of, x) {
			return false
		}
	}
	return true
}

func nextCommonChange(cur CommonTagSet) string {
	if cur.ChangedOn == "" {
		return ""
	}
	return mustDate(cur.ChangedOn).AddDate(0, 0, commonChangeDays).Format(dateLayout)
}

func (s *Server) PutCommonFriend(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b struct {
		On bool `json:"on"`
	}
	if !readJSON(w, r, &b) {
		return
	}
	ctx, friend := r.Context(), r.PathValue("id")
	if b.On {
		if ok, err := s.social.AreFriends(ctx, acc.ID, friend); err != nil || !ok {
			writeError(w, http.StatusNotFound, "not_friends")
			return
		}
	}
	if err := s.social.SetCommonConsent(ctx, acc.ID, friend, b.On); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) GetCommon(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx, today := r.Context(), s.today()
	mine, err1 := s.social.CommonTagsOf(ctx, acc.ID)
	optedIn, err2 := s.social.CommonConsent(ctx, acc.ID)
	matches, err3 := s.social.CommonWith(ctx, acc.ID)
	if err := errors.Join(err1, err2, err3); err != nil {
		log.Printf("common: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := CommonView{Tags: CommonTags, Mine: nonNil(mine.Tags), NextChange: nextCommonChange(mine), OptedIn: nonNil(optedIn), Pairs: []CommonPair{}}
	for _, m := range matches {
		// The same rule as shares and reach-outs, both ways: no one who
		// muted the other, and no one with Connect off.
		if !acc.Connect || m.Friend.Muted || !m.Friend.Connect || m.TheyMuted {
			continue
		}
		shared := slices.DeleteFunc(slices.Clone(m.Tags), func(t string) bool { return !slices.Contains(mine.Tags, t) })
		if len(shared) == 0 {
			continue
		}
		slices.Sort(shared)
		headline, explore := commonWords(shared)
		out.Pairs = append(out.Pairs, CommonPair{Friend: friendView(m.Friend, today), Shared: shared, Headline: headline, Explore: explore})
	}
	writeJSON(w, http.StatusOK, out)
}

// commonWords is the templated line for what two friends share, and the
// question to explore together, from the first tags in the list's order.
func commonWords(shared []string) (string, string) {
	var tags []CommonTag
	for _, c := range CommonTags {
		if slices.Contains(shared, c.ID) {
			tags = append(tags, c)
		}
	}
	if len(tags) == 1 {
		return "You both value " + tags[0].Value + ".", tags[0].Explore
	}
	return "You both value " + tags[0].Value + " and " + tags[1].Value + ".", tags[0].Explore
}

func nonNil(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}

func reachPhrase(kind, id string) (string, bool) {
	for _, o := range ReachPhrases[kind] {
		if o.ID == id {
			return o.Label, true
		}
	}
	return "", false
}

func (s *Server) PostReachOut(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b reachBody
	if !readJSON(w, r, &b) {
		return
	}
	if _, ok := reachPhrase(b.Kind, b.Phrase); !ok {
		writeError(w, http.StatusBadRequest, "unknown_phrase")
		return
	}
	if !acc.Connect {
		writeError(w, http.StatusForbidden, "connect_off")
		return
	}
	ctx := r.Context()
	if ok, err := s.social.AreFriends(ctx, acc.ID, b.To); err != nil || !ok {
		writeError(w, http.StatusNotFound, "not_friends")
		return
	}
	ro := ReachOut{ID: randomID(), From: acc.ID, To: b.To, Kind: b.Kind, Phrase: b.Phrase, Date: s.today()}
	switch err := s.social.PutReachOut(ctx, ro); {
	case errors.Is(err, ErrReachedToday):
		writeError(w, http.StatusConflict, "already_reached_out")
	case err != nil:
		log.Printf("reach out: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusCreated, map[string]string{"status": "sent"})
	}
}

func (s *Server) GetReachOuts(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx, today := r.Context(), s.today()
	friends, err1 := s.social.Friends(ctx, acc.ID)
	received, err2 := s.social.ReachOutsTo(ctx, acc.ID, mustDate(today).AddDate(0, 0, -(reachShownDays-1)).Format(dateLayout))
	if err := errors.Join(err1, err2); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := ReachOutsView{Phrases: ReachPhrases, Received: []ReachOutView{}}
	for _, ro := range received {
		f, ok := visibleFrom(acc, friends, ro.From)
		if !ok {
			continue
		}
		text, _ := reachPhrase(ro.Kind, ro.Phrase)
		out.Received = append(out.Received, ReachOutView{ID: ro.ID, From: friendView(f, today), Kind: ro.Kind, Text: text, Date: ro.Date})
	}
	writeJSON(w, http.StatusOK, out)
}

// PutAwayReachOut is the receiver acknowledging a reach-out: it is gone,
// and the sender is not told.
func (s *Server) PutAwayReachOut(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	switch found, err := s.social.DeleteReachOut(r.Context(), acc.ID, r.PathValue("id")); {
	case err != nil:
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	case !found:
		writeError(w, http.StatusNotFound, "not_found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
