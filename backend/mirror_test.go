package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the weekly mirror (2026-10-15): Edwin asked for the
// mirror to be "fetched direct from the database", so each phone's answers
// are kept on the server under an anonymous device key, and GET /api/mirror
// builds the week from them alone. Never fabricated: a read the stored
// answers cannot support yet is left out.

// mirrorBank publishes the same small edition every day: three questions
// with themes and trait weights, plus a deep sadness question and a private
// (intimate) one in the pool.
type mirrorBank struct{}

func mirrorInsight(step string) *Insight {
	return &Insight{Reveal: "A reveal.", Step: step}
}

func (mirrorBank) GetSet(date string) (DailySet, bool) {
	q := func(id, theme, care, prompt string, opts ...Option) Question {
		return Question{ID: date + "-" + id, Theme: theme, Care: care, Prompt: prompt, Options: opts}
	}
	tidy := q("tidy", "habits", careEveryday, "Dishes after dinner?",
		Option{ID: "now", Label: "Right away", Depth: 1, Traits: map[string]int{"conscientiousness": 1}, Insight: mirrorInsight("Wash one plate the moment you finish.")},
		Option{ID: "later", Label: "Before bed", Depth: 2, Insight: mirrorInsight("Notice when you actually do them.")},
		Option{ID: "pile", Label: "When the pile is high", Depth: 3, Traits: map[string]int{"conscientiousness": -1}, Insight: mirrorInsight("Wash just the cups tonight.")},
	)
	call := q("call", "friendship", carePersonal, "A friend goes quiet for a week. You…",
		Option{ID: "call", Label: "Call them", Depth: 1, Traits: map[string]int{"extraversion": 1}, Insight: mirrorInsight("Call one friend this week.")},
		Option{ID: "text", Label: "Send a text", Depth: 2, Insight: mirrorInsight("Send one light message today.")},
		Option{ID: "wait", Label: "Wonder what I did", Depth: 3, Traits: map[string]int{"attachment_anxiety": 1}, Insight: mirrorInsight("Think of three dull reasons first.")},
	)
	queue := q("queue", "anger", carePersonal, "Someone cuts in front of you in a queue. You…",
		Option{ID: "let-go", Label: "Let it go", Depth: 1, Traits: map[string]int{"agreeableness": 1}, Insight: mirrorInsight("Notice how long it stays with you.")},
		Option{ID: "polite", Label: "Say something polite", Depth: 2, Insight: mirrorInsight("Try the same words once more this week.")},
		Option{ID: "boil", Label: "Boil inside for an hour", Depth: 4, Traits: map[string]int{"rumination": 2}, Insight: mirrorInsight("Name it in three words, then move.")},
	)
	heavy := q("heavy", "sadness-stress", carePersonal, "How heavy did this week feel?",
		Option{ID: "light", Label: "Light enough", Depth: 1, Insight: mirrorInsight("Notice one easy moment today.")},
		Option{ID: "heavy", Label: "Heavier than I let on", Depth: 4, Insight: mirrorInsight("Tell one person one true thing.")},
	)
	night := q("night", "intimacy", careIntimate, "A private question.",
		Option{ID: "a", Label: "A", Depth: 1, Traits: map[string]int{"openness": 1}, Insight: mirrorInsight("A private step.")},
		Option{ID: "b", Label: "B", Depth: 3, Insight: mirrorInsight("Another private step.")},
	)
	return DailySet{Date: date, Questions: []Question{tidy, call, queue}, Pool: []Question{tidy, call, queue, heavy, night}}, true
}

// mirrorDay is the clock at 10:00 UTC on a date, when it is that date
// nearly everywhere.
func mirrorDay(date string) time.Time {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		panic(err)
	}
	return d.Add(10 * time.Hour)
}

func mirrorServer(date string) *Server {
	at := mirrorDay(date)
	return NewServer(func() time.Time { return at }, mirrorBank{}, testStore(), newDeviceSigner(testSecret))
}

func onDay(s *Server, date string) {
	at := mirrorDay(date)
	s.clock = func() time.Time { return at }
}

// answer votes as device on date's question, moving the clock to that day.
func answer(t *testing.T, s *Server, device, date, question, option string) {
	t.Helper()
	onDay(s, date)
	v := VoteRequest{QuestionID: date + "-" + question, OptionID: option, VoterID: device}
	expectStatus(t, postVote(t, s, v, device+"-"+date+"-"+question), http.StatusAccepted)
}

func withDevice(s *Server, req *http.Request, device string) *http.Request {
	if device != "" {
		req.Header.Set("Authorization", "Device "+tokenFor(s, device))
	}
	return req
}

func mirrorRequest(t *testing.T, s *Server, device, date string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, s, withDevice(s, httptest.NewRequest(http.MethodGet, "/api/mirror?date="+date, nil), device))
}

func getMirror(t *testing.T, s *Server, device, date string) Mirror {
	t.Helper()
	onDay(s, date)
	w := mirrorRequest(t, s, device, date)
	expectStatus(t, w, http.StatusOK)
	return decode[Mirror](t, w)
}

func postStep(t *testing.T, s *Server, device string, body StepRequest) *httptest.ResponseRecorder {
	t.Helper()
	if device != "" {
		body.VoterID = tokenFor(s, device)
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/steps", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	return do(t, s, req)
}

func dayOf(m Mirror, date string) MirrorDay {
	for _, d := range m.Days {
		if d.Date == date {
			return d
		}
	}
	return MirrorDay{}
}

func traitOf(m Mirror, trait string) (TraitRead, bool) {
	for _, r := range m.Traits {
		if r.Trait == trait {
			return r, true
		}
	}
	return TraitRead{}, false
}

const (
	mon = "2026-10-12" // edition #1, the Monday of ISO week 42
	tue = "2026-10-13"
	wed = "2026-10-14"
	thu = "2026-10-15"
	sun = "2026-10-18"
)

func TestMirrorFromDatabase(t *testing.T) {
	t.Run("a phone's answers come back in its mirror", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		answer(t, s, "a", mon, "call", "wait")
		answer(t, s, "a", mon, "night", "b")

		m := getMirror(t, s, "a", mon)
		_, week := mirrorDay(mon).ISOWeek()
		if m.Date != mon || m.From != mon || m.To != sun || m.Week != week || m.Editions != [2]int{1, 6} {
			t.Fatalf("expected the week of %s (week %d, editions #1-#6), got %+v", mon, week, m)
		}
		if m.Stats.Answers != 3 || m.Stats.Private != 1 || m.Stats.DaysActive != 1 || m.Stats.DaysSoFar != 1 {
			t.Fatalf("expected 3 answers (1 private) on 1 day, got %+v", m.Stats)
		}
		if len(m.Days) != 7 {
			t.Fatalf("expected seven days, got %d", len(m.Days))
		}
		got := dayOf(m, mon).Answers
		if len(got) != 3 || got[0].Theme != "habits" || got[1].Theme != "friendship" || got[2].Depth != "private" {
			t.Fatalf("expected habits, friendship and a private answer on Monday, got %+v", got)
		}
		if got[0].Depth != "light" || got[1].Depth != "deep" {
			t.Fatalf("expected each answer shown by how deep it went, got %+v", got)
		}
	})

	t.Run("another phone's answers never appear", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		if m := getMirror(t, s, "b", mon); m.Stats.Answers != 0 || len(dayOf(m, mon).Answers) != 0 {
			t.Fatalf("phone b sees answers it never gave: %+v", m.Stats)
		}
	})

	t.Run("needs this phone's device token", func(t *testing.T) {
		s := mirrorServer(mon)
		expectError(t, mirrorRequest(t, s, "", mon), http.StatusUnauthorized, "invalid_device")
		req := httptest.NewRequest(http.MethodGet, "/api/mirror?date="+mon, nil)
		req.Header.Set("Authorization", "Device v1.forged.token")
		expectError(t, do(t, s, req), http.StatusUnauthorized, "invalid_device")
	})

	t.Run("only for a date that is today somewhere", func(t *testing.T) {
		s := mirrorServer(mon)
		for _, bad := range []string{"2026-10-20", "2026-10-01", "today", "2026-13-01"} {
			expectError(t, mirrorRequest(t, s, "a", bad), http.StatusBadRequest, "invalid_request")
		}
	})

	t.Run("is private to the phone and never cached", func(t *testing.T) {
		s := mirrorServer(mon)
		w := mirrorRequest(t, s, "a", mon)
		expectStatus(t, w, http.StatusOK)
		if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") || strings.Contains(cc, "public") {
			t.Fatalf("expected a private, uncached response, got %q", cc)
		}
	})

	t.Run("a retried vote is kept once and a second vote not at all", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "tidy", "now")
		answer(t, s, "a", mon, "tidy", "now") // same idempotency key: a retry
		v := VoteRequest{QuestionID: mon + "-tidy", OptionID: "pile", VoterID: "a"}
		expectError(t, postVote(t, s, v, "another-key"), http.StatusConflict, "duplicate_vote")
		if m := getMirror(t, s, "a", mon); m.Stats.Answers != 1 || dayOf(m, mon).Answers[0].Theme != "habits" {
			t.Fatalf("expected the one first answer, got %+v", m.Stats)
		}
	})

	t.Run("a private answer is kept without its option or its question", func(t *testing.T) {
		s := mirrorServer(mon)
		answer(t, s, "a", mon, "night", "b")
		answers, _, err := s.mirror.DeviceHistory(context.Background(), s.devices.mirrorKey(deviceIDFor(s, "a")), mon, sun)
		if err != nil || len(answers) != 1 {
			t.Fatalf("expected one stored answer, got %v (%v)", answers, err)
		}
		if a := answers[0]; a.OptionID != "" || strings.Contains(a.QuestionID, "night") || a.Theme != "intimacy" {
			t.Fatalf("a private answer must keep only that it was given: %+v", a)
		}
	})

	t.Run("the votes table stays unlinkable: the mirror key is its own", func(t *testing.T) {
		s := mirrorServer(mon)
		id := deviceIDFor(s, "a")
		if k := s.devices.mirrorKey(id); k == s.devices.voterHash(id, mon+"-tidy") || k == s.devices.voterHash(id, mon+"-call") {
			t.Fatal("the mirror key must differ from every per-question vote key")
		}
	})
}

// deviceIDFor is the device id inside the test token for name.
func deviceIDFor(s *Server, name string) string {
	id, ok := s.devices.Verify(tokenFor(s, name))
	if !ok {
		panic("test token does not verify")
	}
	return id
}

func TestMirrorAcrossTheWeek(t *testing.T) {
	s := mirrorServer(mon)
	answer(t, s, "a", "2026-10-07", "tidy", "pile") // last Wednesday
	answer(t, s, "a", mon, "tidy", "now")
	answer(t, s, "a", tue, "call", "text")
	answer(t, s, "a", thu, "queue", "boil")

	m := getMirror(t, s, "a", thu)
	if m.Stats.DaysActive != 3 || m.Stats.DaysActiveLastWeek != 1 || m.Stats.DaysSoFar != 4 {
		t.Fatalf("expected 3 days this week, 1 last week, 4 days so far; got %+v", m.Stats)
	}
	if m.WeeksActive != 2 {
		t.Fatalf("expected 2 weeks with answers, got %d", m.WeeksActive)
	}
	if m.Stats.Answers != 3 || len(dayOf(m, wed).Answers) != 0 || m.Stats.Deepest != 1 {
		t.Fatalf("expected 3 answers this week, none on Wednesday, one deepest option; got %+v", m.Stats)
	}
	for i, d := range m.Days {
		edition := (i + 1) % 7 // Sunday, the review day, has no edition
		if want := mirrorDay(mon).AddDate(0, 0, i).Format("2006-01-02"); d.Date != want || d.Edition != edition {
			t.Fatalf("day %d: expected %s (#%d), got %s (#%d)", i, want, edition, d.Date, d.Edition)
		}
	}
	themes := map[string]ThemeRead{}
	for _, th := range m.Themes {
		themes[th.Theme] = th
	}
	if themes["habits"].Answers != 2 || themes["anger"].Depth != "deep" || themes["friendship"].Area != "people" {
		t.Fatalf("expected themes read over the weeks kept, got %+v", m.Themes)
	}
}

// Edwin, 2026-10-15: speak to people "about who they are and how they can
// change, not comparing them with other people". Nothing another phone
// answers changes what this phone's mirror says.
func TestMirrorIsYoursAlone(t *testing.T) {
	alone, crowded := mirrorServer(mon), mirrorServer(mon)
	for i := range 120 {
		answer(t, crowded, fmt.Sprintf("p%d", i), mon, "tidy", []string{"now", "later"}[i%2])
		answer(t, crowded, fmt.Sprintf("p%d", i), tue, "call", "call")
	}
	for _, s := range []*Server{alone, crowded} {
		answer(t, s, "a", mon, "tidy", "pile")
		answer(t, s, "a", tue, "call", "wait")
		answer(t, s, "a", tue, "night", "b")
		aggregate(t, s)
	}
	mine, theirs := getMirror(t, alone, "a", tue), getMirror(t, crowded, "a", tue)
	if a, b := asJSON(t, mine), asJSON(t, theirs); a != b {
		t.Fatalf("other players changed this phone's mirror:\nalone   %s\ncrowded %s", a, b)
	}
	raw := strings.ToLower(mirrorRequest(t, crowded, "a", tue).Body.String())
	for _, word := range []string{"crowd", "player", "percent", "divisive", "strength", "ranked", "median", "minority"} {
		if strings.Contains(raw, word) {
			t.Fatalf("the mirror speaks of %q: %s", word, raw)
		}
	}
	if d := dayOf(mine, mon).Answers; len(d) != 1 || d[0].Depth != "deep" {
		t.Fatalf("expected Monday's answer shown by how deep it went, got %+v", d)
	}
}

func asJSON(t *testing.T, v any) string {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestMirrorTraitReads(t *testing.T) {
	t.Run("a read places the answers among the question's own options", func(t *testing.T) {
		s := mirrorServer(mon)
		for _, d := range []string{mon, tue, wed} {
			answer(t, s, "a", d, "tidy", "now")
		}
		m := getMirror(t, s, "a", wed)
		r, ok := traitOf(m, "conscientiousness")
		if !ok || r.Answers != 3 || r.Solid || r.Score != 100 {
			t.Fatalf("expected an early read of 100 from 3 answers, got %+v (ok=%v)", r, ok)
		}
		if len(r.Evidence) == 0 || r.Evidence[0] != "Right away" {
			t.Fatalf("expected the answers behind the read, got %v", r.Evidence)
		}
	})

	t.Run("however many play, a read is never a rank among them", func(t *testing.T) {
		s := mirrorServer(mon)
		for i := range 40 {
			for j, d := range []string{mon, tue, wed} {
				answer(t, s, fmt.Sprintf("p%d", i), d, "tidy", []string{"now", "later", "pile"}[(i+j)%3])
			}
		}
		for _, d := range []string{mon, tue, wed} {
			answer(t, s, "a", d, "tidy", "later")
		}
		if r, _ := traitOf(getMirror(t, s, "a", wed), "conscientiousness"); r.Score != 50 {
			t.Fatalf("expected the middle option's place, 50, whoever else plays; got %+v", r)
		}
	})

	t.Run("compares with last week's read", func(t *testing.T) {
		s := mirrorServer(mon)
		for _, d := range []string{"2026-10-05", "2026-10-06", "2026-10-07"} {
			answer(t, s, "a", d, "tidy", "pile")
		}
		for _, d := range []string{mon, tue, wed} {
			answer(t, s, "a", d, "tidy", "now")
		}
		r, _ := traitOf(getMirror(t, s, "a", wed), "conscientiousness")
		if r.Score != 50 || r.Change == nil || *r.Change != 50 {
			t.Fatalf("expected 0 last week and 50 now (three weeks of answers), got %+v", r)
		}
		if len(r.History) != 3 || r.History[0].Score != nil || r.History[1].Score == nil || *r.History[1].Score != 0 {
			t.Fatalf("expected history for the three weeks, got %+v", r.History)
		}
	})

	t.Run("private answers never shape a read", func(t *testing.T) {
		s := mirrorServer(mon)
		for _, d := range []string{mon, tue, wed} {
			answer(t, s, "a", d, "night", "a")
		}
		if _, ok := traitOf(getMirror(t, s, "a", wed), "openness"); ok {
			t.Fatal("an intimate answer shaped a trait read")
		}
	})
}

func TestMirrorRatingsAndMood(t *testing.T) {
	s := mirrorServer(mon)
	answer(t, s, "a", mon, "tidy", "now")
	raw, _ := json.Marshal(RatingRequest{QuestionID: mon + "-tidy", OptionID: "now", Learned: true, VoterID: tokenFor(s, "a")})
	req := httptest.NewRequest(http.MethodPost, "/api/ratings", bytes.NewReader(raw))
	req.Header.Set("Idempotency-Key", "r1")
	expectStatus(t, do(t, s, req), http.StatusAccepted)
	if m := getMirror(t, s, "a", mon); m.Stats.Learned != 1 || m.Stats.Rated != 1 {
		t.Fatalf("expected one card rated 'I learned something', got %+v", m.Stats)
	}

	if getMirror(t, s, "a", mon).LowMood {
		t.Fatal("no heavy answers yet")
	}
	for _, d := range []string{mon, tue, wed} {
		answer(t, s, "a", d, "heavy", "heavy")
	}
	if !getMirror(t, s, "a", wed).LowMood {
		t.Fatal("three heavy answers in a week should bring the support note")
	}
	if up := getMirror(t, s, "a", wed).ComingUp; len(up) == 0 || strings.Contains(strings.Join(up, ","), "intimacy") {
		t.Fatalf("expected the next days' themes, never intimate ones, got %v", up)
	}
}

func TestMirrorForget(t *testing.T) {
	s := mirrorServer(mon)
	answer(t, s, "a", mon, "tidy", "now")
	expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: mon + "-tidy", OptionID: "now", Status: "started", Date: mon}), http.StatusOK)

	expectError(t, do(t, s, httptest.NewRequest(http.MethodDelete, "/api/mirror", nil)), http.StatusUnauthorized, "invalid_device")
	w := do(t, s, withDevice(s, httptest.NewRequest(http.MethodDelete, "/api/mirror", nil), "a"))
	expectStatus(t, w, http.StatusNoContent)

	if m := getMirror(t, s, "a", mon); m.Stats.Answers != 0 || len(m.Steps) != 0 {
		t.Fatalf("expected an empty mirror after delete, got %+v", m)
	}
	if n := totalVotes(t, s, mon+"-tidy"); n != 1 {
		t.Fatalf("the anonymous vote count stays, got %d", n)
	}
}

func TestMirrorRetention(t *testing.T) {
	ctx := context.Background()
	st := testStore().(MirrorStore)
	old := MirrorAnswer{DeviceKey: "k", QuestionID: "q-old", Date: "2026-09-01", Theme: "habits", OptionID: "now", Depth: 1, AnsweredAt: mirrorDay("2026-09-01")}
	recent := MirrorAnswer{DeviceKey: "k", QuestionID: "q-new", Date: mon, Theme: "habits", OptionID: "now", Depth: 1, AnsweredAt: mirrorDay(mon)}
	for _, a := range []MirrorAnswer{old, recent} {
		if err := st.SaveAnswer(ctx, a); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.SaveStep(ctx, MirrorStep{DeviceKey: "k", QuestionID: "q-old", OptionID: "now", Started: "2026-09-01", Status: "started", UpdatedAt: mirrorDay("2026-09-01")}); err != nil {
		t.Fatal(err)
	}
	n, err := st.DeleteMirrorBefore(ctx, "2026-09-07")
	if err != nil || n != 2 {
		t.Fatalf("expected the old answer and step deleted, got %d (%v)", n, err)
	}
	answers, steps, err := st.DeviceHistory(ctx, "k", "2026-01-01", "2026-12-31")
	if err != nil || len(answers) != 1 || answers[0].QuestionID != "q-new" || len(steps) != 0 {
		t.Fatalf("expected only the recent answer kept, got %+v %+v (%v)", answers, steps, err)
	}
	if mirrorRetention < 35*24*time.Hour {
		t.Fatal("the mirror reads three weeks of answers for each of the last three weeks, so it needs five weeks kept")
	}
}
