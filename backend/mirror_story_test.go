package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The redesigned Mirrors (Edwin, 2026-10-26): the month, quarter and year
// tell what the person's answers reached for and how that moved, what helped
// and what made little difference, and can be read for earlier weeks and
// periods. Every count comes from the phone's own rows; a week whose needs
// were never counted says so instead of reading as "nothing".

func TestPeriodNeeds(t *testing.T) {
	t.Run("needs are counted per week and over the period, never from a Not me or a private answer", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "now") // calm
		answer(t, s, "a", "2026-10-07", "tidy", "now") // calm, tapped Not me below
		answer(t, s, "a", "2026-10-13", "tidy", "now") // calm, the next week
		answer(t, s, "a", "2026-10-13", "night", "a")  // private: no need
		rate(t, s, "a", "2026-10-07", "tidy", "now", verdictNotMe)

		check := func(when string, m PeriodMirror) {
			t.Helper()
			if len(m.Needs) != 1 || m.Needs[0] != (PeriodNeed{Need: "calm", Answers: 2, Days: 2, Weeks: 2}) {
				t.Fatalf("%s: expected calm twice on two days in two weeks, got %+v", when, m.Needs)
			}
			var w41, w42 PeriodWeek
			for _, w := range m.Weeks {
				switch w.Monday {
				case "2026-10-05":
					w41 = w
				case "2026-10-12":
					w42 = w
				}
			}
			if !w41.NeedsOnRecord || w41.Needs["calm"] != 1 || w42.Needs["calm"] != 1 {
				t.Fatalf("%s: expected one calm answer in each week, got %+v and %+v", when, w41, w42)
			}
			for _, mo := range m.Moments {
				if mo.Date == "2026-10-06" && mo.Need != "calm" {
					t.Fatalf("%s: a moment carries its need, got %+v", when, mo)
				}
			}
		}
		check("before folding", getPeriod(t, s, "a", "month", "2026-10-28"))
		fold(t, s, "2026-10-28")
		check("after folding", getPeriod(t, s, "a", "month", "2026-10-28"))
	})

	t.Run("a week folded before needs were counted is not on record for them", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "now")
		fold(t, s, "2026-10-28")
		key := mirrorKeyOf(s, "a")
		old, err := s.mirror.WeekSummaries(t.Context(), key, "2026-10-05", "2026-10-05")
		if err != nil || len(old) != 1 {
			t.Fatalf("expected the folded week, got %v %v", old, err)
		}
		old[0].Needs, old[0].NeedsKept = nil, false
		if err := s.mirror.SaveWeekSummaries(t.Context(), old); err != nil {
			t.Fatal(err)
		}
		m := getPeriod(t, s, "a", "month", "2026-10-28")
		if len(m.Needs) != 0 {
			t.Fatalf("expected no needs from a week that never counted them, got %+v", m.Needs)
		}
		for _, w := range m.Weeks {
			if w.Monday == "2026-10-05" && (w.NeedsOnRecord || !w.Kept) {
				t.Fatalf("expected the week kept but its needs not on record, got %+v", w)
			}
		}
	})

	t.Run("the month before brings its needs when every week of it is on record", func(t *testing.T) {
		s := mirrorServer("2026-09-15")
		answer(t, s, "a", "2026-09-15", "tidy", "now")
		fold(t, s, "2026-10-01")
		fold(t, s, "2026-10-06")
		m := getPeriod(t, s, "a", "month", "2026-10-06")
		if m.Previous == nil || len(m.PreviousNeeds) != 1 || m.PreviousNeeds[0].Need != "calm" {
			t.Fatalf("expected September's calm answer, got %+v %+v", m.Previous, m.PreviousNeeds)
		}
	})

	t.Run("steps tried with no change are kept apart from the ones that helped", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "call", "text")
		answer(t, s, "a", "2026-10-06", "queue", "boil")
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: "2026-10-06-call", OptionID: "text", Status: "helped", Date: "2026-10-06"}), http.StatusOK)
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: "2026-10-06-queue", OptionID: "boil", Status: "no_change", Date: "2026-10-06"}), http.StatusOK)
		for _, when := range []string{"before", "after"} {
			if when == "after" {
				fold(t, s, "2026-10-28")
			}
			m := getPeriod(t, s, "a", "month", "2026-10-28")
			if len(m.Helped) != 1 || m.Helped[0].Step != "Send one light message today." {
				t.Fatalf("%s folding: expected the step that helped, got %+v", when, m.Helped)
			}
			if len(m.NoChange) != 1 || m.NoChange[0].Step != "Name it in three words, then move." {
				t.Fatalf("%s folding: expected the step with no change, got %+v", when, m.NoChange)
			}
		}
	})
}

func TestMirrorBack(t *testing.T) {
	get := func(t *testing.T, s *Server, path string) *httptest.ResponseRecorder {
		t.Helper()
		return do(t, s, withDevice(s, httptest.NewRequest(http.MethodGet, path, nil), "a"))
	}

	t.Run("an earlier week is read whole", func(t *testing.T) {
		s := mirrorServer("2026-10-13")
		answer(t, s, "a", "2026-10-13", "tidy", "now")
		onDay(s, "2026-10-21")
		w := get(t, s, "/api/mirror?date=2026-10-21&back=1")
		expectStatus(t, w, http.StatusOK)
		m := decode[Mirror](t, w)
		if m.From != "2026-10-12" || m.To != "2026-10-18" || m.Stats.DaysSoFar != 6 || m.Stats.Answers != 1 {
			t.Fatalf("expected the whole week of 12 October with its answer, got %s..%s %+v", m.From, m.To, m.Stats)
		}
	})

	t.Run("an earlier month, quarter and year", func(t *testing.T) {
		s := mirrorServer("2026-09-15")
		answer(t, s, "a", "2026-09-15", "tidy", "now")
		onDay(s, "2026-10-06")
		for path, label := range map[string]string{
			"/api/mirror/month?date=2026-10-06&back=1":   "2026-09",
			"/api/mirror/month?date=2026-10-06&back=2":   "2026-08",
			"/api/mirror/quarter?date=2026-10-06&back=1": "2026-Q3",
			"/api/mirror/year?date=2026-10-06&back=1":    "2025",
		} {
			w := get(t, s, path)
			expectStatus(t, w, http.StatusOK)
			p := decode[PeriodMirror](t, w)
			if p.Label != label {
				t.Fatalf("%s: expected %s, got %s", path, label, p.Label)
			}
			if label == "2026-09" && (p.Stats.Answers != 1 || len(p.Weeks) != p.WeeksTotal) {
				t.Fatalf("expected all of September with its answer, got %+v (%d of %d weeks)", p.Stats, len(p.Weeks), p.WeeksTotal)
			}
		}
	})

	t.Run("back is refused beyond what is kept, or when it is not a plain number", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		for _, path := range []string{
			"/api/mirror?date=2026-10-06&back=4",
			"/api/mirror?date=2026-10-06&back=-1",
			"/api/mirror?date=2026-10-06&back=01",
			"/api/mirror?date=2026-10-06&back=x",
			"/api/mirror/month?date=2026-10-06&back=13",
			"/api/mirror/quarter?date=2026-10-06&back=5",
			"/api/mirror/year?date=2026-10-06&back=2",
		} {
			expectStatus(t, get(t, s, path), http.StatusBadRequest)
		}
	})
}
