package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"slices"
	"time"
)

// The frozen schedule (review of 2026-10-15). Which questions each date
// brings is dealt once and committed in content/schedule.json, one line per
// question day. The server serves that file as it is, so adding, rewording or
// reordering questions never changes a date a phone may already have seen:
// before the file existed, growing an area re-dealt every past and future
// edition, and a person's mirror could point at questions they never had.
//
// The dealer is least-recently-used per life area: each draw takes the area's
// question that has gone longest without coming up (one never drawn first, in
// the area's fixed order), passing over one that shares the theme of the
// area's last draw or came up in the past week. With the bank unchanged it
// repeats the area's fixed order cycle after cycle, so no question comes back
// until its whole area has; a question added later is new, so it comes up
// within its area's next few draws.
//
// Who changes what:
//   - `go run . schedule` (from backend/) keeps every date through
//     max(frozenThrough, today+scheduleFreezeDays) exactly as it is and deals
//     the rest afresh from the bank, through today+scheduleHorizonDays.
//     Run it after any change to the bank; TestScheduleMatchesBank fails
//     until you do.
//   - `go run . schedule -check <base file>` is the release check CI runs
//     against the base branch's file: no date through
//     max(base frozenThrough, today+scheduleProtectDays) may change.
//   - The server checks the whole file at start and refuses to start if a
//     date names a question the bank no longer has. A question that was ever
//     scheduled can be reworded, never removed.
//   - Past the end of the file the server deals on in memory, exactly as the
//     generator would have, and warns when the file ends within
//     scheduleWarnDays: those days are not frozen until the file covers them.

//go:embed content/schedule.json
var scheduleJSON []byte

const (
	scheduleVersion = 1
	// scheduleFreezeDays: the generator never changes a date this close to
	// today, and scheduleProtectDays: the release check refuses a change this
	// close to its own today. The gap is a week of slack between generating
	// the file and merging it.
	scheduleFreezeDays  = 14
	scheduleProtectDays = 7
	scheduleHorizonDays = 548 // how far ahead the generator writes: about 18 months
	scheduleWarnDays    = 90
	scheduleMemoryDays  = 3 * 365 // how far past the file's end the server deals in memory
	schedulePath        = "content/schedule.json"
)

type scheduleFile struct {
	Version       int           `json:"version"`
	Epoch         string        `json:"epoch"`
	FrozenThrough string        `json:"frozenThrough"`
	Days          []scheduleDay `json:"days"`
}

// scheduleDay is one question day, in bank ids: the morning's and the
// evening's defaults in area order, the extra pool questions, and the one
// intimacy question.
type scheduleDay struct {
	Date     string   `json:"date"`
	Morning  []string `json:"morning"`
	Evening  []string `json:"evening"`
	Extras   []string `json:"extras"`
	Intimate string   `json:"intimate,omitempty"`
}

// planDay is a scheduleDay with its questions resolved against the bank.
type planDay struct {
	date                     string
	k                        int // questionDay: sets which area rests in each half
	morning, evening, extras []*bankQuestion
	intimate                 *bankQuestion
}

// nextQuestionDate is the first date after d that brings questions.
func nextQuestionDate(d time.Time) time.Time {
	d = d.AddDate(0, 0, 1)
	if d.Weekday() == time.Sunday {
		d = d.AddDate(0, 0, 1)
	}
	return d
}

func unixDay(d time.Time) int { return int(d.Unix() / 86400) }

func mustParseDate(s string) time.Time {
	d, err := time.Parse(dateLayout, s)
	if err != nil {
		panic(err)
	}
	return d
}

// parseSchedule decodes the file strictly and checks its frame: version,
// epoch, and consecutive question days from the epoch.
func parseSchedule(raw []byte) (scheduleFile, error) {
	var f scheduleFile
	if err := decodeStrict(raw, &f); err != nil {
		return f, fmt.Errorf("schedule: %w", err)
	}
	if f.Version != scheduleVersion {
		return f, fmt.Errorf("schedule: version %d, want %d", f.Version, scheduleVersion)
	}
	if f.Epoch != editionEpoch {
		return f, fmt.Errorf("schedule: starts on %s but edition 1 is %s; run go run . schedule", f.Epoch, editionEpoch)
	}
	want := mustParseDate(editionEpoch)
	for _, day := range f.Days {
		if day.Date != want.Format(dateLayout) {
			return f, fmt.Errorf("schedule: expected %s next, found %s", want.Format(dateLayout), day.Date)
		}
		want = nextQuestionDate(want)
	}
	if f.FrozenThrough != "" {
		if _, err := time.Parse(dateLayout, f.FrozenThrough); err != nil {
			return f, fmt.Errorf("schedule: frozenThrough: %w", err)
		}
		if len(f.Days) == 0 || f.FrozenThrough > f.Days[len(f.Days)-1].Date {
			return f, fmt.Errorf("schedule: frozen through %s, past its last day", f.FrozenThrough)
		}
	}
	return f, nil
}

// resolve checks one day against the bank and the week's rules.
func (b *contentBank) resolve(day scheduleDay) (planDay, error) {
	d := mustParseDate(day.Date)
	p := planDay{date: day.Date, k: questionDay(unixDay(d))}
	seen := map[*bankQuestion]bool{}
	get := func(id, what string) (*bankQuestion, error) {
		q := b.byID[id]
		if q == nil {
			return nil, fmt.Errorf("schedule %s: %s question %q is not in the bank (a scheduled question can be reworded, never removed)", day.Date, what, id)
		}
		if seen[q] {
			return nil, fmt.Errorf("schedule %s: %q twice", day.Date, id)
		}
		seen[q] = true
		return q, nil
	}
	for h, half := range []struct {
		ids []string
		out *[]*bankQuestion
	}{{day.Morning, &p.morning}, {day.Evening, &p.evening}} {
		j := 0
		for ai, area := range areas {
			if rests(ai, p.k, h) {
				continue
			}
			if j >= len(half.ids) {
				return p, fmt.Errorf("schedule %s: half %d has no %s question", day.Date, h, area)
			}
			q, err := get(half.ids[j], "default")
			if err != nil {
				return p, err
			}
			if themes[q.Theme].area != area || themes[q.Theme].care == careIntimate {
				return p, fmt.Errorf("schedule %s: %q is not a %s question", day.Date, q.ID, area)
			}
			*half.out = append(*half.out, q)
			j++
		}
		if j != len(half.ids) {
			return p, fmt.Errorf("schedule %s: half %d has %d questions, want %d", day.Date, h, len(half.ids), j)
		}
	}
	for _, id := range day.Extras {
		q, err := get(id, "extra")
		if err != nil {
			return p, err
		}
		if themes[q.Theme].care == careIntimate {
			return p, fmt.Errorf("schedule %s: intimate %q among the extras", day.Date, q.ID)
		}
		p.extras = append(p.extras, q)
	}
	switch {
	case day.Intimate == "" && len(b.intimate) > 0:
		return p, fmt.Errorf("schedule %s: no intimacy question", day.Date)
	case day.Intimate != "":
		q, err := get(day.Intimate, "intimacy")
		if err != nil {
			return p, err
		}
		if themes[q.Theme].care != careIntimate {
			return p, fmt.Errorf("schedule %s: %q is not an intimacy question", day.Date, q.ID)
		}
		p.intimate = q
	}
	return p, nil
}

func (p planDay) file() scheduleDay {
	ids := func(qs []*bankQuestion) []string {
		out := make([]string, len(qs))
		for i, q := range qs {
			out[i] = q.ID
		}
		return out
	}
	d := scheduleDay{Date: p.date, Morning: ids(p.morning), Evening: ids(p.evening), Extras: ids(p.extras)}
	if p.intimate != nil {
		d.Intimate = p.intimate.ID
	}
	return d
}

// dealer deals question days in order after the days it was given.
type dealer struct {
	b     *contentBank
	pos   map[*bankQuestion]int // place in its area's fixed order
	last  map[*bankQuestion]int // number of its latest draw; 0 for never
	draws int
	prev  map[string]string // each area's latest theme
	pool  map[string][]int  // each area's fixed order for extras
	days  []planDay
}

func newDealer(b *contentBank) *dealer {
	d := &dealer{b: b, pos: map[*bankQuestion]int{}, last: map[*bankQuestion]int{}, prev: map[string]string{}, pool: map[string][]int{}}
	for _, area := range areas {
		for p, i := range b.order[area] {
			d.pos[&b.byArea[area][i]] = p
		}
		d.pool[area] = shuffled(len(b.byArea[area]), area+"/pool", 0)
	}
	for p, i := range shuffled(len(b.intimate), "intimate/pool", 0) {
		d.pos[&b.intimate[i]] = p
	}
	return d
}

func (d *dealer) note(q *bankQuestion) {
	d.draws++
	d.last[q] = d.draws
	d.prev[themes[q.Theme].area] = q.Theme
}

// add appends a day that was given rather than dealt, as if it had been dealt.
func (d *dealer) add(p planDay) {
	for _, q := range append(append([]*bankQuestion{}, p.morning...), p.evening...) {
		d.note(q)
	}
	if p.intimate != nil {
		d.note(p.intimate)
	}
	d.days = append(d.days, p)
}

// older reports whether x has gone longer than y without coming up.
func (d *dealer) older(x, y *bankQuestion) bool {
	if d.last[x] != d.last[y] {
		return d.last[x] < d.last[y]
	}
	return d.pos[x] < d.pos[y]
}

// leastRecent is the question in qs that has gone longest without coming up,
// passing over the blocked and, while any other is left, the theme to avoid.
func (d *dealer) leastRecent(qs []bankQuestion, blocked map[*bankQuestion]bool, avoidTheme string) *bankQuestion {
	var best, other *bankQuestion
	for _, skipBlocked := range []bool{true, false} { // a bank too small to pass over anything takes the least recent
		for i := range qs {
			q := &qs[i]
			if skipBlocked && blocked[q] {
				continue
			}
			if best == nil || d.older(q, best) {
				best = q
			}
			if q.Theme != avoidTheme && (other == nil || d.older(q, other)) {
				other = q
			}
		}
		if other != nil {
			return other
		}
		if best != nil {
			return best
		}
	}
	return nil
}

// recent is every question in the pools of the poolSpacing question days
// before day i, as far as they are known yet.
func (d *dealer) recent(i int) map[*bankQuestion]bool {
	out := map[*bankQuestion]bool{}
	for _, p := range d.days[max(0, i-poolSpacing):i] {
		for _, q := range append(append(append([]*bankQuestion{}, p.morning...), p.evening...), p.extras...) {
			out[q] = true
		}
		if p.intimate != nil {
			out[p.intimate] = true
		}
	}
	return out
}

// dealDefaults deals one day's defaults and intimacy question, after the last day.
func (d *dealer) dealDefaults(date time.Time) {
	p := planDay{date: date.Format(dateLayout), k: questionDay(unixDay(date))}
	blocked := d.recent(len(d.days))
	for h, half := range []*[]*bankQuestion{&p.morning, &p.evening} {
		for ai, area := range areas {
			if rests(ai, p.k, h) {
				continue
			}
			q := d.leastRecent(d.b.byArea[area], blocked, d.prev[area])
			d.note(q)
			blocked[q] = true
			*half = append(*half, q)
		}
	}
	if len(d.b.intimate) > 0 {
		p.intimate = d.leastRecent(d.b.intimate, blocked, "")
		d.note(p.intimate)
	}
	d.days = append(d.days, p)
}

// The edition pool: both halves' defaults plus extras, so each phone can
// pick its own three for each half by the person's interests (computed on
// the phone). Extras come from a second fixed order per area, poolPerArea
// places a day, so every area offers poolPerArea questions in all. An extra
// is passed over if it is a default within poolSpacing question days or was
// in the pool in the poolSpacing days before, so nobody sees a question twice
// in a week.
const (
	poolPerArea = 4
	poolSpacing = 6
)

// dealExtras fills in day i's extras. The defaults must be dealt through day
// i+poolSpacing first.
func (d *dealer) dealExtras(i int) {
	p := &d.days[i]
	skip := d.recent(i)
	for _, n := range d.days[i:min(len(d.days), i+poolSpacing+1)] {
		for _, q := range append(append([]*bankQuestion{}, n.morning...), n.evening...) {
			skip[q] = true
		}
	}
	for _, area := range areas {
		qs := d.b.byArea[area]
		want := poolPerArea
		for _, q := range append(append([]*bankQuestion{}, p.morning...), p.evening...) {
			if themes[q.Theme].area == area {
				want--
			}
		}
		order, start := d.pool[area], poolPerArea*p.k
		for j := 0; j < len(qs) && want > 0; j++ {
			q := &qs[order[(start+j)%len(qs)]]
			if !skip[q] {
				p.extras = append(p.extras, q)
				skip[q] = true
				want--
			}
		}
	}
}

// deal returns the given days followed by freshly dealt question days
// through the last one on or before through.
func (b *contentBank) deal(given []planDay, through time.Time) []planDay {
	d := newDealer(b)
	for _, p := range given {
		d.add(p)
	}
	next := mustParseDate(editionEpoch)
	if len(given) > 0 {
		next = nextQuestionDate(mustParseDate(given[len(given)-1].date))
	}
	first, end := len(d.days), len(d.days)
	for ; !next.After(through) || len(d.days) < end+poolSpacing; next = nextQuestionDate(next) {
		d.dealDefaults(next)
		if !next.After(through) {
			end = len(d.days)
		}
	}
	for i := first; i < end; i++ {
		d.dealExtras(i)
	}
	return d.days[:end]
}

// applySchedule resolves the committed file and deals on past its end in
// memory. Every date in the file must resolve.
func (b *contentBank) applySchedule(raw []byte) error {
	var given []planDay
	end := mustParseDate(editionEpoch).AddDate(0, 0, -1)
	if raw != nil {
		f, err := parseSchedule(raw)
		if err != nil {
			return err
		}
		for _, day := range f.Days {
			p, err := b.resolve(day)
			if err != nil {
				return err
			}
			given = append(given, p)
		}
		if len(given) > 0 {
			end = mustParseDate(given[len(given)-1].date)
		}
		b.fileEnd = end
	}
	b.plan = b.deal(given, end.AddDate(0, 0, scheduleMemoryDays))
	b.planIndex = make(map[string]int, len(b.plan))
	for i, p := range b.plan {
		b.planIndex[p.date] = i
	}
	return nil
}

// scheduledUntil is the last date the committed file freezes.
func (b contentBank) scheduledUntil() time.Time { return b.fileEnd }

// encodeSchedule writes one line per day, so a change shows as the days it changes.
func encodeSchedule(f scheduleFile) []byte {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "{\"version\":%d,\"epoch\":%q,\"frozenThrough\":%q,\"days\":[\n", f.Version, f.Epoch, f.FrozenThrough)
	for i, day := range f.Days {
		line, err := json.Marshal(day)
		if err != nil {
			panic(err) // only strings and string slices
		}
		buf.Write(line)
		if i < len(f.Days)-1 {
			buf.WriteByte(',')
		}
		buf.WriteByte('\n')
	}
	buf.WriteString("]}\n")
	return buf.Bytes()
}

// regenerate keeps the file's days through keep and deals the rest from the
// bank through through. Kept days must still resolve; later ones are dealt
// afresh, so they may name questions the bank no longer has.
func (b *contentBank) regenerate(old scheduleFile, keep, through time.Time) (scheduleFile, error) {
	var given []planDay
	for _, day := range old.Days {
		if mustParseDate(day.Date).After(keep) {
			break
		}
		p, err := b.resolve(day)
		if err != nil {
			return scheduleFile{}, err
		}
		given = append(given, p)
	}
	f := scheduleFile{Version: scheduleVersion, Epoch: editionEpoch}
	for _, p := range b.deal(given, through) {
		f.Days = append(f.Days, p.file())
	}
	// Everything through keep is frozen from now on, kept or newly dealt.
	for _, day := range f.Days {
		if mustParseDate(day.Date).After(keep) {
			break
		}
		f.FrozenThrough = day.Date
	}
	return f, nil
}

// laterDate is the later of a date string ("" for none) and t, as a date.
func laterDate(s string, t time.Time) time.Time {
	t = mustParseDate(t.UTC().Format(dateLayout))
	if d, err := time.Parse(dateLayout, s); err == nil && d.After(t) {
		return d
	}
	return t
}

// checkScheduleRelease compares the new file with the base branch's: no
// date through max(base frozenThrough, today+scheduleProtectDays) may
// change, and the new file must reach scheduleWarnDays past today.
func checkScheduleRelease(base, next scheduleFile, now time.Time) error {
	protect := laterDate(base.FrozenThrough, now.AddDate(0, 0, scheduleProtectDays))
	byDate := map[string]scheduleDay{}
	for _, day := range next.Days {
		byDate[day.Date] = day
	}
	var changed []string
	for _, day := range base.Days {
		if mustParseDate(day.Date).After(protect) {
			break
		}
		if got, ok := byDate[day.Date]; !ok || !sameDay(day, got) {
			changed = append(changed, day.Date)
		}
	}
	if len(changed) > 0 {
		return fmt.Errorf("the schedule changes %d published or soon-published dates (first %s); keep them as they are on the base branch", len(changed), changed[0])
	}
	if next.FrozenThrough < base.FrozenThrough {
		return fmt.Errorf("frozenThrough moved back from %s to %s", base.FrozenThrough, next.FrozenThrough)
	}
	if len(next.Days) == 0 || mustParseDate(next.Days[len(next.Days)-1].Date).Before(now.AddDate(0, 0, scheduleWarnDays)) {
		return fmt.Errorf("the schedule ends within %d days; run go run . schedule", scheduleWarnDays)
	}
	return nil
}

func sameDay(a, b scheduleDay) bool {
	return a.Date == b.Date && a.Intimate == b.Intimate &&
		slices.Equal(a.Morning, b.Morning) && slices.Equal(a.Evening, b.Evening) && slices.Equal(a.Extras, b.Extras)
}

// runScheduleCommand is `go run . schedule [-check base.json]`, run from backend/.
func runScheduleCommand(args []string, now time.Time, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("schedule", flag.ContinueOnError)
	fs.SetOutput(stderr)
	check := fs.String("check", "", "compare "+schedulePath+" with this base file instead of writing it")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	fail := func(err error) int {
		fmt.Fprintln(stderr, "schedule:", err)
		return 1
	}
	b, err := parseContentBank(questionsJSON)
	if err != nil {
		return fail(err)
	}
	raw, err := os.ReadFile(schedulePath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fail(err)
	}

	if *check != "" {
		next, err := parseSchedule(raw)
		if err != nil {
			return fail(err)
		}
		if err := b.applySchedule(raw); err != nil {
			return fail(err)
		}
		baseRaw, err := os.ReadFile(*check)
		if err != nil {
			return fail(err)
		}
		base, err := parseSchedule(baseRaw)
		if err != nil {
			return fail(fmt.Errorf("base: %w", err))
		}
		if err := checkScheduleRelease(base, next, now); err != nil {
			return fail(err)
		}
		fmt.Fprintf(stdout, "schedule: no published date changes; frozen through %s, ends %s\n", next.FrozenThrough, next.Days[len(next.Days)-1].Date)
		return 0
	}

	var old scheduleFile
	if raw != nil {
		// A bad frame means a hand edit; regenerate only from a sound file.
		if old, err = parseSchedule(raw); err != nil {
			return fail(err)
		}
	}
	keep := laterDate(old.FrozenThrough, now.AddDate(0, 0, scheduleFreezeDays))
	f, err := b.regenerate(old, keep, now.AddDate(0, 0, scheduleHorizonDays))
	if err != nil {
		return fail(err)
	}
	if err := os.WriteFile(schedulePath, encodeSchedule(f), 0o644); err != nil {
		return fail(err)
	}
	fmt.Fprintf(stdout, "schedule: wrote %d question days through %s, frozen through %s\n", len(f.Days), f.Days[len(f.Days)-1].Date, f.FrozenThrough)
	return 0
}
