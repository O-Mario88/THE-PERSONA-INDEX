package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgStore is the production vote store. The insert is the moment a vote is
// durably accepted; unique keys make retries and duplicates safe without any
// locking in Go. Untallied rows are the queue the tally worker drains, which
// is enough until a load test shows otherwise (decided 2026-10-14).

//go:embed migrations/*.sql
var migrationFS embed.FS

type pgStore struct{ pool *pgxpool.Pool }

// openPGStore connects with a bounded pool, so a traffic spike queues inside
// the pool instead of exhausting database connections, then migrates.
func openPGStore(ctx context.Context, url string, maxConns int32) (*pgStore, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = maxConns
	cfg.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	st := &pgStore{pool: pool}
	if err := st.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return st, nil
}

func (p *pgStore) Close() { p.pool.Close() }

// migrate applies every embedded migration in order under an advisory lock,
// so several instances starting at once do not race. Migrations are written
// to be safe to re-run.
func (p *pgStore) migrate(ctx context.Context) error {
	names, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return err
	}
	slices.Sort(names)
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock(7177001)`); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock(7177001)`)
	for _, name := range names {
		sql, err := migrationFS.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err := conn.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
	}
	return nil
}

func (p *pgStore) Accept(ctx context.Context, idempotencyKey string, v Vote, at time.Time) (VoteEvent, error) {
	e := VoteEvent{ID: newEventID(), QuestionID: v.QuestionID, OptionID: v.OptionID, VoterHash: v.VoterHash, AcceptedAt: at}
	tag, err := p.pool.Exec(ctx, `
		INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT DO NOTHING`,
		e.ID, v.QuestionID, v.OptionID, v.VoterHash, idempotencyKey, voteDedupeKey(v), at)
	if err != nil {
		return VoteEvent{}, err
	}
	if tag.RowsAffected() == 1 {
		return e, nil
	}

	// A conflict: either a retry of this exact request or a second vote.
	// ON CONFLICT waited for any concurrent insert to commit, so the row that
	// won is visible here.
	var prior VoteEvent
	err = p.pool.QueryRow(ctx, `
		SELECT id, question_id, option_id, voter_hash, accepted_at FROM votes
		WHERE voter_hash = $1 AND idem_key = $2`, v.VoterHash, idempotencyKey,
	).Scan(&prior.ID, &prior.QuestionID, &prior.OptionID, &prior.VoterHash, &prior.AcceptedAt)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return VoteEvent{}, ErrDuplicateVote
	case err != nil:
		return VoteEvent{}, err
	case prior.QuestionID != v.QuestionID || prior.OptionID != v.OptionID:
		return VoteEvent{}, ErrIdempotencyKeyReuse
	default:
		return prior, nil
	}
}

// Tally claims a batch with SKIP LOCKED, marks it tallied and adds it to the
// counts in one statement, so a crash leaves either all or none of the batch
// counted, and parallel workers never claim the same vote.
func (p *pgStore) Tally(ctx context.Context, limit int) (int, error) {
	var n int
	err := p.pool.QueryRow(ctx, `
		WITH claimed AS (
			SELECT id FROM votes
			WHERE tallied_at IS NULL
			ORDER BY accepted_at
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		), marked AS (
			UPDATE votes SET tallied_at = now()
			FROM claimed WHERE votes.id = claimed.id
			RETURNING votes.question_id, votes.option_id
		), added AS (
			INSERT INTO vote_tallies (question_id, option_id, count)
			SELECT question_id, option_id, count(*) FROM marked GROUP BY 1, 2
			ON CONFLICT (question_id, option_id)
			DO UPDATE SET count = vote_tallies.count + EXCLUDED.count
		)
		SELECT count(*) FROM marked`, limit).Scan(&n)
	return n, err
}

func (p *pgStore) Counts(ctx context.Context, questionID string) (map[string]int, error) {
	rows, err := p.pool.Query(ctx, `SELECT option_id, count FROM vote_tallies WHERE question_id = $1`, questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var opt string
		var n int64
		if err := rows.Scan(&opt, &n); err != nil {
			return nil, err
		}
		out[opt] = int(n)
	}
	return out, rows.Err()
}

func (p *pgStore) DeleteTalliedBefore(ctx context.Context, cutoff time.Time) (int, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM votes WHERE tallied_at IS NOT NULL AND accepted_at < $1`, cutoff)
	return int(tag.RowsAffected()), err
}

func (p *pgStore) truncateForTests(ctx context.Context) error {
	_, err := p.pool.Exec(ctx, `TRUNCATE votes, vote_tallies`)
	return err
}
