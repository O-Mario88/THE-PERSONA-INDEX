package main

import (
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"time"
)

// The circle (Stage 5): the people someone chooses to be known by. Friends
// see each other's name, handle and the tag they were given, and whether the
// other was in the app this week. Never answers, readings, who else is in the
// circle, or who muted whom.
//
// Ways in:
//   - an invite link (and its QR code), reusable for a month;
//   - a room code like LIMA-42, open for 24 hours, for people in one place:
//     joining shows the others as people to connect with, never connects;
//   - people known to two or more friends, as suggestions.
// A connection always takes both sides: one asks, the other connects back,
// except through an invite link, which is the asking.

const (
	inviteLife        = 30 * 24 * time.Hour
	roomLife          = 24 * time.Hour
	roomJoinsPerHour  = 10 // per session: room codes are short, so guessing is slow
	invitePeeksPerHr  = 60 // per network address
	activeWithin      = 7  // days: a friend seen in the app this week is active
	minMutualFriends  = 2
	outsideMirrorNeed = 3 // friends needed before friend questions and the Outside Mirror open
)

var circleTags = []string{"work", "family", "school", "friends"}

// roomWords are the first half of a room code: short, plain, easy to say
// across a room, and none of them a word that could hurt.
var roomWords = []string{
	"LIMA", "ROSE", "PINE", "LAKE", "MINT", "SAGE", "DOVE", "FERN", "JADE", "KIWI",
	"NOVA", "OPAL", "PEAR", "PLUM", "REED", "RUBY", "SALT", "SEAL", "SNOW", "STAR",
	"TIDE", "WAVE", "WIND", "WOLF", "YARN", "ZEST", "BIRD", "BOAT", "CAPE", "COVE",
	"DUNE", "EDEN", "FIGS", "GLOW", "HAZE", "HILL", "IRIS", "KITE", "LEAF", "LUNA",
	"MAPS", "MOON", "NEST", "OAKS", "PALM", "POND", "RAIN", "RIFT", "SAND", "SKYE",
	"TEAL", "VALE", "VINE", "WREN", "ACRE", "AQUA", "BEAM", "BELL", "BOLT", "CALM",
	"CLAY", "CORN", "DAWN", "DEER", "DUSK", "ECHO", "FAWN", "FOAM", "GATE", "GOLD",
	"HAWK", "HERB", "HIVE", "HOPE", "ISLE", "JAVA", "KELP", "LARK", "LILY", "LOFT",
	"MESA", "MILO", "MIST", "NILE", "OATS", "ONYX", "PATH", "PEAK", "REEF", "ROOT",
	"SOFT", "SURF", "TALL", "TREK", "VEGA", "WARM", "WELL", "WILD", "YAKS", "ZINC",
}

// CircleView is GET /api/circle.
type CircleView struct {
	Me          AccountView      `json:"me"`
	Friends     []FriendView     `json:"friends"`
	Active      int              `json:"active"` // friends who are not muted and were here this week
	Need        int              `json:"need"`   // friends the Outside Mirror needs
	Room        *RoomView        `json:"room,omitempty"`
	Joined      []RoomView       `json:"joined"`
	Suggestions []SuggestionView `json:"suggestions"`
}

type FriendView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Handle  string `json:"handle,omitempty"`
	Tag     string `json:"tag"`
	Since   string `json:"since"`
	Muted   bool   `json:"muted,omitempty"`
	Active  bool   `json:"active"`
	Connect bool   `json:"connect"` // takes nods and Answer Together
}

type RoomView struct {
	Code    string    `json:"code"`
	Tag     string    `json:"tag"`
	Inside  int       `json:"inside"`
	Expires time.Time `json:"expires"`
	Host    string    `json:"host,omitempty"`
}

type SuggestionView struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Handle string   `json:"handle,omitempty"`
	Mutual []string `json:"mutual,omitempty"`
	Room   string   `json:"room,omitempty"`
	Asked  bool     `json:"asked,omitempty"`
}

// InvitePeek is GET /api/circle/invites/{code}: who is inviting, for the
// landing page ("Kofi invited you to their circle · Work").
type InvitePeek struct {
	Name   string `json:"name"`
	Handle string `json:"handle,omitempty"`
	Tag    string `json:"tag"`
}

func activeOn(seenOn, today string) bool {
	if seenOn == "" {
		return false
	}
	return seenOn >= mustDate(today).AddDate(0, 0, -(activeWithin-1)).Format(dateLayout)
}

func (s *Server) GetCircle(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	ctx, now, today := r.Context(), s.clock(), s.today()
	friends, err := s.social.Friends(ctx, acc.ID)
	if err != nil {
		log.Printf("circle: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	out := CircleView{Me: acc.view(), Friends: []FriendView{}, Need: outsideMirrorNeed, Joined: []RoomView{}, Suggestions: []SuggestionView{}}
	for _, f := range friends {
		v := FriendView{ID: f.AccountID, Name: f.Name, Handle: f.Handle, Tag: f.Tag, Since: f.Since, Muted: f.Muted, Active: activeOn(f.SeenOn, today), Connect: f.Connect}
		if v.Active && !v.Muted {
			out.Active++
		}
		out.Friends = append(out.Friends, v)
	}
	if room, err := s.social.OpenRoomOf(ctx, acc.ID, now); err == nil {
		members, _ := s.social.RoomMembers(ctx, room.Code)
		out.Room = &RoomView{Code: room.Code, Tag: room.Tag, Inside: len(members), Expires: room.Expires}
	}
	if rooms, err := s.social.RoomsOf(ctx, acc.ID, now); err == nil {
		for _, room := range rooms {
			if room.AccountID == acc.ID {
				continue
			}
			members, _ := s.social.RoomMembers(ctx, room.Code)
			host, _ := s.social.GetAccount(ctx, room.AccountID)
			out.Joined = append(out.Joined, RoomView{Code: room.Code, Tag: room.Tag, Inside: len(members), Expires: room.Expires, Host: host.Name})
		}
	}
	sugg, err := s.social.Suggestions(ctx, acc.ID, now)
	if err != nil {
		log.Printf("suggestions: %v", err)
	}
	for _, x := range sugg {
		if x.Name == "" { // not finished signing up: nothing to show
			continue
		}
		out.Suggestions = append(out.Suggestions, SuggestionView{ID: x.AccountID, Name: x.Name, Handle: x.Handle, Mutual: x.Mutual, Room: x.Room, Asked: x.Asked})
	}
	writeJSON(w, http.StatusOK, out)
}

type tagBody struct {
	Tag string `json:"tag"`
}

func validTag(t string) bool { return slices.Contains(circleTags, t) }

// needsName refuses circle actions until the person has a name friends can see.
func needsName(w http.ResponseWriter, acc Account) bool {
	if acc.Name == "" {
		writeError(w, http.StatusConflict, "name_needed")
		return true
	}
	return false
}

// CreateInvite is POST /api/circle/invites: the person's link for one tag,
// the same link while it lives.
func (s *Server) CreateInvite(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b tagBody
	if !readJSON(w, r, &b) {
		return
	}
	if !validTag(b.Tag) {
		writeError(w, http.StatusBadRequest, "invalid_tag")
		return
	}
	if needsName(w, acc) {
		return
	}
	ctx, today := r.Context(), s.today()
	inv, err := s.social.InviteFor(ctx, acc.ID, b.Tag, mustDate(today).AddDate(0, 0, 7).Format(dateLayout))
	if errors.Is(err, ErrNotFound) {
		inv = Invite{Code: inviteCode(), AccountID: acc.ID, Tag: b.Tag, ExpiresOn: s.clock().Add(inviteLife).UTC().Format(dateLayout)}
		err = s.social.PutInvite(ctx, inv)
	}
	if err != nil {
		log.Printf("invite: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"code": inv.Code, "tag": inv.Tag, "expiresOn": inv.ExpiresOn})
}

func inviteCode() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, 10)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		b[i] = alphabet[n.Int64()]
	}
	return string(b)
}

func (s *Server) liveInvite(r *http.Request, code string) (Invite, Account, bool) {
	if len(code) != 10 {
		return Invite{}, Account{}, false
	}
	inv, err := s.social.GetInvite(r.Context(), code)
	if err != nil || inv.ExpiresOn < s.today() {
		return Invite{}, Account{}, false
	}
	host, err := s.social.GetAccount(r.Context(), inv.AccountID)
	if err != nil || host.Name == "" {
		return Invite{}, Account{}, false
	}
	return inv, host, true
}

func (s *Server) PeekInvite(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if ok, retry := s.invitePeekLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	inv, host, ok := s.liveInvite(r, r.PathValue("code"))
	if !ok {
		writeError(w, http.StatusNotFound, "no_invite")
		return
	}
	writeJSON(w, http.StatusOK, InvitePeek{Name: host.Name, Handle: host.Handle, Tag: inv.Tag})
}

// AcceptInvite is POST /api/circle/invites/{code}: following someone's link
// is the asking, so it connects at once. The host files the newcomer under
// the link's tag; the newcomer picks their own tag for the host.
func (s *Server) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b tagBody
	if !readJSON(w, r, &b) {
		return
	}
	inv, host, ok := s.liveInvite(r, r.PathValue("code"))
	if !ok {
		writeError(w, http.StatusNotFound, "no_invite")
		return
	}
	if !validTag(b.Tag) {
		b.Tag = inv.Tag
	}
	if host.ID == acc.ID {
		writeError(w, http.StatusBadRequest, "own_invite")
		return
	}
	if needsName(w, acc) {
		return
	}
	if err := s.social.Befriend(r.Context(), host.ID, acc.ID, inv.Tag, b.Tag, s.today()); err != nil {
		log.Printf("accept invite: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, FriendView{ID: host.ID, Name: host.Name, Handle: host.Handle, Tag: b.Tag, Since: s.today(), Active: true, Connect: host.Connect})
}

// OpenRoom is POST /api/circle/rooms: a 24-hour code. One open room each;
// opening again returns it.
func (s *Server) OpenRoom(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b tagBody
	if !readJSON(w, r, &b) {
		return
	}
	if !validTag(b.Tag) {
		writeError(w, http.StatusBadRequest, "invalid_tag")
		return
	}
	if needsName(w, acc) {
		return
	}
	ctx, now := r.Context(), s.clock()
	room, err := s.social.OpenRoomOf(ctx, acc.ID, now)
	if errors.Is(err, ErrNotFound) {
		for range 20 {
			room = Room{Code: roomCode(), AccountID: acc.ID, Tag: b.Tag, Expires: now.Add(roomLife)}
			if err = s.social.PutRoom(ctx, room); !errors.Is(err, ErrCodeTaken) {
				break
			}
		}
	}
	if err != nil {
		log.Printf("open room: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	members, _ := s.social.RoomMembers(ctx, room.Code)
	writeJSON(w, http.StatusOK, RoomView{Code: room.Code, Tag: room.Tag, Inside: len(members), Expires: room.Expires})
}

func roomCode() string {
	w, _ := rand.Int(rand.Reader, big.NewInt(int64(len(roomWords))))
	n, _ := rand.Int(rand.Reader, big.NewInt(90))
	return fmt.Sprintf("%s-%02d", roomWords[w.Int64()], n.Int64()+10)
}

// normalizeRoom reads "lima 42", "LIMA-42" or "lima42" as LIMA-42.
func normalizeRoom(in string) (string, bool) {
	var letters, digits strings.Builder
	for _, r := range strings.ToUpper(in) {
		switch {
		case r >= 'A' && r <= 'Z' && digits.Len() == 0:
			letters.WriteRune(r)
		case r >= '0' && r <= '9' && letters.Len() > 0:
			digits.WriteRune(r)
		case r == ' ' || r == '-':
		default:
			return "", false
		}
	}
	if letters.Len() != 4 || digits.Len() != 2 {
		return "", false
	}
	return letters.String() + "-" + digits.String(), true
}

func (s *Server) JoinRoom(w http.ResponseWriter, r *http.Request) {
	acc, sess, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if ok, retry := s.roomJoinLimit.Allow(sess.ID, s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	code, ok := normalizeRoom(r.PathValue("code"))
	if !ok {
		writeError(w, http.StatusNotFound, "no_room")
		return
	}
	if needsName(w, acc) {
		return
	}
	ctx := r.Context()
	room, err := s.social.GetRoom(ctx, code, s.clock())
	if err != nil {
		writeError(w, http.StatusNotFound, "no_room")
		return
	}
	if err := s.social.JoinRoom(ctx, code, acc.ID); err != nil {
		writeError(w, http.StatusNotFound, "no_room")
		return
	}
	host, _ := s.social.GetAccount(ctx, room.AccountID)
	members, _ := s.social.RoomMembers(ctx, code)
	writeJSON(w, http.StatusOK, RoomView{Code: room.Code, Tag: room.Tag, Inside: len(members), Expires: room.Expires, Host: host.Name})
}

// Connect is POST /api/circle/connect/{id}: only someone the person is
// offered (asked, in a shared room, or known to two friends). When they
// already asked, it connects; otherwise it asks.
func (s *Server) Connect(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var b tagBody
	if !readJSON(w, r, &b) {
		return
	}
	if !validTag(b.Tag) {
		b.Tag = "friends"
	}
	if needsName(w, acc) {
		return
	}
	ctx, id := r.Context(), r.PathValue("id")
	sugg, err := s.social.Suggestions(ctx, acc.ID, s.clock())
	if err != nil {
		log.Printf("connect: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	i := slices.IndexFunc(sugg, func(x Suggestion) bool { return x.AccountID == id })
	if i < 0 {
		writeError(w, http.StatusNotFound, "not_offered")
		return
	}
	if sugg[i].Asked {
		// They asked first; they file the person as "friends" until they change it.
		if err := s.social.Befriend(ctx, acc.ID, id, b.Tag, "friends", s.today()); err != nil {
			log.Printf("connect: %v", err)
			writeError(w, http.StatusServiceUnavailable, "unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "connected"})
		return
	}
	if err := s.social.Ask(ctx, acc.ID, id); err != nil {
		log.Printf("ask: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "asked"})
}

func (s *Server) DismissSuggestion(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if err := s.social.Dismiss(r.Context(), acc.ID, r.PathValue("id")); err != nil {
		log.Printf("dismiss: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type friendPatch struct {
	Tag   *string `json:"tag,omitempty"`
	Muted *bool   `json:"muted,omitempty"`
}

// PatchFriend is PATCH /api/circle/friends/{id}: change a tag, or mute.
// Muting is silent: the muted friend is never told and sees no change. They
// are never picked as today's friend, their nods and Answer Together wait
// unseen. They can still answer friend questions about the person, since
// nothing tells them they were muted.
func (s *Server) PatchFriend(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	var p friendPatch
	if !readJSON(w, r, &p) {
		return
	}
	ctx, id := r.Context(), r.PathValue("id")
	friends, err := s.social.Friends(ctx, acc.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	i := slices.IndexFunc(friends, func(f Friend) bool { return f.AccountID == id })
	if i < 0 {
		writeError(w, http.StatusNotFound, "not_friends")
		return
	}
	f := friends[i]
	if p.Tag != nil {
		if !validTag(*p.Tag) {
			writeError(w, http.StatusBadRequest, "invalid_tag")
			return
		}
		f.Tag = *p.Tag
	}
	if p.Muted != nil {
		f.Muted = *p.Muted
	}
	if err := s.social.SetFriend(ctx, acc.ID, id, f.Tag, f.Muted); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, FriendView{ID: f.AccountID, Name: f.Name, Handle: f.Handle, Tag: f.Tag, Since: f.Since, Muted: f.Muted,
		Active: activeOn(f.SeenOn, s.today()), Connect: f.Connect})
}

// Disconnect is DELETE /api/circle/friends/{id}. Both sides stop seeing each
// other; the other is not told.
func (s *Server) Disconnect(w http.ResponseWriter, r *http.Request) {
	acc, _, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if err := s.social.Unfriend(r.Context(), acc.ID, r.PathValue("id")); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	// Walking alongside someone needs them in the circle (pair.go).
	if partner, err := s.walkingWith(r.Context(), acc.ID); err == nil && partner == r.PathValue("id") {
		s.endPairOf(r.Context(), acc.ID)
	}
	w.WriteHeader(http.StatusNoContent)
}
