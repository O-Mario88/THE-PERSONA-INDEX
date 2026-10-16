package main

import (
	"context"
	"io/fs"
	"net/http"
	"os"
	"path"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// Vote store contract tests. They run against the in-memory store always and
// against Postgres too when PERSONA_TEST_DATABASE_URL is set.

func TestVoteRetention(t *testing.T) {
	t.Run("old raw votes are deleted once tallied, and the tallies stay", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)
		aggregate(t, s)
		ctx := context.Background()
		n, err := s.votes.DeleteTalliedBefore(ctx, fixedNow.Add(time.Hour))
		if err != nil || n != 1 {
			t.Fatalf("expected 1 raw vote deleted, got %d (%v)", n, err)
		}
		s.resultCache.clear()
		if got := totalVotes(t, s, "q-dishes"); got != 1 {
			t.Fatalf("expected the tally to keep 1 vote, got %d", got)
		}
	})

	t.Run("untallied votes are never deleted", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)
		n, err := s.votes.DeleteTalliedBefore(context.Background(), fixedNow.Add(time.Hour))
		if err != nil || n != 0 {
			t.Fatalf("expected nothing deleted, got %d (%v)", n, err)
		}
		if got := totalVotes(t, s, "q-dishes"); got != 1 {
			t.Fatalf("expected the vote to be counted, got %d", got)
		}
	})

	t.Run("votes newer than the cutoff are kept", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)
		aggregate(t, s)
		n, err := s.votes.DeleteTalliedBefore(context.Background(), fixedNow.Add(-time.Hour))
		if err != nil || n != 0 {
			t.Fatalf("expected nothing deleted, got %d (%v)", n, err)
		}
	})
}

func TestPostgresDurability(t *testing.T) {
	url := os.Getenv("PERSONA_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set PERSONA_TEST_DATABASE_URL to run against Postgres")
	}
	ctx := context.Background()

	t.Run("an accepted vote survives a restart", func(t *testing.T) {
		s := newTestServer()
		expectStatus(t, postVote(t, s, vote, "k1"), http.StatusAccepted)

		reopened, err := openPGStore(ctx, url, 2)
		if err != nil {
			t.Fatal(err)
		}
		defer reopened.Close()
		after := NewServer(s.clock, fixtureBank{}, reopened, s.devices)
		if n := totalVotes(t, after, "q-dishes"); n != 1 {
			t.Fatalf("expected the vote to survive, got %d", n)
		}
		// The same device still cannot vote again after the restart.
		dup := vote
		dup.OptionID = "when-full"
		expectError(t, postVote(t, after, dup, "k2"), http.StatusConflict, "duplicate_vote")
	})

	t.Run("migrations can run twice, and each is recorded once", func(t *testing.T) {
		if err := testPG.migrate(ctx); err != nil {
			t.Fatal(err)
		}
		rows, err := testPG.pool.Query(ctx, `SELECT name FROM schema_migrations ORDER BY name`)
		if err != nil {
			t.Fatal(err)
		}
		applied, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			t.Fatal(err)
		}
		files, _ := fs.Glob(migrationFS, "migrations/*.sql")
		for i := range files {
			files[i] = path.Base(files[i])
		}
		if !slices.Equal(applied, files) {
			t.Fatalf("expected %v recorded, got %v", files, applied)
		}
	})

	t.Run("a mirror answer keeps no moment, only its date and sitting", func(t *testing.T) {
		var cols []string
		rows, err := testPG.pool.Query(ctx, `SELECT column_name FROM information_schema.columns WHERE table_name = 'mirror_answers'`)
		if err != nil {
			t.Fatal(err)
		}
		if cols, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
			t.Fatal(err)
		}
		for _, c := range cols {
			if strings.Contains(c, "_at") || strings.Contains(c, "time") {
				t.Fatalf("mirror_answers keeps a moment: %s", c)
			}
		}
	})
}

// Migration 005 brings "I learned something" taps into the verdicts. It runs
// here on rows of the old shape, in a schema of its own.
func TestVerdictMigration(t *testing.T) {
	url := os.Getenv("PERSONA_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set PERSONA_TEST_DATABASE_URL to run against Postgres")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := conn.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
	}
	exec(`DROP SCHEMA IF EXISTS verdict_migration CASCADE`)
	exec(`CREATE SCHEMA verdict_migration`)
	defer conn.Exec(context.Background(), `DROP SCHEMA IF EXISTS verdict_migration CASCADE`)
	exec(`SET search_path TO verdict_migration`)

	run := func(name string) {
		t.Helper()
		sql, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		exec(string(sql))
	}
	for _, name := range []string{"001_votes.sql", "002_mirror.sql", "003_mirror_weeks.sql", "004_privacy.sql"} {
		run(name)
	}
	exec(`INSERT INTO mirror_answers (device_key, question_id, edition_date, theme, option_id, depth, evening, learned) VALUES
		('d', 'q-yes', '2026-10-12', 'habits', 'now', 1, false, true),
		('d', 'q-no', '2026-10-12', 'habits', 'now', 1, false, false),
		('d', 'q-none', '2026-10-12', 'habits', 'now', 1, false, NULL)`)
	exec(`INSERT INTO mirror_weeks (device_key, monday, summary) VALUES
		('d', '2026-10-05', '{"answers": 3, "learned": 2, "rated": 3}'),
		('d', '2026-09-28', '{"answers": 1}')`)
	exec(`INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at) VALUES
		('v1', 'rating/q-yes', 'now/learned', 'h1', 'k1', 'x1', now()),
		('v2', 'rating/q-no', 'now/not', 'h2', 'k2', 'x2', now()),
		('v3', 'q-yes', 'learned', 'h3', 'k3', 'x3', now())`)
	exec(`INSERT INTO vote_tallies (question_id, option_id, count) VALUES
		('rating/q-yes', 'now/learned', 5), ('rating/q-yes', 'now/me', 1), ('rating/q-yes', 'now/not', 2),
		('rating/q-no', '~private/learned', 3), ('q-yes', 'learned', 7)`)
	run("005_verdicts.sql")

	texts := func(sql string) []string {
		t.Helper()
		rows, err := conn.Query(ctx, sql)
		if err != nil {
			t.Fatal(err)
		}
		out, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	if got := texts(`SELECT question_id || '=' || coalesce(verdict, '-') FROM mirror_answers ORDER BY question_id`); !slices.Equal(got, []string{"q-no=not_me", "q-none=-", "q-yes=me"}) {
		t.Fatalf("expected learned read as me and not as not_me, got %v", got)
	}
	if got := texts(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'verdict_migration' AND table_name = 'mirror_answers' AND column_name = 'learned'`); len(got) != 0 {
		t.Fatal("expected the learned column gone")
	}
	if got := texts(`SELECT monday::text || '=' || summary::text FROM mirror_weeks ORDER BY monday`); !slices.Equal(got, []string{`2026-09-28={"answers": 1}`, `2026-10-05={"me": 2, "rated": 3, "answers": 3}`}) {
		t.Fatalf("expected week summaries counting me, got %v", got)
	}
	if got := texts(`SELECT question_id || '=' || option_id FROM votes ORDER BY id`); !slices.Equal(got, []string{"rating/q-yes=now/me", "rating/q-no=now/not", "q-yes=learned"}) {
		t.Fatalf("expected rating votes renamed and nothing else, got %v", got)
	}
	if got := texts(`SELECT question_id || '=' || option_id || '=' || count FROM vote_tallies ORDER BY question_id, option_id`); !slices.Equal(got, []string{
		"q-yes=learned=7", "rating/q-no=~private/me=3", "rating/q-yes=now/me=6", "rating/q-yes=now/not=2",
	}) {
		t.Fatalf("expected rating tallies merged into me, got %v", got)
	}
	if _, err := conn.Exec(ctx, `UPDATE mirror_answers SET verdict = 'learned' WHERE question_id = 'q-none'`); err == nil {
		t.Fatal("expected a verdict outside me, partly and not_me refused")
	}
}
