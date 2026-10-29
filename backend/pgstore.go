package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"strconv"
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

// Statement limits. A query that runs longer than this is cancelled, so one
// slow statement cannot hold a connection (and a request) for ever.
// Migrations run without the limit.
const (
	statementTimeout   = 10 * time.Second
	idleInTxnTimeout   = 30 * time.Second
	migrationLockKey   = 7177001 // pg_advisory_lock(bigint) while migrating
	deviceLockSpace    = 7177    // pg_advisory_xact_lock(int, int): one phone's rows
	pgMaxConnIdleTime  = 5 * time.Minute
	pgHealthCheckEvery = 30 * time.Second
)

// openPGStore connects with a bounded pool, so a traffic spike queues inside
// the pool instead of exhausting database connections, then brings the
// schema up to date.
func openPGStore(ctx context.Context, url string, maxConns int32) (*pgStore, error) {
	st, err := connectPG(ctx, url, maxConns)
	if err != nil {
		return nil, err
	}
	if err := st.migrate(ctx); err != nil {
		st.Close()
		return nil, err
	}
	return st, nil
}

// connectPG connects without touching the schema, for `go run . check`,
// which must see a restored database as it is.
func connectPG(ctx context.Context, url string, maxConns int32) (*pgStore, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = maxConns
	cfg.MaxConnIdleTime = pgMaxConnIdleTime
	cfg.HealthCheckPeriod = pgHealthCheckEvery
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = strconv.Itoa(int(statementTimeout.Milliseconds()))
	cfg.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = strconv.Itoa(int(idleInTxnTimeout.Milliseconds()))
	cfg.ConnConfig.RuntimeParams["application_name"] = "persona-index"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	return &pgStore{pool: pool}, nil
}

func (p *pgStore) Close() { p.pool.Close() }

// Ping checks the database answers, for the readiness check.
func (p *pgStore) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }

// Backlog counts accepted votes not tallied yet (the votes_untallied partial
// index keeps it cheap), for the metrics.
func (p *pgStore) Backlog(ctx context.Context) (int64, error) {
	var n int64
	err := p.pool.QueryRow(ctx, `SELECT count(*) FROM votes WHERE tallied_at IS NULL`).Scan(&n)
	return n, err
}

// PoolStats reports the connection pool, for the metrics.
func (p *pgStore) PoolStats() PoolStats {
	st := p.pool.Stat()
	return PoolStats{
		Max: st.MaxConns(), Total: st.TotalConns(), Idle: st.IdleConns(), InUse: st.AcquiredConns(),
		Waits: st.EmptyAcquireCount(), AcquireTime: st.AcquireDuration(),
	}
}

// migrate applies, in name order, every embedded migration not yet recorded
// in schema_migrations, each in its own transaction, under an advisory lock
// so several instances starting at once do not race. Migrations are also
// written to be safe to re-run, so a database made before the record existed
// is brought up to date the same way.
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
	if _, err := conn.Exec(ctx, `SET statement_timeout = 0`); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `RESET statement_timeout`)
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationLockKey); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, migrationLockKey)
	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	rows, err := conn.Query(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return err
	}
	applied, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, name := range names {
		base := path.Base(name)
		if slices.Contains(applied, base) {
			continue
		}
		sql, err := migrationFS.ReadFile(name)
		if err != nil {
			return err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, base)
			return err
		})
		if err != nil {
			return fmt.Errorf("migration %s: %w", base, err)
		}
	}
	return nil
}

// Accept stores a ballot and its mirror side in one implicit transaction: the
// batch below goes to the database in one round trip, and Postgres runs it as
// one transaction. The phone's rows are locked first, so a "Delete
// everything" for the same phone runs wholly before or wholly after.
func (p *pgStore) Accept(ctx context.Context, idempotencyKey string, b Ballot, at time.Time) (VoteEvent, error) {
	e := VoteEvent{ID: newEventID(), QuestionID: b.QuestionID, OptionID: b.OptionID, VoterHash: b.VoterHash, AcceptedAt: at}
	batch := &pgx.Batch{}
	if b.DeviceKey != "" {
		batch.Queue(`SELECT pg_advisory_xact_lock($1, hashtext($2))`, deviceLockSpace, b.DeviceKey)
	}
	// The vote, unless this phone deleted everything.
	batch.Queue(`
		INSERT INTO votes (id, question_id, option_id, voter_hash, idem_key, dedupe_key, accepted_at, counted)
		SELECT $1, $2, $3, $4, $5, $6, $7, $9
		WHERE NOT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $8)
		ON CONFLICT DO NOTHING
		RETURNING id`,
		e.ID, b.QuestionID, b.OptionID, b.VoterHash, idempotencyKey, voteDedupeKey(b.Vote), at, b.DeviceKey, !b.Uncounted)
	// The mirror side, only when the stored vote is this very ballot: a new
	// vote, or a retry of it with the same key. Never for a second vote.
	thisBallot := `EXISTS (SELECT 1 FROM votes WHERE voter_hash = $1 AND idem_key = $2 AND question_id = $3 AND option_id = $4)`
	if a := b.Answer; a != nil {
		var option *string
		if a.OptionID != "" {
			option = &a.OptionID
		}
		batch.Queue(`
			INSERT INTO mirror_answers (device_key, question_id, edition_date, theme, option_id, depth, evening)
			SELECT $5, $6, $7, $8, $9, $10, $11 WHERE `+thisBallot+`
			ON CONFLICT (device_key, question_id) DO NOTHING`,
			b.VoterHash, idempotencyKey, b.QuestionID, b.OptionID, a.DeviceKey, a.QuestionID, a.Date, a.Theme, option, a.Depth, a.Evening)
	}
	if r := b.Rating; r != nil {
		batch.Queue(`
			UPDATE mirror_answers SET verdict = $7
			WHERE device_key = $5 AND question_id = $6 AND verdict IS NULL AND `+thisBallot,
			b.VoterHash, idempotencyKey, b.QuestionID, b.OptionID, b.DeviceKey, r.QuestionID, r.Verdict)
	}
	// What is stored now under this key, and whether the phone is forgotten.
	batch.Queue(`
		SELECT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $3),
		       v.id, v.question_id, v.option_id, v.voter_hash, v.accepted_at
		FROM (SELECT 1) one LEFT JOIN votes v ON v.voter_hash = $1 AND v.idem_key = $2`,
		b.VoterHash, idempotencyKey, b.DeviceKey)

	br := p.pool.SendBatch(ctx, batch)
	defer br.Close()
	if b.DeviceKey != "" {
		if _, err := br.Exec(); err != nil {
			return VoteEvent{}, err
		}
	}
	var insertedID string
	inserted := true
	if err := br.QueryRow().Scan(&insertedID); errors.Is(err, pgx.ErrNoRows) {
		inserted = false
	} else if err != nil {
		return VoteEvent{}, err
	}
	for _, queued := range []bool{b.Answer != nil, b.Rating != nil} {
		if !queued {
			continue
		}
		if _, err := br.Exec(); err != nil {
			return VoteEvent{}, err
		}
	}
	var forgotten bool
	var prior struct {
		id, questionID, optionID, voterHash *string
		acceptedAt                          *time.Time
	}
	if err := br.QueryRow().Scan(&forgotten, &prior.id, &prior.questionID, &prior.optionID, &prior.voterHash, &prior.acceptedAt); err != nil {
		return VoteEvent{}, err
	}
	if err := br.Close(); err != nil {
		return VoteEvent{}, err
	}
	switch {
	case inserted:
		return e, nil
	case forgotten:
		return VoteEvent{}, ErrDeviceForgotten
	case prior.id == nil:
		// A conflict on the dedupe key: a second vote. ON CONFLICT waited for
		// any concurrent insert to commit, so the row that won is visible.
		return VoteEvent{}, ErrDuplicateVote
	case *prior.questionID != b.QuestionID || *prior.optionID != b.OptionID:
		return VoteEvent{}, ErrIdempotencyKeyReuse
	default:
		return VoteEvent{ID: *prior.id, QuestionID: *prior.questionID, OptionID: *prior.optionID, VoterHash: *prior.voterHash, AcceptedAt: prior.acceptedAt.UTC()}, nil
	}
}

// Tally claims a batch with SKIP LOCKED, marks it tallied and adds it to the
// counts in one statement, so a crash leaves either all or none of the batch
// counted, and parallel workers never claim the same vote. A vote marked not
// counted is marked tallied and adds nothing.
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
			RETURNING votes.question_id, votes.option_id, votes.counted
		), added AS (
			INSERT INTO vote_tallies (question_id, option_id, count)
			SELECT question_id, option_id, count(*) FROM marked WHERE counted GROUP BY 1, 2
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
	return p.deleteInBatches(ctx, `DELETE FROM votes WHERE id IN (
		SELECT id FROM votes WHERE tallied_at IS NOT NULL AND accepted_at < $1 LIMIT $2)`, cutoff)
}

// retentionBatch is how many rows one retention DELETE removes. A day of
// votes at a million people is millions of rows: one statement would run
// past the statement timeout and hold its locks for minutes, so retention
// deletes in short batches, each its own transaction.
var retentionBatch = 5000

// deleteInBatches runs sql, a DELETE whose last parameter is the batch size
// (as a LIMIT in a subquery), until a batch comes back short.
func (p *pgStore) deleteInBatches(ctx context.Context, sql string, args ...any) (int, error) {
	total := 0
	for {
		tag, err := p.pool.Exec(ctx, sql, append(args, retentionBatch)...)
		if err != nil {
			return total, err
		}
		n := int(tag.RowsAffected())
		total += n
		if n < retentionBatch {
			return total, nil
		}
		if err := ctx.Err(); err != nil {
			return total, err
		}
	}
}

func (p *pgStore) truncateForTests(ctx context.Context) error {
	_, err := p.pool.Exec(ctx, `TRUNCATE votes, vote_tallies, mirror_answers, mirror_steps, mirror_weeks, mirror_folds, forgotten_devices, mirror_plan_checks, vaults,
		accounts, account_logins, account_sessions, login_codes, account_sync, friendships, circle_invites, circle_rooms,
		circle_room_members, circle_asks, circle_dismissed, friend_prompt_log, friend_mirror_inputs, nods, together,
		shares, share_recipients, common_tags, common_consent, reach_outs, what_helped, entitlements, pairs`)
	return err
}
