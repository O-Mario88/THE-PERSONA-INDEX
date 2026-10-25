package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

// A bank with today's fixtures plus older sets, for "You're not alone".
type notAloneBank struct{}

var (
	tenDaysAgo   = fixedNow.AddDate(0, 0, -10).Format("2006-01-02")
	monthAgo     = fixedNow.AddDate(0, 0, -30).Format("2006-01-02") // one day past the 30-day window
	notAloneSets = map[string]DailySet{
		tenDaysAgo: {Date: tenDaysAgo, Questions: []Question{
			{ID: "q-kettle", Prompt: "Who fills the kettle?", Options: []Option{{ID: "me", Label: "Me"}, {ID: "them", Label: "Them"}, {ID: "no-one", Label: "No one"}}},
			{ID: "q-close", Care: careIntimate, Prompt: "A private one", Options: []Option{{ID: "a", Label: "A"}, {ID: "b", Label: "B"}}},
		}},
		monthAgo: {Date: monthAgo, Questions: []Question{
			{ID: "q-old", Prompt: "An old one", Options: []Option{{ID: "a", Label: "A"}, {ID: "b", Label: "B"}}},
		}},
	}
)

func (notAloneBank) GetSet(date string) (DailySet, bool) {
	if date == today {
		return todaySet, true
	}
	set, ok := notAloneSets[date]
	return set, ok
}

func newNotAloneServer() *Server {
	return NewServer(func() time.Time { return fixedNow }, notAloneBank{}, testStore(), newDeviceSigner(testSecret))
}

// seed stores n tallied answers for a question, whatever its day.
func seed(t *testing.T, s *Server, questionID, optionID string, n int) {
	t.Helper()
	ctx := context.Background()
	for i := range n {
		voter := fmt.Sprintf("%s-%s-%d", questionID, optionID, i)
		b := Ballot{Vote: Vote{QuestionID: questionID, OptionID: optionID, VoterHash: voter}}
		if _, err := s.votes.Accept(ctx, "k-"+voter, b, fixedNow); err != nil {
			t.Fatalf("seed %s: %v", questionID, err)
		}
	}
	aggregate(t, s)
}

func findNotAlone(tg NotAlone, id string) (NotAloneQuestion, bool) {
	for _, q := range tg.Questions {
		if q.QuestionID == id {
			return q, true
		}
	}
	return NotAloneQuestion{}, false
}

func TestNotAlone(t *testing.T) {
	t.Run("counts an older question's answers once enough people have answered", func(t *testing.T) {
		s := newNotAloneServer()
		seed(t, s, "q-kettle", "me", 16)
		seed(t, s, "q-kettle", "them", 6)
		tg := decode[NotAlone](t, get(t, s, "/api/not-alone?date="+today))
		q, ok := findNotAlone(tg, "q-kettle")
		if !ok || q.Total != 22 {
			t.Fatalf("expected q-kettle with 22 answers, got %+v", tg.Questions)
		}
		counts := map[string]int{}
		for _, o := range q.Options {
			counts[o.OptionID] = o.Count
		}
		if counts["me"] != 16 || counts["them"] != 6 || counts["no-one"] != 0 {
			t.Fatalf("expected the real counts, got %+v", q.Options)
		}
		if tg.Min != growingMin || tg.Days != notAloneDays {
			t.Fatalf("expected the minimum and the window to be sent, got %d and %d", tg.Min, tg.Days)
		}
	})

	t.Run("shows nothing for a question under the minimum", func(t *testing.T) {
		s := newNotAloneServer()
		seed(t, s, "q-kettle", "me", growingMin-1)
		tg := decode[NotAlone](t, get(t, s, "/api/not-alone?date="+today))
		if _, ok := findNotAlone(tg, "q-kettle"); ok {
			t.Fatalf("expected no counts under %d answers, got %+v", growingMin, tg.Questions)
		}
	})

	t.Run("folds an answer only a few chose, and leaves it out of the total", func(t *testing.T) {
		s := newNotAloneServer()
		seed(t, s, "q-kettle", "me", 20)
		seed(t, s, "q-kettle", "no-one", 2)
		tg := decode[NotAlone](t, get(t, s, "/api/not-alone?date="+today))
		q, _ := findNotAlone(tg, "q-kettle")
		if q.Total != 20 {
			t.Fatalf("expected the few left out of the total, got %d", q.Total)
		}
		for _, o := range q.Options {
			if o.OptionID == "no-one" && (!o.Few || o.Count != 0) {
				t.Fatalf("expected a few with no count, got %+v", o)
			}
		}
	})

	t.Run("never shows an intimate question", func(t *testing.T) {
		s := newNotAloneServer()
		seed(t, s, "q-close", "a", 30)
		tg := decode[NotAlone](t, get(t, s, "/api/not-alone?date="+today))
		if _, ok := findNotAlone(tg, "q-close"); ok {
			t.Fatal("an intimate question must have no counts")
		}
	})

	t.Run("covers the last thirty days and no further", func(t *testing.T) {
		s := newNotAloneServer()
		seed(t, s, "q-old", "a", 30)
		seed(t, s, "q-alarm", "one", 25)
		tg := decode[NotAlone](t, get(t, s, "/api/not-alone?date="+today))
		if _, ok := findNotAlone(tg, "q-old"); ok {
			t.Fatal("a question older than the window must be left out")
		}
		if _, ok := findNotAlone(tg, "q-alarm"); !ok {
			t.Fatal("today's questions belong in the window")
		}
	})

	t.Run("sends counts, never percentages", func(t *testing.T) {
		s := newNotAloneServer()
		seed(t, s, "q-kettle", "me", 25)
		body := get(t, s, "/api/not-alone?date="+today).Body.String()
		if strings.Contains(body, "percent") {
			t.Fatalf("expected counts only, got %s", body)
		}
	})

	t.Run("is the same for everyone and needs no device pass", func(t *testing.T) {
		s := newNotAloneServer()
		w := get(t, s, "/api/not-alone?date="+today)
		expectStatus(t, w, http.StatusOK)
		if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "public") {
			t.Fatalf("expected a public cache, got %q", cc)
		}
	})

	t.Run("refuses a date that is not today anywhere", func(t *testing.T) {
		s := newNotAloneServer()
		for _, d := range []string{"", "2026-13-01", tenDaysAgo, "nonsense"} {
			expectError(t, get(t, s, "/api/not-alone?date="+d), http.StatusBadRequest, "invalid_request")
		}
	})
}
