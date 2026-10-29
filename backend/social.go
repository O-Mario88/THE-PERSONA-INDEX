package main

import (
	"context"
	"errors"
	"time"
)

// Stage 5 of the product (Edwin, 2026-10-24): accounts, the circle, friend
// questions and small ways to reach a friend. Everything here hangs off an
// account. Answers, votes and the mirror stay keyed by device as before
// (devicetoken.go); an account only decides which device id a signed-in
// phone uses, so every phone of one person votes and keeps its mirror under
// one id, and the one-vote rule (voterule.go) becomes one vote per account.
//
// What the server keeps for an account, and nothing more:
//
//   - a display name and a handle, the only two things friends see;
//   - each way of signing in as a keyed hash, with a short hint for the
//     account screen ("a•••@gmail.com"); never the address itself;
//   - the sessions (one a signed-in phone or browser) with a label and the
//     day each was last seen;
//   - with sync on, the 12-word backup phrase sealed with a server key, so a
//     new phone can open the backup without typing it (vault.go);
//   - friendships, mutes, invites, rooms and connect requests;
//   - friend answers about a person with no sender: the trait, a position,
//     the week, and a keyed mark that lets the server count distinct friends
//     without storing who they were (friends.go);
//   - which days a person answered a friend question, with no subject;
//   - quiet nods and Answer Together, for days, never fed to any mirror.

// Account is one person who signed in.
type Account struct {
	ID        string
	Name      string // display name, up to 40 characters
	Handle    string // lower-case, unique, for invites: "ama"
	CreatedOn string
	SeenOn    string // the last day any of its sessions was used
	Suggest   bool   // may be suggested to friends of friends
	Connect   bool   // quiet nods and Answer Together on
	// Epoch counts the times the account deleted everything its phones
	// kept. The account's device id is made from its id and epoch, so after a
	// delete the phones start afresh under a new one.
	Epoch int
	Sync  bool // the backup phrase is kept sealed for its phones
}

// Login is one way of signing in to an account.
type Login struct {
	Key       string // keyed hash of "kind:subject" (accountKeys.loginKey)
	AccountID string
	Kind      string // email | phone | google | apple
	Hint      string // "a•••@gmail.com", "+256 ••• 418"
}

// Session is one signed-in phone or browser.
type Session struct {
	ID        string
	AccountID string
	Label     string // "iPhone · home-screen app", from the phone
	SeenOn    string
}

// LoginCode is a 6-digit code waiting to be typed.
type LoginCode struct {
	Key      string // the login key it signs in to
	CodeHash string
	Expires  time.Time
	Tries    int
}

// Friend is one connection as one side sees it.
type Friend struct {
	AccountID string
	Name      string
	Handle    string
	Tag       string // how this side files them: work | family | school | friends
	Since     string
	Muted     bool   // this side muted them; they are never told
	SeenOn    string // their last day in the app, for "active"
	Connect   bool   // they take nods and Answer Together
}

// Invite is a reusable link to someone's circle.
type Invite struct {
	Code      string
	AccountID string
	Tag       string
	ExpiresOn string
}

// Room is a 24-hour code like LIMA-42 that people in one place type to find
// each other. Joining shows the others as people to connect with; it never
// connects anyone by itself.
type Room struct {
	Code      string
	AccountID string // who opened it
	Tag       string
	Expires   time.Time
}

// Suggestion is someone to connect with: an asked connection, someone in a
// room the person is in, or a friend of at least two friends.
type Suggestion struct {
	AccountID string
	Name      string
	Handle    string
	Mutual    []string // names of shared friends
	Room      string   // a room both are in
	Asked     bool     // they asked to connect
}

// FriendInput is one friend answer about a person, as kept: no sender.
type FriendInput struct {
	Subject    string
	Monday     string
	QuestionID string
	OptionID   string
	Mark       string // keyed hash of sender and subject: counts distinct friends only
}

// Nod is a quiet nod: one fixed card, from one friend to another, once a day.
type Nod struct {
	From, To string
	Date     string
	Card     string
}

// Together is one Answer Together: the same question for two friends, each
// choice sealed until both are in. It never feeds a mirror.
type Together struct {
	ID            string
	Asker         string
	Invitee       string
	QuestionID    string
	AskerOption   string
	InviteeOption string
	InviteeHidden bool // "Not this one": hidden for the invitee, never told to the asker
	Expires       time.Time
}

var (
	ErrNoAccount       = errors.New("no such account")
	ErrHandleTaken     = errors.New("handle taken")
	ErrLoginTaken      = errors.New("that sign-in belongs to another account")
	ErrNoSession       = errors.New("no such session")
	ErrNotFriends      = errors.New("not friends")
	ErrAlreadyAnswered = errors.New("already answered today")
	ErrAlreadyNodded   = errors.New("already nodded today")
	ErrNotFound        = errors.New("not found")
	ErrCodeTaken       = errors.New("code in use")
)

// SocialStore keeps accounts and the circle. Postgres (pgsocial.go) in
// production, memory (socialmemory.go) for local runs and the default tests.
type SocialStore interface {
	// Accounts.
	CreateAccount(ctx context.Context, a Account, l Login) error
	AccountByLogin(ctx context.Context, loginKey string) (Account, error)
	GetAccount(ctx context.Context, id string) (Account, error)
	AccountByHandle(ctx context.Context, handle string) (Account, error)
	// UpdateAccount writes name, handle, suggest, connect, epoch and sync.
	UpdateAccount(ctx context.Context, a Account) error
	AddLogin(ctx context.Context, l Login) error
	Logins(ctx context.Context, accountID string) ([]Login, error)
	// DeleteAccount deletes the account and everything social kept for it:
	// logins, sessions, the sealed phrase, friendships both ways, mutes,
	// invites, rooms, requests, every friend answer about it, its prompt
	// log, nods and Answer Together both ways, its shares and the shares
	// it received, its Common Ground and reach-outs both ways.
	DeleteAccount(ctx context.Context, id string) error

	PutSession(ctx context.Context, s Session) error
	// TouchSession notes today on the session and its account.
	TouchSession(ctx context.Context, id, today string) (Session, error)
	Sessions(ctx context.Context, accountID string) ([]Session, error)
	DeleteSession(ctx context.Context, accountID, id string) (bool, error)

	PutCode(ctx context.Context, c LoginCode) error
	// CheckCode counts one try at a code. It reports true and deletes the
	// code when the hash matches before it expires; after five tries or
	// expiry the code is gone.
	CheckCode(ctx context.Context, loginKey, codeHash string, now time.Time) (bool, error)

	PutSyncPhrase(ctx context.Context, accountID string, sealed []byte) error
	SyncPhrase(ctx context.Context, accountID string) ([]byte, error)
	DeleteSyncPhrase(ctx context.Context, accountID string) error

	// MoveMirror moves one phone's mirror rows to another key, when the
	// phone signs in to an account: answers, steps, plan checks and week
	// summaries. Where both have a row the account's wins.
	MoveMirror(ctx context.Context, fromKey, toKey string) error

	// The circle. Befriend connects a and b; tagA is how a files b, tagB how
	// b files a. Connecting again changes nothing.
	Befriend(ctx context.Context, a, b, tagA, tagB, today string) error
	Unfriend(ctx context.Context, a, b string) error
	SetFriend(ctx context.Context, a, b, tag string, muted bool) error
	Friends(ctx context.Context, accountID string) ([]Friend, error)
	AreFriends(ctx context.Context, a, b string) (bool, error)

	PutInvite(ctx context.Context, inv Invite) error
	GetInvite(ctx context.Context, code string) (Invite, error)
	InviteFor(ctx context.Context, accountID, tag, today string) (Invite, error)

	PutRoom(ctx context.Context, r Room) error
	GetRoom(ctx context.Context, code string, now time.Time) (Room, error)
	OpenRoomOf(ctx context.Context, accountID string, now time.Time) (Room, error)
	JoinRoom(ctx context.Context, code, accountID string) error
	RoomMembers(ctx context.Context, code string) ([]string, error)
	RoomsOf(ctx context.Context, accountID string, now time.Time) ([]Room, error)

	// Ask records that a asked to connect with b.
	Ask(ctx context.Context, a, b string) error
	Asked(ctx context.Context, a, b string) (bool, error)
	Dismiss(ctx context.Context, a, b string) error
	Suggestions(ctx context.Context, accountID string, now time.Time) ([]Suggestion, error)

	// Friend answers. AnswerFriend writes the asker's day in the prompt log
	// and the input about the subject together, or ErrAlreadyAnswered.
	AnswerFriend(ctx context.Context, asker, date string, in FriendInput) error
	AnsweredFriendOn(ctx context.Context, asker, date string) (bool, error)
	FriendInputs(ctx context.Context, subject, fromMonday string) ([]FriendInput, error)

	PutNod(ctx context.Context, n Nod) error
	NodsTo(ctx context.Context, to, fromDate string) ([]Nod, error)
	NodsFrom(ctx context.Context, from, date string) ([]Nod, error)

	PutTogether(ctx context.Context, t Together) error
	GetTogether(ctx context.Context, id string) (Together, error)
	AnswerTogether(ctx context.Context, id, invitee, optionID string) error
	HideTogether(ctx context.Context, id, invitee string) error
	DeleteTogether(ctx context.Context, id, asker string) error
	Togethers(ctx context.Context, accountID string) ([]Together, error)

	// Closer Together (closer.go). A share is kept with its recipients;
	// DeleteShare is the sender withdrawing it.
	PutShare(ctx context.Context, sh Share) error
	SharesTo(ctx context.Context, to string) ([]Share, error)
	SharesFrom(ctx context.Context, from string) ([]Share, error)
	DeleteShare(ctx context.Context, from, id string) (bool, error)
	// Private replies and removing one person (sharing.go).
	ShareByID(ctx context.Context, id string) (Share, error)
	PutShareNote(ctx context.Context, n ShareNote) error
	ShareNotes(ctx context.Context, shareID string) ([]ShareNote, error)
	RemoveShareRecipient(ctx context.Context, from, id, friend string) (bool, error)

	// Common Ground: a person's tags, whom they opted in to, and CommonWith,
	// the friends who opted in back, with those friends' tags and whether
	// they muted this person.
	// PutCommonTags keeps the tags and the day they last changed.
	PutCommonTags(ctx context.Context, accountID string, set CommonTagSet) error
	CommonTagsOf(ctx context.Context, accountID string) (CommonTagSet, error)
	SetCommonConsent(ctx context.Context, a, b string, on bool) error
	CommonConsent(ctx context.Context, accountID string) ([]string, error)
	CommonWith(ctx context.Context, accountID string) ([]CommonMatch, error)

	// PutReachOut keeps one a day per pair and kind, or ErrReachedToday.
	PutReachOut(ctx context.Context, ro ReachOut) error
	ReachOutsTo(ctx context.Context, to, fromDate string) ([]ReachOut, error)
	DeleteReachOut(ctx context.Context, to, id string) (bool, error)

	// DeleteSocialBefore applies retention: friend inputs, the prompt log
	// and nods and reach-outs dated before date, Answer Together, codes and rooms expired
	// before now, invites expired before date.
	DeleteSocialBefore(ctx context.Context, date string, now time.Time) (int, error)
}
