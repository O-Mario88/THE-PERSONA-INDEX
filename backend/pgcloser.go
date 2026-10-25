package main

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
)

// The Postgres Closer Together store (closer.go, migration 009).

func (p *pgStore) PutShare(ctx context.Context, sh Share) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO shares (id, sender, kind, theme, body, why, try_this, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			sh.ID, sh.From, sh.Kind, sh.Theme, sh.Text, sh.Why, sh.Try, sh.Created); err != nil {
			return fmt.Errorf("put share: %w", err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO share_recipients (share_id, recipient) SELECT $1, unnest($2::text[])`, sh.ID, sh.To); err != nil {
			return fmt.Errorf("put share recipients: %w", err)
		}
		return nil
	})
}

const shareColumns = `s.id, s.sender, s.kind, s.theme, s.body, s.why, s.try_this, s.created_at,
	coalesce((SELECT array_agg(r.recipient ORDER BY r.recipient) FROM share_recipients r WHERE r.share_id = s.id), '{}')`

func scanShares(rows pgx.Rows, err error) ([]Share, error) {
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Share, error) {
		var sh Share
		return sh, r.Scan(&sh.ID, &sh.From, &sh.Kind, &sh.Theme, &sh.Text, &sh.Why, &sh.Try, &sh.Created, &sh.To)
	})
}

func (p *pgStore) SharesTo(ctx context.Context, to string) ([]Share, error) {
	return scanShares(p.pool.Query(ctx, `SELECT `+shareColumns+` FROM shares s
		WHERE EXISTS (SELECT 1 FROM share_recipients r WHERE r.share_id = s.id AND r.recipient = $1)
		ORDER BY s.created_at DESC, s.id`, to))
}

func (p *pgStore) SharesFrom(ctx context.Context, from string) ([]Share, error) {
	return scanShares(p.pool.Query(ctx, `SELECT `+shareColumns+` FROM shares s WHERE s.sender = $1 ORDER BY s.created_at DESC, s.id`, from))
}

func (p *pgStore) DeleteShare(ctx context.Context, from, id string) (bool, error) {
	t, err := p.pool.Exec(ctx, `DELETE FROM shares WHERE id = $1 AND sender = $2`, id, from)
	return err == nil && t.RowsAffected() > 0, err
}

func (p *pgStore) PutCommonTags(ctx context.Context, id string, tags []string) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO common_tags (account_id, tags) VALUES ($1, $2)
		ON CONFLICT (account_id) DO UPDATE SET tags = EXCLUDED.tags`, id, nonNil(tags))
	return err
}

func (p *pgStore) CommonTagsOf(ctx context.Context, id string) ([]string, error) {
	var tags []string
	err := p.pool.QueryRow(ctx, `SELECT tags FROM common_tags WHERE account_id = $1`, id).Scan(&tags)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return tags, err
}

func (p *pgStore) SetCommonConsent(ctx context.Context, a, b string, on bool) error {
	q := `DELETE FROM common_consent WHERE a = $1 AND b = $2`
	if on {
		q = `INSERT INTO common_consent (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING`
	}
	_, err := p.pool.Exec(ctx, q, a, b)
	return err
}

func (p *pgStore) CommonConsent(ctx context.Context, id string) ([]string, error) {
	rows, err := p.pool.Query(ctx, `SELECT b FROM common_consent WHERE a = $1 ORDER BY b`, id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// CommonWith pairs each friend who opted in back with that friend's tags.
func (p *pgStore) CommonWith(ctx context.Context, id string) ([]CommonMatch, error) {
	friends, err := p.Friends(ctx, id)
	if err != nil {
		return nil, err
	}
	rows, err := p.pool.Query(ctx, `SELECT c.b, coalesce(t.tags, '{}') FROM common_consent c
		JOIN common_consent back ON back.a = c.b AND back.b = c.a
		LEFT JOIN common_tags t ON t.account_id = c.b
		WHERE c.a = $1`, id)
	if err != nil {
		return nil, err
	}
	type row struct {
		ID   string
		Tags []string
	}
	got, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (row, error) {
		var x row
		return x, r.Scan(&x.ID, &x.Tags)
	})
	if err != nil {
		return nil, err
	}
	var out []CommonMatch
	for _, f := range friends {
		if i := slices.IndexFunc(got, func(x row) bool { return x.ID == f.AccountID }); i >= 0 {
			out = append(out, CommonMatch{Friend: f, Tags: got[i].Tags})
		}
	}
	return out, nil
}

func (p *pgStore) PutReachOut(ctx context.Context, ro ReachOut) error {
	t, err := p.pool.Exec(ctx, `INSERT INTO reach_outs (id, sender, receiver, kind, phrase, reached_on) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (sender, receiver, kind, reached_on) DO NOTHING`, ro.ID, ro.From, ro.To, ro.Kind, ro.Phrase, ro.Date)
	if err == nil && t.RowsAffected() == 0 {
		return ErrReachedToday
	}
	return err
}

func (p *pgStore) ReachOutsTo(ctx context.Context, to, from string) ([]ReachOut, error) {
	rows, err := p.pool.Query(ctx, `SELECT id, sender, receiver, kind, phrase, reached_on::text FROM reach_outs
		WHERE receiver = $1 AND reached_on >= $2 ORDER BY reached_on DESC, id`, to, from)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (ReachOut, error) {
		var ro ReachOut
		return ro, r.Scan(&ro.ID, &ro.From, &ro.To, &ro.Kind, &ro.Phrase, &ro.Date)
	})
}

func (p *pgStore) DeleteReachOut(ctx context.Context, to, id string) (bool, error) {
	t, err := p.pool.Exec(ctx, `DELETE FROM reach_outs WHERE id = $1 AND receiver = $2`, id, to)
	return err == nil && t.RowsAffected() > 0, err
}

// forgetPair drops what a and b shared with each other, inside the
// transaction that disconnects them: each one's shares lose the other as a
// recipient (a share left with no one goes), and their Common Ground
// consents and reach-outs go.
func forgetPair(ctx context.Context, tx pgx.Tx, a, b string) error {
	for _, q := range []string{
		`DELETE FROM share_recipients r USING shares s WHERE r.share_id = s.id
			AND ((s.sender = $1 AND r.recipient = $2) OR (s.sender = $2 AND r.recipient = $1))`,
		`DELETE FROM shares s WHERE s.sender IN ($1, $2)
			AND NOT EXISTS (SELECT 1 FROM share_recipients r WHERE r.share_id = s.id)`,
		`DELETE FROM common_consent WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)`,
		`DELETE FROM reach_outs WHERE (sender = $1 AND receiver = $2) OR (sender = $2 AND receiver = $1)`,
	} {
		if _, err := tx.Exec(ctx, q, a, b); err != nil {
			return fmt.Errorf("forget pair: %w", err)
		}
	}
	return nil
}
