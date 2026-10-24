package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"path"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

// `go run . check` looks over a database without changing it: the schema is
// complete, the tally worker is keeping up, and each retention job is doing
// its work, so nothing is kept longer than docs/data-map.md promises. Run it
// after restoring a backup (docs/backups.md, the restore drill) and whenever
// the metrics look odd. It exits 1 if anything needs a look.

type checkResult struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

type checkReport struct {
	At      string           `json:"at"`
	Results []checkResult    `json:"results"`
	Rows    map[string]int64 `json:"rows"`
}

// checkTables are the tables the server keeps, in the order they are shown.
var checkTables = []string{"votes", "vote_tallies", "mirror_answers", "mirror_steps", "mirror_plan_checks",
	"mirror_weeks", "mirror_folds", "forgotten_devices", "vaults"}

// Slack on each retention check: the hourly jobs may be up to an hour (and a
// day boundary) behind.
const retentionSlack = 26 * time.Hour

func runCheckCommand(ctx context.Context, args []string, st *pgStore, bank contentBank, now time.Time, out, errOut io.Writer) int {
	flags := flag.NewFlagSet("check", flag.ContinueOnError)
	flags.SetOutput(errOut)
	asJSON := flags.Bool("json", false, "print the report as JSON")
	retentionDays := flags.Int("vote-retention-days", int(defaultRetention.Hours()/24), "the VOTE_RETENTION_DAYS the servers run with")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	// A database that cannot be reached is an error, not a report of zeros.
	ping, cancel := context.WithTimeout(ctx, 10*time.Second)
	err := st.pool.Ping(ping)
	cancel()
	if err != nil {
		fmt.Fprintln(errOut, "check: cannot reach the database:", err)
		return 2
	}
	rep, err := checkDatabase(ctx, st, bank, now, time.Duration(*retentionDays)*24*time.Hour)
	if err != nil {
		fmt.Fprintln(errOut, "check:", err)
		return 2
	}
	if *asJSON {
		enc := json.NewEncoder(out)
		enc.SetIndent("", "  ")
		enc.Encode(rep)
	} else {
		fmt.Fprintf(out, "Database check, %s\n\n", rep.At)
		for _, r := range rep.Results {
			mark := "ok     "
			if !r.OK {
				mark = "PROBLEM"
			}
			fmt.Fprintf(out, "%s  %-22s %s\n", mark, r.Name, r.Detail)
		}
		fmt.Fprintln(out, "\nRows kept:")
		for _, t := range checkTables {
			fmt.Fprintf(out, "  %-20s %d\n", t, rep.Rows[t])
		}
	}
	for _, r := range rep.Results {
		if !r.OK {
			return 1
		}
	}
	return 0
}

func checkDatabase(ctx context.Context, st *pgStore, bank contentBank, now time.Time, voteRetention time.Duration) (checkReport, error) {
	rep := checkReport{At: now.UTC().Format(time.RFC3339), Rows: map[string]int64{}}
	add := func(name string, ok bool, format string, a ...any) {
		rep.Results = append(rep.Results, checkResult{name, ok, fmt.Sprintf(format, a...)})
	}
	db := st.pool

	// The schema: every migration this build carries has run, and none is
	// unknown to it (a database from a newer build).
	names, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return rep, err
	}
	var want []string
	for _, n := range names {
		want = append(want, path.Base(n))
	}
	rows, err := db.Query(ctx, `SELECT name FROM schema_migrations ORDER BY name`)
	if err != nil {
		add("schema", false, "no schema_migrations table: this is not a Persona Index database, or it is empty (%v)", err)
		return rep, nil
	}
	have, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return rep, err
	}
	var missing, unknown []string
	for _, n := range want {
		if !slices.Contains(have, n) {
			missing = append(missing, n)
		}
	}
	for _, n := range have {
		if !slices.Contains(want, n) {
			unknown = append(unknown, n)
		}
	}
	switch {
	case len(missing) > 0:
		add("schema", false, "%d of %d migrations not applied: %v (the server applies them when it starts)", len(missing), len(want), missing)
	case len(unknown) > 0:
		add("schema", false, "the database has migrations this build does not know: %v (it was made by a newer build)", unknown)
	default:
		add("schema", true, "all %d migrations applied", len(want))
	}
	if len(missing) > 0 {
		return rep, nil
	}

	for _, t := range checkTables {
		var n int64
		if err := db.QueryRow(ctx, `SELECT count(*) FROM `+pgx.Identifier{t}.Sanitize()).Scan(&n); err != nil {
			return rep, fmt.Errorf("count %s: %w", t, err)
		}
		rep.Rows[t] = n
	}

	// The tally worker: votes still waiting to be counted. Votes keep only
	// their hour, so anything older than two hours is stuck.
	var waiting, stuck int64
	if err := db.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE accepted_at < $1) FROM votes WHERE tallied_at IS NULL`,
		now.Add(-2*time.Hour)).Scan(&waiting, &stuck); err != nil {
		return rep, err
	}
	add("tally backlog", stuck == 0, "%d votes waiting to be counted, %d of them for over two hours", waiting, stuck)

	// Retention: the oldest row of each kind against how long it may be kept.
	type limit struct {
		name, sql string
		keep      time.Duration
		date      bool // the column is a date, not a timestamp
	}
	for _, l := range []limit{
		{"raw votes", `SELECT min(accepted_at) FROM votes WHERE tallied_at IS NOT NULL`, voteRetention, false},
		{"answers", `SELECT min(edition_date) FROM mirror_answers`, mirrorRetention, true},
		{"small steps", `SELECT min(started_on) FROM mirror_steps`, mirrorRetention, true},
		{"plan checks", `SELECT min(checked_on) FROM mirror_plan_checks`, mirrorRetention, true},
		{"weekly notes", `SELECT min(monday) FROM mirror_weeks`, weekSummaryRetention, true},
		{"deleted-phone marks", `SELECT min(forgotten_on) FROM forgotten_devices`, mirrorRetention, true},
		{"backups", `SELECT min(seen_on) FROM vaults`, vaultRetention, true},
	} {
		var oldest *time.Time
		if err := db.QueryRow(ctx, l.sql).Scan(&oldest); err != nil {
			return rep, fmt.Errorf("%s: %w", l.name, err)
		}
		days := int(l.keep.Hours() / 24)
		if oldest == nil {
			add(l.name, true, "none kept (kept up to %d days)", days)
			continue
		}
		age := now.Sub(*oldest)
		if l.date {
			age = now.Sub(oldest.Add(24 * time.Hour)) // a date covers the whole day
		}
		ok := age <= l.keep+retentionSlack
		detail := fmt.Sprintf("oldest is %.1f days old (kept up to %d days)", max(age.Hours()/24, 0), days)
		if !ok {
			detail += "; the retention job is not running, or is failing"
		}
		add(l.name, ok, "%s", detail)
	}

	// The frozen schedule shipped with this build.
	if until := bank.scheduledUntil(); !until.IsZero() {
		left := until.Sub(now).Hours() / 24
		add("frozen schedule", left >= scheduleWarnDays, "dates are fixed until %s (%.0f days ahead; keep it over %d)", until.Format(dateLayout), left, scheduleWarnDays)
	}
	return rep, nil
}
