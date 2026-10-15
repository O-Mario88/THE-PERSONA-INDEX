package main

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the week (Edwin, 2026-10-15): Monday to Saturday bring
// three questions in the morning and three more that open at 5 pm on the
// phone; Sunday is for review, with no new questions, and opens on the weekly
// mirror.

func TestTheWeek(t *testing.T) {
	b := shippedBank(t)
	area := func(q Question) string { return themes[q.Theme].area }

	t.Run("Monday to Saturday: three in the morning and three in the evening, six different questions", func(t *testing.T) {
		for d := range 730 {
			day := fixedNow.AddDate(0, 0, d)
			date := day.Format(dateLayout)
			set, ok := b.GetSet(date)
			if !ok {
				t.Fatalf("%s: no set", date)
			}
			if day.Weekday() == time.Sunday {
				continue
			}
			if set.Review || len(set.Questions) != 3 || len(set.Evening) != 3 {
				t.Fatalf("%s: expected 3 + 3 questions, got %d + %d (review %v)", date, len(set.Questions), len(set.Evening), set.Review)
			}
			ids := map[string]bool{}
			for _, half := range [][]Question{set.Questions, set.Evening} {
				areasSeen := map[string]bool{}
				for _, q := range half {
					if ids[q.ID] {
						t.Fatalf("%s: %s twice in one day", date, q.ID)
					}
					ids[q.ID] = true
					if areasSeen[area(q)] {
						t.Fatalf("%s: two questions from area %s in one half", date, area(q))
					}
					areasSeen[area(q)] = true
					if q.Care == careIntimate {
						t.Fatalf("%s: intimate question %s among the defaults", date, q.ID)
					}
				}
			}
		}
	})

	t.Run("no theme comes up twice in one day", func(t *testing.T) {
		for d := range 730 {
			day := fixedNow.AddDate(0, 0, d)
			set, _ := b.GetSet(day.Format(dateLayout))
			seen := map[string]bool{}
			for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
				if seen[q.Theme] {
					t.Fatalf("%s: two %s questions", day.Format(dateLayout), q.Theme)
				}
				seen[q.Theme] = true
			}
		}
	})

	t.Run("an area's order keeps one theme's questions apart, around the circle too", func(t *testing.T) {
		var qs []bankQuestion
		for _, th := range []string{"a", "a", "a", "b", "b", "c"} {
			qs = append(qs, bankQuestion{ID: th + strconv.Itoa(len(qs)), Theme: th})
		}
		for seed := range 50 {
			order := spreadThemes(shuffled(len(qs), "test", seed), qs)
			if len(order) != len(qs) {
				t.Fatalf("order %v drops questions", order)
			}
			for j := range order {
				if next := order[(j+1)%len(order)]; qs[order[j]].Theme == qs[next].Theme {
					t.Fatalf("seed %d: %v puts two %s side by side", seed, order, qs[next].Theme)
				}
			}
		}
	})

	t.Run("every area comes up every day", func(t *testing.T) {
		for d := range 14 {
			day := fixedNow.AddDate(0, 0, d)
			if day.Weekday() == time.Sunday {
				continue
			}
			set, _ := b.GetSet(day.Format(dateLayout))
			seen := map[string]bool{}
			for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
				seen[area(q)] = true
			}
			if len(seen) != len(areas) {
				t.Fatalf("%s: only areas %v", day.Format(dateLayout), seen)
			}
		}
	})

	t.Run("Sunday is for review: no questions, nothing to vote on", func(t *testing.T) {
		sunday := "2026-10-18"
		set, ok := b.GetSet(sunday)
		if !ok || !set.Review || len(set.Questions)+len(set.Evening)+len(set.Pool) != 0 {
			t.Fatalf("expected a review day with no questions, got %+v", set)
		}
		at := time.Date(2026, 10, 18, 9, 0, 0, 0, time.UTC)
		s := NewServer(func() time.Time { return at }, b, newMemoryStore(), newDeviceSigner(testSecret))
		w := get(t, s, "/api/editions/"+sunday)
		if !strings.Contains(w.Body.String(), `"questions":[]`) {
			t.Fatalf("expected an empty question list, got %s", w.Body)
		}
		got := decode[DailySet](t, w)
		if !got.Review || got.Edition != 0 || len(got.Questions) != 0 {
			t.Fatalf("expected Sunday's review day, got %+v", got)
		}
		today := decode[DailySet](t, get(t, s, "/api/questions/today"))
		if !today.Review {
			t.Fatalf("expected today's set to say it is a review day, got %+v", today)
		}
	})

	t.Run("no question repeats in an area until the area is used up", func(t *testing.T) {
		draws := map[string][]string{}
		for d := range 1500 {
			date := time.Unix(0, 0).UTC().AddDate(0, 0, d).Format(dateLayout)
			set, _ := b.GetSet(date)
			for _, q := range append(append([]Question{}, set.Questions...), set.Evening...) {
				draws[area(q)] = append(draws[area(q)], strings.TrimPrefix(q.ID, date+"-"))
			}
		}
		for a, ids := range draws {
			n := len(b.byArea[a])
			if len(ids) < 2*n {
				t.Fatalf("area %s: only %d draws, test too short", a, len(ids))
			}
			for start := 0; start+n <= len(ids); start += n {
				seen := map[string]bool{}
				for _, id := range ids[start : start+n] {
					if seen[id] {
						t.Fatalf("area %s repeats %s within one cycle", a, id)
					}
					seen[id] = true
				}
			}
		}
	})

	t.Run("edition numbers count question days: Sunday has none", func(t *testing.T) {
		for date, want := range map[string]int{
			"2026-10-12": 1, "2026-10-17": 6, "2026-10-18": 0, "2026-10-19": 7, "2026-10-25": 0, "2026-10-26": 13,
		} {
			if got := editionNumber(date); got != want {
				t.Errorf("%s: edition %d, want %d", date, got, want)
			}
		}
	})

	t.Run("Saturday looks ahead to Sunday's review, not to Monday's themes", func(t *testing.T) {
		at := time.Date(2026, 10, 17, 9, 0, 0, 0, time.UTC)
		s := NewServer(func() time.Time { return at }, b, newMemoryStore(), newDeviceSigner(testSecret))
		set := decode[DailySet](t, get(t, s, "/api/editions/2026-10-17"))
		if len(set.TomorrowThemes) != 0 {
			t.Fatalf("expected no themes for Sunday, got %v", set.TomorrowThemes)
		}
	})

	t.Run("an evening question takes votes like a morning one", func(t *testing.T) {
		at := time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC)
		s := NewServer(func() time.Time { return at }, b, newMemoryStore(), newDeviceSigner(testSecret))
		set := decode[DailySet](t, get(t, s, "/api/editions/2026-10-14"))
		q := set.Evening[0]
		expectStatus(t, postVote(t, s, VoteRequest{QuestionID: q.ID, OptionID: q.Options[0].ID, VoterID: "a"}, "k1"), http.StatusAccepted)
		if n := totalVotes(t, s, q.ID); n != 1 {
			t.Fatalf("expected 1 vote, got %d", n)
		}
	})
}
