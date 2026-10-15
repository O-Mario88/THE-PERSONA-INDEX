package main

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// Acceptance tests for the frozen schedule (review of 2026-10-15): changing
// the question bank never changes a date that phones may have seen.

func shippedSchedule(t *testing.T) scheduleFile {
	t.Helper()
	f, err := parseSchedule(scheduleJSON)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

// keptDays resolves the file's days through keep.
func keptDays(t *testing.T, b *contentBank, f scheduleFile, keep string) []planDay {
	t.Helper()
	var out []planDay
	for _, day := range f.Days {
		if day.Date > keep {
			break
		}
		p, err := b.resolve(day)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	return out
}

// bankWithout is the shipped bank less up to n questions of one area, one per
// theme, picked from themes that can spare one.
func bankWithout(t *testing.T, area string, n int) (contentBank, []string) {
	t.Helper()
	var f bankFile
	if err := decodeStrict(questionsJSON, &f); err != nil {
		t.Fatal(err)
	}
	perTheme := map[string]int{}
	for _, q := range f.Questions {
		perTheme[q.Theme]++
	}
	var kept []bankQuestion
	var removed []string
	taken := map[string]bool{}
	for _, q := range f.Questions {
		if len(removed) < n && themes[q.Theme].area == area && themes[q.Theme].care != careIntimate && !taken[q.Theme] && perTheme[q.Theme] > minPerTheme {
			taken[q.Theme] = true
			removed = append(removed, q.ID)
			continue
		}
		kept = append(kept, q)
	}
	raw, err := json.Marshal(bankFile{Questions: kept})
	if err != nil {
		t.Fatal(err)
	}
	b, err := parseContentBank(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != n {
		t.Fatalf("could only remove %d questions", len(removed))
	}
	return b, removed
}

// checkWeek checks the week's rules on every day in days[from:].
func checkWeek(t *testing.T, days []planDay, from int) {
	t.Helper()
	last := map[*bankQuestion]time.Time{}
	for i, p := range days {
		d := mustParseDate(p.date)
		pool := append(append(append([]*bankQuestion{}, p.morning...), p.evening...), p.extras...)
		themesSeen := map[string]bool{}
		for j, q := range pool {
			if i >= from {
				if prev, ok := last[q]; ok && d.Sub(prev) < 7*24*time.Hour {
					t.Fatalf("%s: %s back after %s", p.date, q.ID, d.Sub(prev))
				}
				if j < len(p.morning)+len(p.evening) {
					if themesSeen[q.Theme] {
						t.Fatalf("%s: two %s questions", p.date, q.Theme)
					}
					themesSeen[q.Theme] = true
				}
			}
			last[q] = d
		}
		if i >= from && (len(p.morning) != 3 || len(p.evening) != 3 || len(pool) != poolPerArea*len(areas)) {
			t.Fatalf("%s: %d + %d defaults, %d in the pool", p.date, len(p.morning), len(p.evening), len(pool))
		}
	}
}

// checkLeastRecent checks the dealer's promise on every draw in days[from:]:
// a question comes back only once every other question of its area has come
// up since, apart from ones the theme or week rules passed over at that draw.
func checkLeastRecent(t *testing.T, b *contentBank, days []planDay, from int) {
	t.Helper()
	type draw struct {
		q   *bankQuestion
		day int
	}
	byArea := map[string][]draw{}
	for i, p := range days {
		for _, q := range append(append([]*bankQuestion{}, p.morning...), p.evening...) {
			a := themes[q.Theme].area
			byArea[a] = append(byArea[a], draw{q, i})
		}
	}
	for area, draws := range byArea {
		lastAt := map[*bankQuestion]int{}
		for p2, dr := range draws {
			if p1, ok := lastAt[dr.q]; ok && dr.day >= from {
				since := map[*bankQuestion]bool{}
				for _, x := range draws[p1+1 : p2] {
					since[x.q] = true
				}
				week := map[*bankQuestion]bool{}
				for _, p := range days[max(0, dr.day-poolSpacing):dr.day] {
					for _, q := range p.extras {
						week[q] = true
					}
				}
				for i := range b.byArea[area] {
					r := &b.byArea[area][i]
					if r != dr.q && !since[r] && !week[r] && (p2 == 0 || r.Theme != draws[p2-1].q.Theme) {
						t.Fatalf("%s: %s came back before %s had come up", days[dr.day].date, dr.q.ID, r.ID)
					}
				}
			}
			lastAt[dr.q] = p2
		}
	}
}

func TestFrozenSchedule(t *testing.T) {
	t.Run("the committed schedule is what the bank deals (after changing questions, run `cd backend && go run . schedule`)", func(t *testing.T) {
		b, err := parseContentBank(questionsJSON)
		if err != nil {
			t.Fatal(err)
		}
		f := shippedSchedule(t)
		end := mustParseDate(f.Days[len(f.Days)-1].Date)
		want := b.deal(keptDays(t, &b, f, f.FrozenThrough), end)
		if len(want) != len(f.Days) {
			t.Fatalf("the bank deals %d days through %s, the file has %d: run `cd backend && go run . schedule`", len(want), end.Format(dateLayout), len(f.Days))
		}
		for i, p := range want {
			if !sameDay(p.file(), f.Days[i]) {
				t.Fatalf("content/schedule.json is out of step with the question bank from %s: run `cd backend && go run . schedule` and commit the result", p.date)
			}
		}
		if !bytes.Equal(encodeSchedule(f), scheduleJSON) {
			t.Fatal("content/schedule.json is not in the generator's layout: run `cd backend && go run . schedule`")
		}
	})

	t.Run("there is no edition before edition 1, and every scheduled date is served", func(t *testing.T) {
		b := shippedBank(t)
		for _, date := range []string{"2026-10-10", "2026-10-11", "1970-01-01", "2026-10-12x", "2026-1-12"} {
			if _, ok := b.GetSet(date); ok {
				t.Errorf("%s: expected no set", date)
			}
		}
		f := shippedSchedule(t)
		for _, day := range f.Days {
			set, ok := b.GetSet(day.Date)
			if !ok || len(set.Questions) != len(day.Morning) || set.Questions[0].ID != day.Date+"-"+day.Morning[0] {
				t.Fatalf("%s: not served as scheduled", day.Date)
			}
		}
		past := mustParseDate(f.Days[len(f.Days)-1].Date).AddDate(0, 0, scheduleMemoryDays-1)
		for past.Weekday() == time.Sunday {
			past = past.AddDate(0, 0, -1)
		}
		if _, ok := b.GetSet(past.Format(dateLayout)); !ok {
			t.Fatalf("expected the server to deal on past the file, to %s", past.Format(dateLayout))
		}
	})

	t.Run("past the file the server deals exactly what the generator would have written", func(t *testing.T) {
		b := shippedBank(t)
		f := shippedSchedule(t)
		end := mustParseDate(f.Days[len(f.Days)-1].Date).AddDate(0, 0, 300)
		longer := b.deal(keptDays(t, &b, f, f.FrozenThrough), end)
		for _, p := range longer {
			i, ok := b.planIndex[p.date]
			if !ok || !sameDay(b.plan[i].file(), p.file()) {
				t.Fatalf("%s: the server's plan differs from the generator's", p.date)
			}
		}
	})

	t.Run("a question comes back only after the rest of its area", func(t *testing.T) {
		b := shippedBank(t)
		checkLeastRecent(t, &b, b.plan, 0)
		checkWeek(t, b.plan, 0)
	})

	t.Run("adding questions changes no frozen date, and the new ones come up soon", func(t *testing.T) {
		small, added := bankWithout(t, "everyday", 6)
		full, err := parseContentBank(questionsJSON)
		if err != nil {
			t.Fatal(err)
		}
		// Frozen after a few cycles of the area, as it will be in use: a question
		// added then is the only one never drawn, so it comes up first. (In the
		// first cycle it waits its turn among the ones not drawn yet.)
		keep := fixedNow.AddDate(0, 0, 180)
		var before scheduleFile
		for _, p := range small.deal(nil, fixedNow.AddDate(0, 0, 240)) {
			before.Days = append(before.Days, p.file())
		}
		after, err := full.regenerate(before, keep, fixedNow.AddDate(0, 0, 360))
		if err != nil {
			t.Fatal(err)
		}
		k := 0
		for ; k < len(before.Days) && before.Days[k].Date <= keep.Format(dateLayout); k++ {
			if !sameDay(before.Days[k], after.Days[k]) {
				t.Fatalf("%s changed", before.Days[k].Date)
			}
		}
		if after.FrozenThrough != before.Days[k-1].Date {
			t.Fatalf("expected frozen through %s, got %s", before.Days[k-1].Date, after.FrozenThrough)
		}
		for _, id := range added {
			found := false
			for _, day := range after.Days[k:min(len(after.Days), k+14)] {
				found = found || strings.Contains(strings.Join(append(day.Morning, day.Evening...), " "), id)
			}
			if !found {
				t.Errorf("added question %s did not come up in the fortnight after the freeze", id)
			}
		}
		var days []planDay
		for _, day := range after.Days {
			p, err := full.resolve(day)
			if err != nil {
				t.Fatal(err)
			}
			days = append(days, p)
		}
		checkWeek(t, days, 0)
		checkLeastRecent(t, &full, days, k)
	})

	t.Run("a scheduled question can be reworded but never removed", func(t *testing.T) {
		first := shippedSchedule(t).Days[0].Morning[0]
		var f bankFile
		if err := decodeStrict(questionsJSON, &f); err != nil {
			t.Fatal(err)
		}
		var kept []bankQuestion
		for i := range f.Questions {
			if f.Questions[i].ID == first {
				f.Questions[i].Prompt = strings.TrimSuffix(f.Questions[i].Prompt, "?") + " today?"
			}
		}
		reworded, _ := json.Marshal(f)
		if _, err := loadContentBank(reworded, scheduleJSON); err != nil {
			t.Fatalf("a reworded question should load: %v", err)
		}
		for _, q := range f.Questions {
			if q.ID != first {
				kept = append(kept, q)
			}
		}
		removed, _ := json.Marshal(bankFile{Questions: kept})
		if _, err := loadContentBank(removed, scheduleJSON); err == nil || !strings.Contains(err.Error(), "never removed") {
			t.Fatalf("expected the server to refuse a bank missing %s, got %v", first, err)
		}
	})

	t.Run("the server refuses a hand-edited schedule", func(t *testing.T) {
		f := shippedSchedule(t)
		edits := map[string]func(*scheduleFile){
			"a gap":                   func(f *scheduleFile) { f.Days = append(f.Days[:3:3], f.Days[4:]...) },
			"another epoch":           func(f *scheduleFile) { f.Epoch = "2026-10-05" },
			"two areas swapped":       func(f *scheduleFile) { m := f.Days[0].Morning; m[0], m[1] = m[1], m[0] },
			"a question twice":        func(f *scheduleFile) { f.Days[0].Extras = append(f.Days[0].Extras, f.Days[0].Morning[0]) },
			"intimacy among extras":   func(f *scheduleFile) { f.Days[0].Extras = append(f.Days[0].Extras, f.Days[1].Intimate) },
			"frozen past its end":     func(f *scheduleFile) { f.FrozenThrough = "2099-01-01" },
			"a fourth morning answer": func(f *scheduleFile) { f.Days[0].Morning = append(f.Days[0].Morning, f.Days[0].Extras[0]) },
		}
		for name, edit := range edits {
			g := f
			g.Days = make([]scheduleDay, len(f.Days))
			for i, d := range f.Days {
				d.Morning, d.Evening, d.Extras = append([]string{}, d.Morning...), append([]string{}, d.Evening...), append([]string{}, d.Extras...)
				g.Days[i] = d
			}
			edit(&g)
			b := shippedBank(t) // a copy: applying a schedule replaces only its plan
			if err := b.applySchedule(encodeSchedule(g)); err == nil {
				t.Errorf("%s: expected the server to refuse it", name)
			}
		}
	})

	t.Run("the release check refuses a change to a published or frozen date", func(t *testing.T) {
		base := shippedSchedule(t)
		now := fixedNow
		changed := func(date string) scheduleFile {
			next := base
			next.Days = append([]scheduleDay{}, base.Days...)
			for i, d := range next.Days {
				if d.Date == date {
					d.Extras = append([]string{}, d.Extras[1:]...)
					next.Days[i] = d
				}
			}
			return next
		}
		if err := checkScheduleRelease(base, base, now); err != nil {
			t.Fatalf("an unchanged schedule should pass: %v", err)
		}
		for _, date := range []string{"2026-10-13", "2026-10-17", base.FrozenThrough} {
			if err := checkScheduleRelease(base, changed(date), now); err == nil {
				t.Errorf("a change on %s should fail", date)
			}
		}
		later := mustParseDate(base.FrozenThrough).AddDate(0, 0, 14)
		for later.Weekday() == time.Sunday {
			later = later.AddDate(0, 0, 1)
		}
		if err := checkScheduleRelease(base, changed(later.Format(dateLayout)), now); err != nil {
			t.Errorf("a change after the frozen dates should pass: %v", err)
		}
		short := base
		short.Days = base.Days[:60]
		if err := checkScheduleRelease(base, short, now); err == nil {
			t.Error("a schedule ending within 90 days should fail")
		}
		back := base
		back.FrozenThrough = "2026-10-20"
		if err := checkScheduleRelease(base, back, now); err == nil {
			t.Error("moving the frozen date back should fail")
		}
	})

	t.Run("the schedule command writes, extends and checks the file", func(t *testing.T) {
		dir := t.TempDir()
		t.Chdir(dir)
		if err := os.Mkdir("content", 0o755); err != nil {
			t.Fatal(err)
		}
		var out, errs bytes.Buffer
		if code := runScheduleCommand(nil, fixedNow, &out, &errs); code != 0 {
			t.Fatalf("exit %d: %s", code, errs.String())
		}
		first, err := os.ReadFile(schedulePath)
		if err != nil {
			t.Fatal(err)
		}
		f, err := parseSchedule(first)
		if err != nil || f.FrozenThrough != fixedNow.AddDate(0, 0, scheduleFreezeDays).Format(dateLayout) {
			t.Fatalf("expected frozen through today+%d, got %q (%v)", scheduleFreezeDays, f.FrozenThrough, err)
		}
		if _, err := loadContentBank(questionsJSON, first); err != nil {
			t.Fatalf("the written file does not load: %v", err)
		}
		if err := os.WriteFile("base.json", first, 0o644); err != nil {
			t.Fatal(err)
		}
		// A month later the generator extends the file and keeps what was frozen.
		if code := runScheduleCommand(nil, fixedNow.AddDate(0, 1, 0), &out, &errs); code != 0 {
			t.Fatalf("exit %d: %s", code, errs.String())
		}
		if code := runScheduleCommand([]string{"-check", "base.json"}, fixedNow.AddDate(0, 1, 0), &out, &errs); code != 0 {
			t.Fatalf("the extended file should pass the check, exit %d: %s", code, errs.String())
		}
		g, _ := parseSchedule(func() []byte { b, _ := os.ReadFile(schedulePath); return b }())
		if len(g.Days) <= len(f.Days) || g.FrozenThrough <= f.FrozenThrough {
			t.Fatalf("expected the file extended, got %d days frozen through %s", len(g.Days), g.FrozenThrough)
		}
		// A hand edit to a published date fails the check.
		g.Days[1].Extras = g.Days[1].Extras[1:]
		if err := os.WriteFile(schedulePath, encodeSchedule(g), 0o644); err != nil {
			t.Fatal(err)
		}
		errs.Reset()
		if code := runScheduleCommand([]string{"-check", "base.json"}, fixedNow.AddDate(0, 1, 0), &out, &errs); code != 1 || !strings.Contains(errs.String(), "changes") {
			t.Fatalf("expected the check to fail, exit %d: %s", code, errs.String())
		}
	})

	t.Run("finds a question by its dated id", func(t *testing.T) {
		b := shippedBank(t)
		set, _ := b.GetSet(mon)
		q := set.Pool[len(set.Pool)-2]
		got, ok := b.Question(q.ID)
		if !ok || got.ID != q.ID || got.Prompt != q.Prompt || len(got.Options) != len(q.Options) {
			t.Fatalf("expected %s, got %+v %v", q.ID, got, ok)
		}
		for _, bad := range []string{"", mon, mon + "-", "2026-13-01-" + strings.TrimPrefix(q.ID, mon+"-"), mon + "-no-such-question", "x" + q.ID} {
			if _, ok := b.Question(bad); ok {
				t.Errorf("%q found", bad)
			}
		}
	})
}
