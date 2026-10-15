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
	"time"
)

// API contracts. The acceptance tests in api_test.go pin these shapes.

type Option struct {
	ID      string         `json:"id"`
	Label   string         `json:"label"`
	Depth   int            `json:"depth,omitempty"`  // 1 light .. 4 most revealing; feeds the phone's interest score
	Traits  map[string]int `json:"traits,omitempty"` // trait weights; the phone builds the profile from these
	Insight *Insight       `json:"insight,omitempty"`
}

type Question struct {
	ID       string    `json:"id"`
	Theme    string    `json:"theme,omitempty"`
	Care     string    `json:"care,omitempty"` // everyday | personal | intimate
	Prompt   string    `json:"prompt"`
	Options  []Option  `json:"options"`
	FollowUp *FollowUp `json:"followUp,omitempty"` // the evening question on this one; see content.go
}

// DailySet is the response of GET /api/questions/today and GET /api/editions/{date}.
type DailySet struct {
	Date      string     `json:"date"`              // YYYY-MM-DD
	Edition   int        `json:"edition,omitempty"` // shared worldwide: "Persona Index #142"
	Questions []Question `json:"questions"`         // the default three, for a phone with no history
	// Pool holds every question of the edition, the default three included.
	// Each phone picks its own three from it; intimate ones only after the 18+ tap.
	Pool []Question `json:"pool,omitempty"`
	// TomorrowThemes names the themes of the next edition, each once, so the
	// session can end on anticipation. Tomorrow's questions are never sent.
	TomorrowThemes []string `json:"tomorrowThemes,omitempty"`
}

// editionEpoch is the date of edition #1. Move it to the public launch date
// before launch so the first public edition is #1.
const editionEpoch = "2026-10-12"

func editionNumber(date string) int {
	d, err1 := time.Parse("2006-01-02", date)
	e, err2 := time.Parse("2006-01-02", editionEpoch)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(d.Sub(e).Hours()/24) + 1
}

// VoteRequest is the body of POST /api/votes. The Idempotency-Key header is required.
//
// VoterID is the device token issued by POST /api/device (devicetoken.go).
// The duplicate-vote rule built on it lives in voterule.go.
type VoteRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	VoterID    string `json:"voterId"`
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
}

// QuestionResults is the response of GET /api/questions/{questionId}/results.
type QuestionResults struct {
	QuestionID string         `json:"questionId"`
	TotalVotes int            `json:"totalVotes"`
	Options    []OptionResult `json:"options"`
}

// APIError codes: no_questions_today, no_edition, invalid_request, missing_idempotency_key, unknown_question,
// unknown_option, unknown_answer, duplicate_vote, idempotency_key_reused, invalid_device, rate_limited, unavailable.
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
	clock   func() time.Time
	bank    QuestionBank
	votes   VoteStore
	mirror  MirrorStore // each phone's kept answers and steps (mirrorstore.go)
	devices *deviceSigner

	resultCache resultCache
	questions   questionCache
	crowdCache  crowdCache
	voteLimit   *windowLimiter // per device
	deviceLimit *windowLimiter // per network address
	trustCF     bool           // read the client address from CF-Connecting-IP
}

func NewServer(clock func() time.Time, bank QuestionBank, votes VoteStore, devices *deviceSigner) *Server {
	// Both stores keep the mirror next to the votes, in the same database.
	mirror, ok := votes.(MirrorStore)
	if !ok {
		mirror = newMemoryStore()
	}
	return &Server{
		clock:       clock,
		bank:        bank,
		votes:       votes,
		mirror:      mirror,
		devices:     devices,
		voteLimit:   newWindowLimiter(votesPerDevicePerMinute, time.Minute),
		deviceLimit: newWindowLimiter(devicesPerAddressPerHour, time.Hour),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", HealthCheckHandler)
	mux.HandleFunc("GET /api/questions/today", s.TodayQuestions)
	mux.HandleFunc("GET /api/editions/{date}", s.Edition)
	mux.HandleFunc("POST /api/device", s.IssueDevice)
	mux.HandleFunc("POST /api/votes", s.CastVote)
	mux.HandleFunc("POST /api/ratings", s.RateCard)
	mux.HandleFunc("GET /api/questions/{questionId}/results", s.Results)
	mux.HandleFunc("GET /api/mirror", s.MirrorWeek)
	mux.HandleFunc("DELETE /api/mirror", s.ForgetMirror)
	mux.HandleFunc("POST /api/steps", s.SaveStep)
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
// questions), so a session can end on anticipation.
func (s *Server) completeSet(set *DailySet) {
	set.Edition = editionNumber(set.Date)
	d, err := time.Parse("2006-01-02", set.Date)
	if err != nil {
		return
	}
	if next, ok := s.bank.GetSet(d.AddDate(0, 0, 1).Format("2006-01-02")); ok {
		for _, q := range next.Questions {
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
		set, ok := s.bank.GetSet(day)
		if !ok {
			continue
		}
		qs := set.Pool
		if len(qs) == 0 {
			qs = set.Questions
		}
		for _, q := range qs {
			if q.ID == id {
				return q, day, true
			}
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

func (s *Server) CastVote(w http.ResponseWriter, r *http.Request) {
	var v VoteRequest
	q, date, deviceID, key, ok := s.readBallot(w, r, &v, func() (string, string, string) { return v.QuestionID, v.OptionID, v.VoterID })
	if !ok {
		return
	}
	// The vote's key is per device and question, so the vote table alone
	// cannot be joined into a profile. The phone's own mirror keeps the answer
	// separately; if that fails the vote is not acknowledged, and the phone's
	// retry (same key) saves it.
	s.accept(w, r, key, Vote{QuestionID: q.ID, OptionID: v.OptionID, VoterHash: s.devices.voterHash(deviceID, q.ID)}, func() error {
		return s.rememberAnswer(r.Context(), deviceID, q, date, v.OptionID)
	})
}

// RatingRequest is the body of POST /api/ratings: the one-tap "I learned
// something" (or not) on the insight card for the chosen option.
type RatingRequest struct {
	QuestionID string `json:"questionId"`
	OptionID   string `json:"optionId"`
	Learned    bool   `json:"learned"`
	VoterID    string `json:"voterId"`
}

// ratingKey is where a card's ratings are counted in the vote store, with
// options "learned" and "not". The prefix cannot clash with question ids,
// which start with a date.
func ratingKey(questionID, optionID string) string {
	return "rating/" + questionID + "/" + optionID
}

func (s *Server) RateCard(w http.ResponseWriter, r *http.Request) {
	var v RatingRequest
	q, _, deviceID, key, ok := s.readBallot(w, r, &v, func() (string, string, string) { return v.QuestionID, v.OptionID, v.VoterID })
	if !ok {
		return
	}
	answer := "not"
	if v.Learned {
		answer = "learned"
	}
	// One rating per device per question, kept apart from the vote itself.
	scope := "rating/" + q.ID
	s.accept(w, r, key, Vote{QuestionID: ratingKey(q.ID, v.OptionID), OptionID: answer, VoterHash: s.devices.voterHash(deviceID, scope)}, func() error {
		// The mirror counts the tap; losing that is not worth failing the rating.
		if err := s.mirror.SaveRating(r.Context(), s.devices.mirrorKey(deviceID), q.ID, v.Learned); err != nil {
			log.Printf("rating: %v", err)
		}
		return nil
	})
}

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
	if !hasOption(q, optionID) {
		writeError(w, http.StatusBadRequest, "unknown_option")
		return Question{}, "", "", "", false
	}
	return q, date, deviceID, key, true
}

// accept stores the ballot, then runs after (when the ballot is new or a
// retry of the same one) before acknowledging it.
func (s *Server) accept(w http.ResponseWriter, r *http.Request, key string, ballot Vote, after func() error) {
	e, err := s.votes.Accept(r.Context(), key, ballot, s.clock())
	if err == nil && after != nil {
		err = after()
	}
	switch {
	case errors.Is(err, ErrDuplicateVote):
		writeError(w, http.StatusConflict, "duplicate_vote")
	case errors.Is(err, ErrIdempotencyKeyReuse):
		writeError(w, http.StatusUnprocessableEntity, "idempotency_key_reused")
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
