package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// API contracts. The acceptance tests in api_test.go pin these shapes.

type Option struct {
	ID      string         `json:"id"`
	Label   string         `json:"label"`
	Depth   int            `json:"depth,omitempty"`  // 1 light .. 4 most revealing; feeds the phone's interest score
	Heavy   bool           `json:"heavy,omitempty"`  // a heavy answer: the phone points to people instead of an insight
	Need    string         `json:"need,omitempty"`   // what the answer reaches for (needs.go)
	Traits  map[string]int `json:"traits,omitempty"` // trait weights; the phone builds the profile from these
	Insight *Insight       `json:"insight,omitempty"`
}

type Question struct {
	ID      string   `json:"id"`
	Theme   string   `json:"theme,omitempty"`
	Care    string   `json:"care,omitempty"` // everyday | personal | intimate
	Prompt  string   `json:"prompt"`
	Options []Option `json:"options"`
}

// DailySet is the response of GET /api/questions/today and GET /api/editions/{date}.
type DailySet struct {
	Date      string     `json:"date"`              // YYYY-MM-DD
	Edition   int        `json:"edition,omitempty"` // shared worldwide: "Persona Index #142"
	Questions []Question `json:"questions"`         // the morning's default three, for a phone with no history
	// Evening is the second sitting's three; the phone opens them at 5 pm.
	Evening []Question `json:"evening,omitempty"`
	// Pool holds every question of the edition, both halves' defaults included.
	// Each phone picks its own three for each half from it; intimate ones only
	// after the 18+ tap.
	Pool []Question `json:"pool,omitempty"`
	// Review marks Sunday: no new questions, the day for the weekly mirror.
	Review bool `json:"review,omitempty"`
	// TomorrowThemes names the themes of the next edition, each once, so the
	// session can end on anticipation. Tomorrow's questions are never sent.
	TomorrowThemes []string `json:"tomorrowThemes,omitempty"`
}

// editionEpoch is the date of edition #1, a Monday. Move it to the public
// launch date before launch so the first public edition is #1.
const editionEpoch = "2026-10-12"

// editionNumber counts the question days from the epoch: Monday to Saturday.
// Sunday, the review day, has no edition and gets 0.
func editionNumber(date string) int {
	d, err1 := time.Parse("2006-01-02", date)
	e, err2 := time.Parse("2006-01-02", editionEpoch)
	if err1 != nil || err2 != nil {
		return 0
	}
	k := questionDay(int(d.Unix() / 86400))
	if k < 0 {
		return 0
	}
	return k - questionDay(int(e.Unix()/86400)) + 1
}

// VoteRequest is the body of POST /api/votes. The Idempotency-Key header is required.
//
// VoterID is the device token issued by POST /api/device (devicetoken.go).
// The duplicate-vote rule built on it lives in voterule.go.
//
// For an intimate question the phone sends OptionID "~private": the choice
// stays on the phone. The server stores "~private" for any vote on one.
type VoteRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	VoterID    string `json:"voterId"`
	Sitting    string `json:"sitting,omitempty"` // morning | evening, on the phone's clock; empty reads as morning
	// Count false keeps the answer for the phone's own mirror without adding
	// it to the shared totals, until the person chooses to (Edwin,
	// 2026-10-29). Absent, from an older app, it is counted as before.
	Count *bool `json:"count,omitempty"`
}

// VoteAccepted is the 202 body, returned only once the vote is durably accepted.
type VoteAccepted struct {
	Status  string `json:"status"` // "accepted"
	EventID string `json:"eventId"`
}

type OptionResult struct {
	OptionID string  `json:"optionId"`
	Count    int     `json:"count"`
	Percent  float64 `json:"percent"`
	Few      bool    `json:"few,omitempty"` // Growing Together: fewer than five chose it, so no count is shown
}

// QuestionResults is the response of GET /api/questions/{questionId}/results.
type QuestionResults struct {
	QuestionID string         `json:"questionId"`
	TotalVotes int            `json:"totalVotes"`
	Options    []OptionResult `json:"options"`
}

// APIError codes: no_questions_today, no_edition, invalid_request, missing_idempotency_key, unknown_question,
// unknown_option, unknown_answer, duplicate_vote, idempotency_key_reused, invalid_device, device_forgotten,
// private_question, rate_limited, unavailable; for the backup (vault.go) invalid_vault_key, no_backup,
// version_conflict, precondition_required, too_large.
type APIError struct {
	Error string `json:"error"`
}

// QuestionBank is the source of editorial question sets, keyed by YYYY-MM-DD.
type QuestionBank interface {
	GetSet(date string) (DailySet, bool)
}

type emptyBank struct{}

func (emptyBank) GetSet(string) (DailySet, bool) { return DailySet{}, false }

// Server holds the API's dependencies. Handlers are stateless over HTTP; vote
// state lives behind the server so tests can use an in-memory store.
type Server struct {
	clock           func() time.Time
	bank            QuestionBank
	votes           VoteStore
	mirror          MirrorStore          // each phone's kept answers and steps (mirrorstore.go)
	helped          HelpedStore          // What Helped reports, apart from votes and the mirror (whathelped.go)
	vaults          VaultStore           // the sealed backups (vault.go)
	social          SocialStore          // accounts and the circle (social.go)
	patron          PatronStore          // what each person holds as a Patron (patron.go)
	pairs           PairStore            // two people walking alongside each other (pair.go)
	productCounts   ProductCountStore    // anonymous daily product counts (productcounts.go)
	reflectTogether ReflectTogetherStore // reflect together (reflecttogether.go)
	outsideNotes    OutsideNoteStore     // the Outside Mirror as named notes (outsidenotes.go)
	push            PushStore            // phones' push addresses (notify.go)
	pusher          Pusher               // how notices go out; nil sends none (notify.go)
	pushes          sync.WaitGroup       // notices still going out
	pushLimit       *windowLimiter       // one notice per person, sender and kind per window
	friends         friendBank           // friend questions (friends.go)
	signIn          SignInConfig
	// patronCfg is what Patron offers here: test purchases, the Founding places (patron.go).
	patronCfg PatronConfig
	devices   *deviceSigner
	// voteRetention is how long raw votes are kept (main.go), so "Delete
	// everything" knows how far back a phone's votes can reach.
	voteRetention time.Duration

	resultCache resultCache
	questions   questionIndex  // each date's questions by id (questionindex.go)
	voteLimit   *windowLimiter // per device
	deviceLimit *windowLimiter // per network address
	forgetLimit *windowLimiter // per network address
	vaultLimit  *windowLimiter // per backup
	// vaultMissLimit counts requests for backups that are not there, per
	// network address, so no one can go looking for backups.
	vaultMissLimit *windowLimiter
	trustCF        bool // read the client address from CF-Connecting-IP

	// Accounts and the circle (accounts.go, circle.go).
	codeAddrLimit   *windowLimiter // per network address
	codeLoginLimit  *windowLimiter // per address a code goes to
	signInLimit     *windowLimiter // per network address
	accountLimit    *windowLimiter // per session
	invitePeekLimit *windowLimiter // per network address
	roomJoinLimit   *windowLimiter // per session
	countLimit      *windowLimiter // product counts, per network address

	// The layers around the API (middleware.go): its metrics, the edge
	// secret, the access log setting, the static site and the metrics token.
	metrics      *metrics
	edgeSecret   string
	accessLog    string // errors | all | off
	static       http.Handler
	metricsToken string
	draining     atomic.Bool // set when shutdown begins; /api/ready answers 503

	// The regional pack (regional.go), encoded once, and its ETag; nil until
	// main loads it.
	regional    []byte
	regionalTag string
}

// NewServer wires the API to one store, which keeps the votes and the
// phones' mirrors in the same database.
func NewServer(clock func() time.Time, bank QuestionBank, store Store, devices *deviceSigner) *Server {
	return &Server{
		clock:           clock,
		bank:            bank,
		votes:           store,
		mirror:          store,
		helped:          store,
		vaults:          store,
		social:          store,
		patron:          store,
		pairs:           store,
		productCounts:   store,
		reflectTogether: store,
		outsideNotes:    store,
		push:            store,
		pushLimit:       newWindowLimiter(pushesPerPairWindow, pushPairWindow),
		patronCfg:       PatronConfig{FoundingLimit: defaultFoundingLimit},
		friends:         mustFriendBank(),
		devices:         devices,
		voteRetention:   defaultRetention,
		voteLimit:       newWindowLimiter(votesPerDevicePerMinute, time.Minute),
		deviceLimit:     newWindowLimiter(devicesPerAddressPerHour, time.Hour),
		forgetLimit:     newWindowLimiter(forgetsPerAddressPerHour, time.Hour),
		vaultLimit:      newWindowLimiter(vaultsPerKeyPerHour, time.Hour),
		vaultMissLimit:  newWindowLimiter(vaultMissesPerAddrPerHr, time.Hour),
		codeAddrLimit:   newWindowLimiter(codesPerAddrHour, time.Hour),
		codeLoginLimit:  newWindowLimiter(codesPerLoginHour, time.Hour),
		signInLimit:     newWindowLimiter(signInsPerAddrHr, time.Hour),
		accountLimit:    newWindowLimiter(accountsCallsMin, time.Minute),
		invitePeekLimit: newWindowLimiter(invitePeeksPerHr, time.Hour),
		roomJoinLimit:   newWindowLimiter(roomJoinsPerHour, time.Hour),
		countLimit:      newWindowLimiter(countsPerAddrHour, time.Hour),
		metrics:         newMetrics(clock()),
		accessLog:       "errors",
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", HealthCheckHandler)
	mux.HandleFunc("GET /api/ready", s.Ready)
	mux.HandleFunc("GET /api/questions/today", s.TodayQuestions)
	mux.HandleFunc("GET /api/editions/{date}", s.Edition)
	mux.HandleFunc("GET /api/regional", s.Regional)
	mux.HandleFunc("GET /api/growing", s.GrowingTogether)
	mux.HandleFunc("GET /api/not-alone", s.NotAloneCounts)
	mux.HandleFunc("POST /api/device", s.IssueDevice)
	mux.HandleFunc("POST /api/votes", s.CastVote)
	mux.HandleFunc("POST /api/ratings", s.RateCard)
	mux.HandleFunc("GET /api/questions/{questionId}/results", s.Results)
	mux.HandleFunc("GET /api/mirror", s.MirrorWeek)
	mux.HandleFunc("GET /api/mirror/{period}", s.MirrorPeriod)
	mux.HandleFunc("GET /api/device/data", s.DeviceData)
	mux.HandleFunc("DELETE /api/device/data", s.ForgetDevice)
	mux.HandleFunc("DELETE /api/mirror", s.ForgetDevice) // the older name, kept for phones still using it
	mux.HandleFunc("POST /api/steps", s.SaveStep)
	mux.HandleFunc("POST /api/plans/checks", s.SavePlanCheck)
	mux.HandleFunc("POST /api/what-helped", s.SaveHelped)
	mux.HandleFunc("GET /api/what-helped", s.GetWhatHelped)
	mux.HandleFunc("POST /api/counts", s.SaveCount)
	mux.HandleFunc("GET /api/device/export", s.ExportDevice)
	mux.HandleFunc("PUT /api/vault", s.PutVault)
	mux.HandleFunc("GET /api/vault", s.GetVault)
	mux.HandleFunc("DELETE /api/vault", s.DeleteVault)

	// Accounts (accounts.go).
	mux.HandleFunc("GET /api/auth/methods", s.SignInMethods)
	mux.HandleFunc("POST /api/auth/code", s.SendCode)
	mux.HandleFunc("POST /api/auth/verify", s.VerifyCode)
	mux.HandleFunc("POST /api/auth/id", s.SignInWithID)
	mux.HandleFunc("GET /api/account", s.GetAccountDetails)
	mux.HandleFunc("PATCH /api/account", s.PatchAccount)
	mux.HandleFunc("DELETE /api/account", s.DeleteAccount)
	mux.HandleFunc("PUT /api/push", s.PutPush)
	mux.HandleFunc("DELETE /api/push", s.DeletePush)
	mux.HandleFunc("POST /api/account/fresh", s.FreshDevice)
	mux.HandleFunc("GET /api/account/device", s.AccountDevice)
	mux.HandleFunc("DELETE /api/account/sessions/{id}", s.SignOut)
	mux.HandleFunc("PUT /api/account/sync", s.PutSync)
	mux.HandleFunc("GET /api/account/sync", s.GetSync)
	mux.HandleFunc("DELETE /api/account/sync", s.DeleteSync)

	// The circle (circle.go).
	mux.HandleFunc("GET /api/circle", s.GetCircle)
	mux.HandleFunc("POST /api/circle/invites", s.CreateInvite)
	mux.HandleFunc("GET /api/circle/invites/{code}", s.PeekInvite)
	mux.HandleFunc("POST /api/circle/invites/{code}", s.AcceptInvite)
	mux.HandleFunc("POST /api/circle/rooms", s.OpenRoom)
	mux.HandleFunc("POST /api/circle/rooms/{code}", s.JoinRoom)
	mux.HandleFunc("POST /api/circle/connect/{id}", s.Connect)
	mux.HandleFunc("POST /api/circle/dismiss/{id}", s.DismissSuggestion)
	mux.HandleFunc("PATCH /api/circle/friends/{id}", s.PatchFriend)
	mux.HandleFunc("DELETE /api/circle/friends/{id}", s.Disconnect)

	// Friend questions and the Outside Mirror (friends.go).
	mux.HandleFunc("GET /api/friends/today", s.FriendTodayHandler)
	mux.HandleFunc("POST /api/friends/votes", s.FriendVote)
	mux.HandleFunc("GET /api/friends/mirror", s.OutsideMirrorHandler)

	// Quiet nods and Answer Together (connect.go).
	mux.HandleFunc("GET /api/nods", s.GetNods)
	mux.HandleFunc("POST /api/nods", s.SendNod)
	mux.HandleFunc("GET /api/together", s.GetTogethers)
	mux.HandleFunc("POST /api/together", s.AskTogether)
	mux.HandleFunc("POST /api/together/{id}", s.AnswerTogether)
	mux.HandleFunc("DELETE /api/together/{id}", s.LeaveTogether)

	// Closer Together (closer.go): shared insights, Common Ground, reach-outs.
	mux.HandleFunc("GET /api/shares", s.GetShares)
	mux.HandleFunc("POST /api/shares", s.PostShare)
	mux.HandleFunc("DELETE /api/shares/{id}", s.WithdrawShare)
	mux.HandleFunc("POST /api/shares/{id}/notes", s.PostShareNote)
	mux.HandleFunc("DELETE /api/shares/{id}/people/{friendId}", s.RemoveSharePerson)
	mux.HandleFunc("GET /api/reflect-together", s.GetReflectTogether)
	mux.HandleFunc("POST /api/reflect-together", s.AskReflectTogether)
	mux.HandleFunc("POST /api/reflect-together/{id}/answer", s.AnswerReflectTogether)
	mux.HandleFunc("POST /api/reflect-together/{id}/reveal", s.RevealReflectTogether)
	mux.HandleFunc("DELETE /api/reflect-together/{id}", s.LeaveReflectTogether)
	mux.HandleFunc("GET /api/outside", s.GetOutside)
	mux.HandleFunc("POST /api/outside", s.AskOutside)
	mux.HandleFunc("POST /api/outside/{id}/write", s.WriteOutside)
	mux.HandleFunc("POST /api/outside/{id}/decline", s.DeclineOutside)
	mux.HandleFunc("POST /api/outside/{id}/keep", s.KeepOutside)
	mux.HandleFunc("GET /api/common", s.GetCommon)

	// Patron (patron.go) and walking alongside one person (pair.go).
	mux.HandleFunc("GET /api/patron", s.GetPatron)
	mux.HandleFunc("POST /api/patron/test", s.TestPurchase)
	mux.HandleFunc("DELETE /api/patron/test", s.ClearTestPurchases)
	mux.HandleFunc("GET /api/pair", s.GetPair)
	mux.HandleFunc("POST /api/pair", s.AskPair)
	mux.HandleFunc("POST /api/pair/accept", s.AcceptPair)
	mux.HandleFunc("DELETE /api/pair", s.EndPair)
	mux.HandleFunc("GET /api/pair/week", s.GetPairWeek)
	mux.HandleFunc("PUT /api/common", s.PutCommon)
	mux.HandleFunc("PUT /api/common/friends/{id}", s.PutCommonFriend)
	mux.HandleFunc("GET /api/reachouts", s.GetReachOuts)
	mux.HandleFunc("POST /api/reachouts", s.PostReachOut)
	mux.HandleFunc("DELETE /api/reachouts/{id}", s.PutAwayReachOut)
	return mux
}

// todayDate is today in UTC, the edition GET /api/questions/today serves.
func (s *Server) todayDate() string {
	return s.clock().UTC().Format("2006-01-02")
}

// Local days. Each phone plays the edition for its own date (GET
// /api/editions/{date}), so the morning questions arrive in the person's
// morning wherever they live. Time zones run from UTC-12 to UTC+14, so a date
// is today somewhere from 14 hours before its UTC midnight until 12 hours
// after its UTC end: about 50 hours.
const (
	eastmostOffset = 14 * time.Hour
	westmostOffset = 12 * time.Hour
)

// Rollover. A phone that loaded the set just before its midnight, or an edge
// copy a few seconds old, still holds that day's questions. Votes on those
// are accepted for rolloverGrace after the day has ended everywhere, and the
// cache lifetimes of a set are always shorter than the grace.
const (
	rolloverGrace   = 10 * time.Minute
	todayEdgeTTL    = 5 * time.Minute
	todayBrowserTTL = time.Minute
)

// questionWindow says which days' questions a lookup may match.
type questionWindow int

const (
	voteWindow    questionWindow = iota // dates that are today somewhere, plus the grace
	resultsWindow                       // those dates and the day before ("yesterday's verdict")
	editionWindow                       // dates that are today somewhere
)

// openDates lists, oldest first, the dates whose questions the window allows.
func (s *Server) openDates(window questionWindow) []string {
	now := s.clock().UTC()
	first := now.Add(-westmostOffset)
	switch window {
	case voteWindow:
		first = first.Add(-rolloverGrace)
	case resultsWindow:
		first = first.AddDate(0, 0, -1)
	}
	last := now.Add(eastmostOffset).Format("2006-01-02")
	var dates []string
	for d := first; ; d = d.AddDate(0, 0, 1) {
		date := d.Format("2006-01-02")
		dates = append(dates, date)
		if date >= last {
			return dates
		}
	}
}

// Edition serves one date's set, for a phone whose local date it is. Only
// dates that are today somewhere can be fetched, so no one sees a day's
// questions before its morning has begun anywhere.
func (s *Server) Edition(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if d, err := time.Parse("2006-01-02", date); err != nil || d.Format("2006-01-02") != date {
		w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=3600")
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	set, ok := DailySet{}, false
	if slices.Contains(s.openDates(editionWindow), date) {
		set, ok = s.bank.GetSet(date)
	}
	if !ok {
		// Short shared cache: the date may open, or its set be published, soon.
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=30")
		writeError(w, http.StatusNotFound, "no_edition")
		return
	}
	s.completeSet(&set)
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d", int(todayBrowserTTL.Seconds()), int(todayEdgeTTL.Seconds())))
	writeJSON(w, http.StatusOK, set)
}

// completeSet adds the edition number and the next day's themes (never its
// questions), so a session can end on anticipation. Saturday gets none:
// tomorrow is the review day.
func (s *Server) completeSet(set *DailySet) {
	set.Edition = editionNumber(set.Date)
	d, err := time.Parse("2006-01-02", set.Date)
	if err != nil {
		return
	}
	if next, ok := s.bank.GetSet(d.AddDate(0, 0, 1).Format("2006-01-02")); ok {
		for _, q := range append(append([]Question{}, next.Questions...), next.Evening...) {
			if q.Theme != "" && q.Care != careIntimate && !slices.Contains(set.TomorrowThemes, q.Theme) {
				set.TomorrowThemes = append(set.TomorrowThemes, q.Theme)
			}
		}
	}
}

func (s *Server) TodayQuestions(w http.ResponseWriter, r *http.Request) {
	set, ok := s.bank.GetSet(s.todayDate())
	if !ok {
		// Short shared cache so a set published later in the day shows up quickly.
		w.Header().Set("Cache-Control", "public, max-age=30, s-maxage=30")
		writeError(w, http.StatusNotFound, "no_questions_today")
		return
	}
	s.completeSet(&set)

	// The set only changes at midnight, so the edge holds it until then and no longer.
	left := s.untilRollover()
	edge, browser := min(todayEdgeTTL, left), min(todayBrowserTTL, left)
	w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, s-maxage=%d", int(browser.Seconds()), int(edge.Seconds())))
	writeJSON(w, http.StatusOK, set)
}

func (s *Server) untilRollover() time.Duration {
	now := s.clock().UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	return midnight.Sub(now)
}

// findQuestion looks a question up in the sets the window allows, and says
// which date's edition it belongs to.
func (s *Server) findQuestion(id string, window questionWindow) (Question, string, bool) {
	for _, day := range s.openDates(window) {
		if q, ok := s.questions.lookup(s.bank, day, id); ok {
			return q, day, true
		}
	}
	return Question{}, "", false
}

// IssueDevice mints a device token. It is the only way to get a vote-capable
// identity, so it carries the per-address limit.
func (s *Server) IssueDevice(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if ok, retry := s.deviceLimit.Allow(clientAddress(r, s.trustCF), s.clock()); !ok {
		rateLimited(w, retry)
		return
	}
	writeJSON(w, http.StatusCreated, DeviceIssued{Token: s.devices.Issue()})
}

func rateLimited(w http.ResponseWriter, retry time.Duration) {
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()+0.5))))
	writeError(w, http.StatusTooManyRequests, "rate_limited")
}

const maxVoteBodyBytes = 4 << 10

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// voteTimeGranularity is how finely a vote's time is stored. An hour is
// enough to count and expire votes, and too coarse to match a vote to the
// moment a phone's mirror row was written.
const voteTimeGranularity = time.Hour

func (s *Server) voteTime() time.Time { return s.clock().UTC().Truncate(voteTimeGranularity) }

func (s *Server) CastVote(w http.ResponseWriter, r *http.Request) {
	var v VoteRequest
	q, date, deviceID, key, ok := s.readBallot(w, r, &v, func() (string, string, string) { return v.QuestionID, v.OptionID, v.VoterID })
	if !ok {
		return
	}
	if v.Sitting != "" && v.Sitting != "morning" && v.Sitting != "evening" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	// The vote's key is per device and question, so the vote table alone
	// cannot be joined into a profile. The phone's mirror keeps the answer
	// under its own key, stored in the same step as the vote.
	a := s.answerFor(deviceID, q, date, v.OptionID, v.Sitting == "evening")
	option := v.OptionID
	if q.Care == careIntimate {
		option = privateOption // whatever arrived, the choice is never stored
	}
	ballot := Ballot{Vote: Vote{QuestionID: q.ID, OptionID: option, VoterHash: s.devices.voterHash(deviceID, q.ID)}, DeviceKey: a.DeviceKey, Answer: &a, Uncounted: notCounted(v.Count)}
	s.accept(w, r, key, ballot)
}

// RatingRequest is the body of POST /api/ratings: the one tap under the
// insight card for the chosen option, saying whether the card fits: "me"
// (that's me), "partly" or "not_me". For an intimate question OptionID is
// "~private", as with the vote.
//
// Learned is the tap the app sent before 2026-10-16 ("I learned something"
// or not). It is read only when Verdict is empty: true as "me", false as
// "not_me", so a phone still on the old app keeps working.
type RatingRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	Verdict    string `json:"verdict,omitempty"`
	Learned    *bool  `json:"learned,omitempty"`
	VoterID    string `json:"voterId"`
	Count      *bool  `json:"count,omitempty"` // as on a vote: false keeps the tap out of the totals
}

// The three verdicts, as the API and the mirror store them.
const (
	verdictMe     = "me"
	verdictPartly = "partly"
	verdictNotMe  = "not_me"
)

// verdict reads the request's verdict, or the old learned tap in its place.
func (v RatingRequest) verdict() (string, bool) {
	switch {
	case v.Verdict == verdictMe || v.Verdict == verdictPartly || v.Verdict == verdictNotMe:
		return v.Verdict, true
	case v.Verdict == "" && v.Learned != nil && *v.Learned:
		return verdictMe, true
	case v.Verdict == "" && v.Learned != nil:
		return verdictNotMe, true
	}
	return "", false
}

// ratingKey is where a question's ratings are counted in the vote store,
// under options "<optionId>/me", "<optionId>/partly" and "<optionId>/not".
// It is one key per question, so the one-vote rule allows one rating per
// phone per question. The prefix cannot clash with question ids, which start
// with a date.
func ratingKey(questionID string) string { return "rating/" + questionID }

func ratingOption(optionID, verdict string) string {
	switch verdict {
	case verdictMe:
		return optionID + "/me"
	case verdictPartly:
		return optionID + "/partly"
	}
	return optionID + "/not"
}

func (s *Server) RateCard(w http.ResponseWriter, r *http.Request) {
	var v RatingRequest
	q, _, deviceID, key, ok := s.readBallot(w, r, &v, func() (string, string, string) { return v.QuestionID, v.OptionID, v.VoterID })
	if !ok {
		return
	}
	verdict, ok := v.verdict()
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown_verdict")
		return
	}
	option, kept := v.OptionID, q.ID
	if q.Care == careIntimate {
		option, kept = privateOption, s.devices.privateQuestionID(q.ID)
	}
	ballot := Ballot{
		Vote:      Vote{QuestionID: ratingKey(q.ID), OptionID: ratingOption(option, verdict), VoterHash: s.devices.voterHash(deviceID, ratingKey(q.ID))},
		DeviceKey: s.devices.mirrorKey(deviceID),
		Rating:    &Rating{QuestionID: kept, Verdict: verdict},
		Uncounted: notCounted(v.Count),
	}
	s.accept(w, r, key, ballot)
}

// notCounted says a ballot stays out of the shared totals: only when the app
// said so. An older app that says nothing is counted, as it always was.
func notCounted(count *bool) bool { return count != nil && !*count }

// readBallot does the checks votes and ratings share: idempotency key, body,
// device token, rate limit, and that the option belongs to a question open
// for votes. It writes the error response itself when a check fails.
func (s *Server) readBallot(w http.ResponseWriter, r *http.Request, body any, fields func() (string, string, string)) (q Question, date, deviceID, key string, ok bool) {
	w.Header().Set("Cache-Control", "no-store")

	key = r.Header.Get("Idempotency-Key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "missing_idempotency_key")
		return Question{}, "", "", "", false
	}
	if !tokenPattern.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return Question{}, "", "", "", false
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxVoteBodyBytes))
	err := dec.Decode(body)
	questionID, optionID, voterID := fields()
	if err != nil || questionID == "" || optionID == "" || voterID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return Question{}, "", "", "", false
	}
	deviceID, ok = s.devices.Verify(voterID)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_device")
		return Question{}, "", "", "", false
	}
	if ok, retry := s.voteLimit.Allow(deviceID, s.clock()); !ok {
		rateLimited(w, retry)
		return Question{}, "", "", "", false
	}

	q, date, ok = s.findQuestion(questionID, voteWindow)
	if !ok {
		writeError(w, http.StatusNotFound, "unknown_question")
		return Question{}, "", "", "", false
	}
	if !hasOption(q, optionID) && (q.Care != careIntimate || optionID != privateOption) {
		writeError(w, http.StatusBadRequest, "unknown_option")
		return Question{}, "", "", "", false
	}
	return q, date, deviceID, key, true
}

// accept stores the ballot with its mirror side and answers the phone.
func (s *Server) accept(w http.ResponseWriter, r *http.Request, key string, b Ballot) {
	e, err := s.votes.Accept(r.Context(), key, b, s.voteTime())
	switch {
	case errors.Is(err, ErrDuplicateVote):
		writeError(w, http.StatusConflict, "duplicate_vote")
	case errors.Is(err, ErrIdempotencyKeyReuse):
		writeError(w, http.StatusUnprocessableEntity, "idempotency_key_reused")
	case errors.Is(err, ErrDeviceForgotten):
		writeError(w, http.StatusGone, "device_forgotten")
	case err != nil:
		log.Printf("accept: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		writeJSON(w, http.StatusAccepted, VoteAccepted{Status: "accepted", EventID: e.ID})
	}
}

func hasOption(q Question, optionID string) bool {
	for _, o := range q.Options {
		if o.ID == optionID {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, APIError{Error: code})
}
