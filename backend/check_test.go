package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"strings"
	"testing"
	"time"
)

// pgOnly is the shared Postgres store, freshly emptied, or a skip.
func pgOnly(t *testing.T) *pgStore {
	t.Helper()
	if os.Getenv("PERSONA_TEST_DATABASE_URL") == "" {
		t.Skip("set PERSONA_TEST_DATABASE_URL to run against Postgres")
	}
	testStore()
	return testPG
}

func TestRetentionDeletesInBatches(t *testing.T) {
	st := pgOnly(t)
	ctx := context.Background()
	defer func(n int) { retentionBatch = n }(retentionBatch)
	retentionBatch = 7

	old := fixedNow.Add(-40 * 24 * time.Hour)
	for i := range 23 {
		if _, err := st.pool.Exec(ctx, `INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at, tallied_at)
			VALUES ($1, 'q', 'o', $2, 'k', $1, $3, $3)`, fmt.Sprintf("old-%d", i), fmt.Sprintf("h%d", i), old); err != nil {
			t.Fatal(err)
		}
		if _, err := st.pool.Exec(ctx, `INSERT INTO mirror_answers (device_key, question_id, edition_date, theme, option_id, depth)
			VALUES ($1, 'q', $2, 'home', 'o', 1)`, fmt.Sprintf("d%d", i), old.Format(dateLayout)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.pool.Exec(ctx, `INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at, tallied_at)
		VALUES ('new', 'q', 'o', 'hn', 'k', 'new', $1, $1)`, fixedNow); err != nil {
		t.Fatal(err)
	}

	n, err := st.DeleteTalliedBefore(ctx, fixedNow.Add(-7*24*time.Hour))
	if err != nil || n != 23 {
		t.Fatalf("deleted %d votes (%v), want 23 in batches of 7", n, err)
	}
	n, err = st.DeleteMirrorBefore(ctx, fixedNow.Add(-mirrorRetention).Format(dateLayout))
	if err != nil || n != 23 {
		t.Fatalf("deleted %d answers (%v), want 23", n, err)
	}
	var left int
	st.pool.QueryRow(ctx, `SELECT count(*) FROM votes`).Scan(&left)
	if left != 1 {
		t.Errorf("%d votes left, want only the new one", left)
	}
}

func TestDatabaseCheck(t *testing.T) {
	st := pgOnly(t)
	ctx := context.Background()
	bank, err := loadShippedBank()
	if err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) (int, string) {
		var out, errOut bytes.Buffer
		code := runCheckCommand(ctx, args, st, bank, fixedNow, &out, &errOut)
		return code, out.String() + errOut.String()
	}

	code, out := run()
	if code != 0 || strings.Contains(out, "PROBLEM") {
		t.Fatalf("an empty, migrated database: exit %d\n%s", code, out)
	}
	migrations, _ := fs.Glob(migrationFS, "migrations/*.sql")
	for _, want := range []string{fmt.Sprintf("all %d migrations applied", len(migrations)), "tally backlog", "raw votes", "backups", "frozen schedule", "Rows kept:"} {
		if !strings.Contains(out, want) {
			t.Errorf("report lacks %q:\n%s", want, out)
		}
	}

	// A raw vote kept past its time means retention is not running.
	if _, err := st.pool.Exec(ctx, `INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at, tallied_at)
		VALUES ('stale', 'q', 'o', 'h', 'k', 'stale', $1, $1)`, fixedNow.Add(-20*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	// And one stuck uncounted for hours means the tally worker is not.
	if _, err := st.pool.Exec(ctx, `INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at)
		VALUES ('stuck', 'q', 'o', 'h2', 'k', 'stuck', $1)`, fixedNow.Add(-5*time.Hour)); err != nil {
		t.Fatal(err)
	}
	code, out = run("-json")
	if code != 1 {
		t.Errorf("exit %d, want 1", code)
	}
	var rep checkReport
	if err := json.Unmarshal([]byte(out), &rep); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	failed := map[string]bool{}
	for _, r := range rep.Results {
		if !r.OK {
			failed[r.Name] = true
		}
	}
	if !failed["raw votes"] || !failed["tally backlog"] || len(failed) != 2 {
		t.Errorf("problems = %v, want raw votes and tally backlog", failed)
	}
	if rep.Rows["votes"] != 2 {
		t.Errorf("rows = %v", rep.Rows)
	}

	// A database missing a migration (an old backup) says so.
	if _, err := st.pool.Exec(ctx, `DELETE FROM schema_migrations WHERE name = '006_keep.sql'`); err != nil {
		t.Fatal(err)
	}
	defer st.pool.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ('006_keep.sql') ON CONFLICT DO NOTHING`)
	code, out = run()
	if code != 1 || !strings.Contains(out, "006_keep.sql") {
		t.Errorf("missing migration: exit %d\n%s", code, out)
	}
}

// The database commands need only DATABASE_URL, so a restored backup can be
// checked without the production secrets.
func TestDatabaseCommandsNeedOnlyTheDatabase(t *testing.T) {
	var out, errOut bytes.Buffer
	none := func(string) string { return "" }
	if code := runDatabaseCommand(context.Background(), "check", nil, none, &out, &errOut); code != 2 || !strings.Contains(errOut.String(), "DATABASE_URL") {
		t.Errorf("without a database: exit %d, %q", code, errOut.String())
	}
	pgOnly(t)
	url := os.Getenv("PERSONA_TEST_DATABASE_URL")
	onlyURL := func(k string) string {
		if k == "DATABASE_URL" {
			return url
		}
		return ""
	}
	out.Reset()
	errOut.Reset()
	if code := runDatabaseCommand(context.Background(), "check", nil, onlyURL, &out, &errOut); code != 0 {
		t.Errorf("check with only DATABASE_URL: exit %d\n%s%s", code, out.String(), errOut.String())
	}
	// A database that is not there is an error, never a report of zero rows.
	out.Reset()
	errOut.Reset()
	missing := func(k string) string {
		if k == "DATABASE_URL" {
			return strings.Replace(url, "/persona_test", "/persona_no_such_database", 1)
		}
		return ""
	}
	if code := runDatabaseCommand(context.Background(), "check", nil, missing, &out, &errOut); code != 2 || out.Len() != 0 || !strings.Contains(errOut.String(), "cannot reach") {
		t.Errorf("missing database: exit %d, out %q, err %q", code, out.String(), errOut.String())
	}
}
