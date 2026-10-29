package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The Postgres Patron and pair stores (patron.go, pair.go, migration 011).

// pairLockKey serialises writes to pairs, so two asks at once cannot put one
// account in two pairs. Asks are rare; one lock for all of them is enough.
const pairLockKey = 7177011

func (p *pgStore) SaveEntitlement(ctx context.Context, e Entitlement) (bool, error) {
	var until *string
	if e.Until != "" {
		until = &e.Until
	}
	tag, err := p.pool.Exec(ctx, `INSERT INTO entitlements (ref, owner, plan, since, until, source)
		VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (ref) DO NOTHING`, e.Ref, e.Owner, e.Plan, e.Since, until, e.Source)
	if err != nil {
		return false, fmt.Errorf("save entitlement: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (p *pgStore) Entitlements(ctx context.Context, owner string) ([]Entitlement, error) {
	rows, err := p.pool.Query(ctx, `SELECT ref, owner, plan, since::text, coalesce(until::text, ''), source
		FROM entitlements WHERE owner = $1 ORDER BY since, ref`, owner)
	if err != nil {
		return nil, fmt.Errorf("entitlements: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Entitlement, error) {
		var e Entitlement
		return e, row.Scan(&e.Ref, &e.Owner, &e.Plan, &e.Since, &e.Until, &e.Source)
	})
	if err != nil {
		return nil, fmt.Errorf("entitlements: %w", err)
	}
	return out, nil
}

func (p *pgStore) MoveEntitlements(ctx context.Context, from, to string) error {
	if from == to {
		return nil
	}
	if _, err := p.pool.Exec(ctx, `UPDATE entitlements SET owner = $2 WHERE owner = $1`, from, to); err != nil {
		return fmt.Errorf("move entitlements: %w", err)
	}
	return nil
}

func (p *pgStore) CountPlan(ctx context.Context, plan string) (int, error) {
	var n int
	if err := p.pool.QueryRow(ctx, `SELECT count(*) FROM entitlements WHERE plan = $1`, plan).Scan(&n); err != nil {
		return 0, fmt.Errorf("count plan: %w", err)
	}
	return n, nil
}

func (p *pgStore) DeleteEntitlements(ctx context.Context, owner, source string) (int, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM entitlements WHERE owner = $1 AND source = $2`, owner, source)
	if err != nil {
		return 0, fmt.Errorf("delete entitlements: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

const pairColumns = `from_account, to_account, walking, since::text`

func scanPair(row pgx.Row) (Pair, error) {
	var pr Pair
	err := row.Scan(&pr.From, &pr.To, &pr.Walking, &pr.Since)
	return pr, err
}

func (p *pgStore) PairOf(ctx context.Context, accountID string) (Pair, bool, error) {
	pr, err := scanPair(p.pool.QueryRow(ctx, `SELECT `+pairColumns+` FROM pairs WHERE from_account = $1 OR to_account = $1 LIMIT 1`, accountID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Pair{}, false, nil
	}
	if err != nil {
		return Pair{}, false, fmt.Errorf("pair of: %w", err)
	}
	return pr, true, nil
}

func (p *pgStore) AskPair(ctx context.Context, from, to, today string) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, pairLockKey); err != nil {
			return fmt.Errorf("ask pair: %w", err)
		}
		mine, err := scanPair(tx.QueryRow(ctx, `SELECT `+pairColumns+` FROM pairs WHERE from_account = $1 OR to_account = $1`, from))
		switch {
		case err == nil && (mine.Walking || mine.From != from):
			return ErrPairBusy
		case err == nil:
			if _, err := tx.Exec(ctx, `DELETE FROM pairs WHERE from_account = $1`, from); err != nil {
				return fmt.Errorf("ask pair: %w", err)
			}
		case !errors.Is(err, pgx.ErrNoRows):
			return fmt.Errorf("ask pair: %w", err)
		}
		var busy bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pairs WHERE from_account = $1 OR to_account = $1)`, to).Scan(&busy); err != nil {
			return fmt.Errorf("ask pair: %w", err)
		}
		if busy {
			return ErrPairBusy
		}
		if _, err := tx.Exec(ctx, `INSERT INTO pairs (from_account, to_account, since) VALUES ($1, $2, $3)`, from, to, today); err != nil {
			return fmt.Errorf("ask pair: %w", err)
		}
		return nil
	})
}

func (p *pgStore) AcceptPair(ctx context.Context, to, today string) (Pair, error) {
	pr, err := scanPair(p.pool.QueryRow(ctx, `UPDATE pairs SET walking = true, since = $2
		WHERE to_account = $1 AND NOT walking RETURNING `+pairColumns, to, today))
	if errors.Is(err, pgx.ErrNoRows) {
		return Pair{}, ErrNoPair
	}
	if err != nil {
		return Pair{}, fmt.Errorf("accept pair: %w", err)
	}
	return pr, nil
}

func (p *pgStore) EndPair(ctx context.Context, accountID string) error {
	if _, err := p.pool.Exec(ctx, `DELETE FROM pairs WHERE from_account = $1 OR to_account = $1`, accountID); err != nil {
		return fmt.Errorf("end pair: %w", err)
	}
	return nil
}
