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
