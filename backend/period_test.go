package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the monthly, quarterly and yearly mirrors (Edwin,
// 2026-10-15: "weekly mirror, monthly mirror, quarterly mirror and yearly
// mirror"). Answers are kept five weeks, so each finished week folds into a
// small summary kept thirteen months, and the longer mirrors are built from
// those summaries plus the weeks not folded yet. Like the weekly mirror, each
// is built from the phone's own rows and set only against its own past.
// Never fabricated: a week with no record says so instead of counting as a
// week off.

func periodRequest(t *testing.T, s *Server, device, period, date string) *httptest.ResponseRecorder {
	t.Helper()
	onDay(s, date)
	return do(t, s, withDevice(s, httptest.NewRequest(http.MethodGet, "/api/mirror/"+period+"?date="+date, nil), device))
}

func getPeriod(t *testing.T, s *Server, device, period, date string) PeriodMirror {
	t.Helper()
	w := periodRequest(t, s, device, period, date)
	expectStatus(t, w, http.StatusOK)
	return decode[PeriodMirror](t, w)
}

func fold(t *testing.T, s *Server, date string) int {
	t.Helper()
	onDay(s, date)
	n, err := s.FoldWeeks(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func mirrorKeyOf(s *Server, device string) string {
	id, _ := s.devices.Verify(tokenFor(s, device))
	return s.devices.mirrorKey(id)
}

// October 2026 by the Thursday rule: the week of Monday 28 September (its
// Thursday is 1 October) to the week of Monday 26 October (Thursday 29).
const (
	octFirst = "2026-09-28"
	octLast  = "2026-11-01"
)

func TestPeriodMirror(t *testing.T) {
	t.Run("a month gathers the weeks whose Thursday falls in it", func(t *testing.T) {
		s := mirrorServer("2026-09-29")
		answer(t, s, "a", "2026-09-29", "tidy", "now")
		answer(t, s, "a", "2026-10-06", "call", "wait")
		answer(t, s, "a", "2026-10-06", "queue", "boil")
		answer(t, s, "a", "2026-10-28", "tidy", "pile")

		m := getPeriod(t, s, "a", "month", "2026-10-28")
		if m.Period != "month" || m.Label != "2026-10" || m.From != octFirst || m.To != octLast || m.WeeksTotal != 5 {
			t.Fatalf("expected October as five weeks from %s to %s, got %+v", octFirst, octLast, m)
		}
		if len(m.Weeks) != 5 || m.Weeks[0].Monday != octFirst || m.Weeks[4].Monday != "2026-10-26" {
			t.Fatalf("expected the five weeks so far, got %+v", m.Weeks)
		}
		for _, w := range m.Weeks {
			if !w.Kept {
				t.Fatalf("every week since 28 September still has its answers, got %+v", w)
			}
		}
		if w := m.Weeks[1]; w.DaysActive != 1 || w.Answers != 2 || w.DaysSoFar != 6 || w.Week != 41 {
			t.Fatalf("expected week 41 with one day and two answers, got %+v", w)
		}
		if w := m.Weeks[4]; w.DaysSoFar != 3 || w.Answers != 1 {
			t.Fatalf("expected Wednesday's week three days in, got %+v", w)
		}
		st := m.Stats
		if st.Answers != 4 || st.DaysActive != 3 || st.WeeksActive != 3 || st.WeeksSoFar != 5 || st.DaysSoFar != 4*6+3 || st.Deepest != 3 {
			t.Fatalf("expected 4 answers on 3 days in 3 of 5 weeks, 27 question days so far, 3 deepest; got %+v", st)
		}
		themes := map[string]ThemeRead{}
		for _, th := range m.Themes {
			themes[th.Theme] = th
		}
		if themes["habits"].Answers != 2 || themes["anger"].Depth != "deep" || themes["friendship"].Area != "people" {
			t.Fatalf("expected the month's themes, got %+v", m.Themes)
		}
		for date, label := range map[string]string{"2026-11-01": "2026-10", "2026-11-02": "2026-11", "2026-10-01": "2026-10"} {
			if got := getPeriod(t, s, "a", "month", date).Label; got != label {
				t.Fatalf("%s: expected month %s, got %s", date, label, got)
			}
		}
	})

	t.Run("the quarter and the year so far", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "now")

		q := getPeriod(t, s, "a", "quarter", "2026-10-28")
		if q.Label != "2026-Q4" || q.From != octFirst || q.To != "2027-01-03" || q.WeeksTotal != 14 || len(q.Weeks) != 5 {
			t.Fatalf("expected Q4 2026 as fourteen weeks, five so far, got %+v", q)
		}
		y := getPeriod(t, s, "a", "year", "2026-10-28")
		if y.Label != "2026" || y.From != "2025-12-29" || y.To != "2027-01-03" || y.WeeksTotal != 53 || len(y.Weeks) != 44 {
			t.Fatalf("expected 2026 as 53 ISO weeks, 44 so far, got %+v (%d weeks)", y, len(y.Weeks))
		}
		if y.Previous != nil {
			t.Fatalf("a year is never compared with the one before: thirteen months are not kept for it, got %+v", y.Previous)
		}
	})

	t.Run("a week with no record says so, rather than counting as a week off", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "now")
		y := getPeriod(t, s, "a", "year", "2026-10-28")
		kept := 0
		for _, w := range y.Weeks {
			if w.Kept {
				kept++
			} else if w.Monday >= "2026-09-23" || w.Answers != 0 {
				t.Fatalf("only weeks older than the kept answers, with nothing folded, lack a record; got %+v", w)
			}
		}
		if kept != 5 || y.Stats.WeeksSoFar != 5 || y.Stats.DaysSoFar != 4*6+3 {
			t.Fatalf("expected five weeks on record and their days, got %d kept and %+v", kept, y.Stats)
		}
		if m := getPeriod(t, s, "a", "month", "2026-10-28"); m.Previous != nil {
			t.Fatalf("September has weeks with no record, so it is not compared, got %+v", m.Previous)
		}
	})

	t.Run("folding a week changes nothing you see, and outlives the answers", func(t *testing.T) {
		s := mirrorServer("2026-09-29")
		answer(t, s, "a", "2026-09-29", "tidy", "now")
		answer(t, s, "a", "2026-10-06", "call", "wait")
		answer(t, s, "a", "2026-10-13", "night", "b")
		answer(t, s, "a", "2026-10-27", "queue", "boil")
		before := asJSON(t, getPeriod(t, s, "a", "month", "2026-10-28"))

		// On 28 October the weeks of 28 September, 5 and 12 October have been
		// over for at least a week, and all their answers are still kept.
		if n := fold(t, s, "2026-10-28"); n != 3 {
			t.Fatalf("expected three weeks folded, got %d", n)
		}
		if n := fold(t, s, "2026-10-28"); n != 0 {
			t.Fatalf("a week folds once, got %d more", n)
		}
		if after := asJSON(t, getPeriod(t, s, "a", "month", "2026-10-28")); after != before {
			t.Fatalf("folding changed the month:\nbefore %s\nafter  %s", before, after)
		}
		if _, err := s.mirror.DeleteMirrorBefore(context.Background(), "2026-10-19"); err != nil {
			t.Fatal(err)
		}
		if after := asJSON(t, getPeriod(t, s, "a", "month", "2026-10-28")); after != before {
			t.Fatalf("the month lost its folded weeks with the answers:\nbefore %s\nafter  %s", before, after)
		}
	})

	t.Run("the month before, once every week of it is on record", func(t *testing.T) {
		s := mirrorServer("2026-09-15")
		answer(t, s, "a", "2026-09-15", "tidy", "now")
		answer(t, s, "a", "2026-09-16", "call", "call")
		if n := fold(t, s, "2026-10-01"); n != 3 { // 31 August, 7 and 14 September
			t.Fatalf("expected three weeks folded, got %d", n)
		}
		if n := fold(t, s, "2026-10-06"); n != 1 { // 21 September
			t.Fatalf("expected one more week folded, got %d", n)
		}
		answer(t, s, "a", "2026-10-06", "tidy", "pile")

		m := getPeriod(t, s, "a", "month", "2026-10-06")
		p := m.Previous
		if p == nil || m.PreviousLabel != "2026-09" || p.Answers != 2 || p.DaysActive != 2 || p.WeeksActive != 1 || p.WeeksSoFar != 4 {
			t.Fatalf("expected September compared: 2 answers on 2 days in 1 of 4 weeks; got %s %+v", m.PreviousLabel, p)
		}
		if m.Stats.Answers != 1 {
			t.Fatalf("expected one answer this month, got %+v", m.Stats)
		}
	})

	t.Run("the answers that said the most, and the steps that helped, keep their words", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "pile")
		answer(t, s, "a", "2026-10-06", "call", "text") // its option shows no trait of its own
		answer(t, s, "a", "2026-10-06", "queue", "boil")
		answer(t, s, "a", "2026-10-06", "night", "b")
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: "2026-10-06-call", OptionID: "text", Status: "started", Date: "2026-10-06"}), http.StatusOK)
		onDay(s, "2026-10-07")
		expectStatus(t, postStep(t, s, "a", StepRequest{QuestionID: "2026-10-06-call", OptionID: "text", Status: "helped", Date: "2026-10-07"}), http.StatusOK)
		answer(t, s, "a", "2026-10-13", "call", "wait")
		answer(t, s, "a", "2026-10-13", "tidy", "now")

		// The week of 5 October folds and its answers go; the week of 12
		// October is still read from its answers.
		if n := fold(t, s, "2026-10-20"); n != 3 {
			t.Fatalf("expected the weeks of 21 and 28 September and 5 October folded, got %d", n)
		}
		if _, err := s.mirror.DeleteMirrorBefore(context.Background(), "2026-10-12"); err != nil {
			t.Fatal(err)
		}
		m := getPeriod(t, s, "a", "month", "2026-10-20")
		want := []Moment{
			{Prompt: "Someone cuts in front of you in a queue. You…", Label: "Boil inside for an hour", Headline: "A headline about this answer.", Theme: "anger", Lean: 1, Depth: 4, Date: "2026-10-06", Edition: editionNumber("2026-10-06")},
			{Prompt: "A friend goes quiet for a week. You…", Label: "Wonder what I did", Headline: "A headline about this answer.", Theme: "friendship", Lean: 1, Depth: 3, Date: "2026-10-13", Edition: editionNumber("2026-10-13")},
			{Prompt: "Dishes after dinner?", Label: "When the pile is high", Headline: "A headline about this answer.", Theme: "habits", Lean: 1, Depth: 3, Date: "2026-10-06", Edition: editionNumber("2026-10-06")},
		}
		if got, exp := asJSON(t, m.Moments), asJSON(t, want); got != exp {
			t.Fatalf("expected the deepest answers that leaned clearly, newest first among equals:\nwant %s\ngot  %s", exp, got)
		}
		if len(m.Helped) != 1 || m.Helped[0] != (HelpedStep{Theme: "friendship", Step: "Send one light message today.", Started: "2026-10-06"}) {
			t.Fatalf("expected the step that helped, in its own words, got %+v", m.Helped)
		}
		if st := m.Stats; st.StepsStarted != 1 || st.StepsTried != 1 || st.StepsHelped != 1 || st.Answers != 6 || st.Private != 1 {
			t.Fatalf("expected six answers, one private, and one step that helped, got %+v", st)
		}
		if w := m.Weeks[1]; w.Monday != "2026-10-05" || w.Answers != 4 || w.Deepest != 2 || w.StepsTried != 1 {
			t.Fatalf("expected the folded week of 5 October with four answers, two of them the deepest, got %+v", w)
		}
	})

	t.Run("a month is yours alone: other phones change nothing in it", func(t *testing.T) {
		alone, crowded := mirrorServer("2026-10-06"), mirrorServer("2026-10-06")
		for i := range 120 {
			answer(t, crowded, fmt.Sprintf("p%d", i), "2026-10-06", "tidy", []string{"now", "later"}[i%2])
			answer(t, crowded, fmt.Sprintf("p%d", i), "2026-10-13", "queue", "let-go")
		}
		for _, s := range []*Server{alone, crowded} {
			answer(t, s, "a", "2026-10-06", "tidy", "pile")
			answer(t, s, "a", "2026-10-13", "queue", "boil")
			answer(t, s, "a", "2026-10-13", "night", "b")
			aggregate(t, s)
			fold(t, s, "2026-10-20")
		}
		for _, period := range periods {
			mine, theirs := getPeriod(t, alone, "a", period, "2026-10-20"), getPeriod(t, crowded, "a", period, "2026-10-20")
			if a, b := asJSON(t, mine), asJSON(t, theirs); a != b {
				t.Fatalf("other players changed this phone's %s:\nalone   %s\ncrowded %s", period, a, b)
			}
			raw := strings.ToLower(periodRequest(t, crowded, "a", period, "2026-10-20").Body.String())
			for _, word := range []string{"crowd", "player", "percent", "rarest", "minority", "judged", "ranked", "median"} {
				if strings.Contains(raw, word) {
					t.Fatalf("the %s mirror speaks of %q: %s", period, word, raw)
				}
			}
		}
	})

	t.Run("private answers stay private in the summaries", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "night", "b")
		answer(t, s, "a", "2026-10-06", "tidy", "now")
		fold(t, s, "2026-10-20")
		ws, err := s.mirror.WeekSummaries(context.Background(), mirrorKeyOf(s, "a"), "2026-01-01", "2026-12-31")
		if err != nil || len(ws) != 1 {
			t.Fatalf("expected one week summary, got %d (%v)", len(ws), err)
		}
		if raw := asJSON(t, ws); strings.Contains(raw, "night") || strings.Contains(raw, "A private question.") {
			t.Fatalf("a summary must not hold the private question, got %s", raw)
		}
		m := getPeriod(t, s, "a", "month", "2026-10-20")
		var intimacy ThemeRead
		for _, th := range m.Themes {
			if th.Theme == "intimacy" {
				intimacy = th
			}
		}
		if m.Stats.Private != 1 || intimacy.Depth != "private" || intimacy.Answers != 1 {
			t.Fatalf("expected one private answer, shown only as private, got %+v / %+v", m.Stats, intimacy)
		}
	})

	t.Run("trait reads over the period, week by week", func(t *testing.T) {
		s := mirrorServer("2026-10-05")
		answer(t, s, "a", "2026-10-05", "tidy", "now")
		answer(t, s, "a", "2026-10-06", "tidy", "now")
		answer(t, s, "a", "2026-10-12", "tidy", "pile")
		answer(t, s, "a", "2026-10-13", "tidy", "pile")

		m := getPeriod(t, s, "a", "month", "2026-10-14")
		var r PeriodTrait
		for _, tr := range m.Traits {
			if tr.Trait == "conscientiousness" {
				r = tr
			}
		}
		if r.Answers != 4 || r.Score != 50 || r.Solid {
			t.Fatalf("expected an early read of 50 from four answers, got %+v", r)
		}
		if len(r.Weekly) != 3 || r.Weekly[0].Score != nil || *r.Weekly[1].Score != 100 || *r.Weekly[2].Score != 0 || r.Weekly[1].Week != 41 {
			t.Fatalf("expected no read for week 40, 100 for week 41 and 0 for week 42, got %s", asJSON(t, r.Weekly))
		}
		if r.Change == nil || *r.Change != -100 {
			t.Fatalf("expected the later weeks 100 below the earlier ones, got %v", r.Change)
		}
		for _, tr := range m.Traits {
			if tr.Answers < minTraitAnswers {
				t.Fatalf("a trait needs %d answers before it is read, got %+v", minTraitAnswers, tr)
			}
		}
	})

	t.Run("delete everything takes the summaries too", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "now")
		fold(t, s, "2026-10-20")
		expectStatus(t, do(t, s, withDevice(s, httptest.NewRequest(http.MethodDelete, "/api/mirror", nil), "a")), http.StatusNoContent)
		if ws, err := s.mirror.WeekSummaries(context.Background(), mirrorKeyOf(s, "a"), "2026-01-01", "2026-12-31"); err != nil || len(ws) != 0 {
			t.Fatalf("expected no summaries left, got %+v (%v)", ws, err)
		}
		if m := getPeriod(t, s, "a", "month", "2026-10-20"); m.Stats.Answers != 0 || len(m.Themes) != 0 {
			t.Fatalf("expected an empty month after delete, got %+v", m.Stats)
		}
	})

	t.Run("a fold that races delete everything brings nothing back", func(t *testing.T) {
		ctx := context.Background()
		s := mirrorServer("2026-10-06")
		answer(t, s, "a", "2026-10-06", "tidy", "now")
		key := mirrorKeyOf(s, "a")
		answers, steps, err := s.mirror.DeviceHistory(ctx, key, "2026-09-28", "2026-10-11")
		if err != nil {
			t.Fatal(err)
		}
		w := s.summarizeWeek(key, mustDate("2026-10-05"), answers, steps) // read just before the delete
		expectStatus(t, do(t, s, withDevice(s, httptest.NewRequest(http.MethodDelete, "/api/mirror", nil), "a")), http.StatusNoContent)
		if err := s.mirror.SaveWeekSummaries(ctx, []WeekSummary{w}); err != nil {
			t.Fatal(err)
		}
		if ws, err := s.mirror.WeekSummaries(ctx, key, "2026-01-01", "2026-12-31"); err != nil || len(ws) != 0 {
			t.Fatalf("a deleted week came back: %+v (%v)", ws, err)
		}
	})

	t.Run("asks for this phone's token, a known period and a date that is today somewhere", func(t *testing.T) {
		s := mirrorServer("2026-10-06")
		expectError(t, periodRequest(t, s, "", "month", "2026-10-06"), http.StatusUnauthorized, "invalid_device")
		expectError(t, periodRequest(t, s, "a", "decade", "2026-10-06"), http.StatusBadRequest, "invalid_request")
		w := do(t, s, withDevice(s, httptest.NewRequest(http.MethodGet, "/api/mirror/month?date=2026-11-30", nil), "a"))
		expectError(t, w, http.StatusBadRequest, "invalid_request")
		w = periodRequest(t, s, "a", "year", "2026-10-06")
		expectStatus(t, w, http.StatusOK)
		if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") || strings.Contains(cc, "public") {
			t.Fatalf("expected a private, uncached response, got %q", cc)
		}
	})
}

func TestWeekSummaryRetention(t *testing.T) {
	ctx := context.Background()
	st := testStore().(MirrorStore)
	for _, monday := range []string{"2025-09-01", "2026-10-05"} {
		a := MirrorAnswer{DeviceKey: "k", QuestionID: monday + "-tidy", Date: monday, Theme: "habits", OptionID: "now", AnsweredAt: mustDate(monday)}
		if err := st.SaveAnswer(ctx, a); err != nil {
			t.Fatal(err)
		}
		if err := st.SaveWeekSummaries(ctx, []WeekSummary{{DeviceKey: "k", Monday: monday, Answers: 3}}); err != nil {
			t.Fatal(err)
		}
		if err := st.MarkFolded(ctx, monday); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.SaveWeekSummaries(ctx, []WeekSummary{{DeviceKey: "k", Monday: "2026-10-05", Answers: 4}}); err != nil {
		t.Fatal(err)
	}
	if n, err := st.DeleteWeeksBefore(ctx, "2025-10-01"); err != nil || n < 1 {
		t.Fatalf("expected the old summary deleted, got %d (%v)", n, err)
	}
	ws, err := st.WeekSummaries(ctx, "k", "2025-01-01", "2026-12-31")
	if err != nil || len(ws) != 1 || ws[0].Monday != "2026-10-05" || ws[0].Answers != 4 {
		t.Fatalf("expected only the recent summary, rewritten once, got %+v (%v)", ws, err)
	}
	folded, err := st.FoldedWeeks(ctx, "2025-01-01", "2026-12-31")
	if err != nil || len(folded) != 1 || folded[0] != "2026-10-05" {
		t.Fatalf("expected only the recent fold mark, got %v (%v)", folded, err)
	}
	if weekSummaryRetention < (53*7+28)*24*time.Hour {
		t.Fatal("a yearly mirror needs a whole ISO year of summaries, read through the January after it ends")
	}
}
