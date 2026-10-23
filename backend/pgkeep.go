package main

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Postgres side of plan checks, the export and the encrypted backups
// (keep.go, vault.go, migrations/006_keep.sql).

func (p *pgStore) SavePlanCheck(ctx context.Context, c PlanCheck) error {
	return p.deviceWrite(ctx, c.DeviceKey, `
		INSERT INTO mirror_plan_checks (device_key, check_key, checked_on, status)
		SELECT $1, $2, $3, $4
		WHERE NOT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $1)
		ON CONFLICT (device_key, check_key) DO NOTHING`,
		c.DeviceKey, c.Key, c.Date, c.Status)
}

func (p *pgStore) PlanChecks(ctx context.Context, deviceKey, from, to string) ([]PlanCheck, error) {
	rows, err := p.pool.Query(ctx, `SELECT device_key, check_key, checked_on::text, status FROM mirror_plan_checks
		WHERE device_key = $1 AND checked_on BETWEEN $2 AND $3
		ORDER BY checked_on, check_key`, deviceKey, from, to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (PlanCheck, error) {
		var c PlanCheck
		err := row.Scan(&c.DeviceKey, &c.Key, &c.Date, &c.Status)
		return c, err
	})
}

func (p *pgStore) DeviceVotes(ctx context.Context, voterHashes []string) ([]VoteEvent, error) {
	rows, err := p.pool.Query(ctx, `SELECT id, question_id, option_id, voter_hash, accepted_at FROM votes
		WHERE voter_hash = ANY($1) ORDER BY accepted_at, id`, voterHashes)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (VoteEvent, error) {
		var e VoteEvent
		err := row.Scan(&e.ID, &e.QuestionID, &e.OptionID, &e.VoterHash, &e.AcceptedAt)
		e.AcceptedAt = e.AcceptedAt.UTC()
		return e, err
	})
}

func (p *pgStore) RatingTallies(ctx context.Context) (map[string]map[string]int, error) {
	rows, err := p.pool.Query(ctx, `SELECT question_id, option_id, count FROM vote_tallies WHERE question_id LIKE 'rating/%'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]int{}
	for rows.Next() {
		var q, opt string
		var n int64
		if err := rows.Scan(&q, &opt, &n); err != nil {
			return nil, err
		}
		if out[q] == nil {
			out[q] = map[string]int{}
		}
		out[q][opt] = int(n)
	}
	return out, rows.Err()
}

// PutVault makes or replaces a backup in one statement each, so two phones
// writing at once cannot both win: the second sees the first's version.
func (p *pgStore) PutVault(ctx context.Context, id string, replaces int, sealed []byte, today string) (int, error) {
	var version int
	var err error
	if replaces == 0 {
		err = p.pool.QueryRow(ctx, `INSERT INTO vaults (vault_id, version, sealed, seen_on) VALUES ($1, 1, $2, $3)
			ON CONFLICT (vault_id) DO NOTHING RETURNING version`, id, sealed, today).Scan(&version)
	} else {
		err = p.pool.QueryRow(ctx, `UPDATE vaults SET version = version + 1, sealed = $3, seen_on = greatest(seen_on, $4::date)
			WHERE vault_id = $1 AND version = $2 RETURNING version`, id, replaces, sealed, today).Scan(&version)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return version, err
	}
	// Nothing written: say why.
	var current int
	switch err := p.pool.QueryRow(ctx, `SELECT version FROM vaults WHERE vault_id = $1`, id).Scan(&current); {
	case errors.Is(err, pgx.ErrNoRows) && replaces > 0:
		return 0, ErrVaultNotFound
	case errors.Is(err, pgx.ErrNoRows):
		// Made and deleted again in between; the phone tries once more.
		return 0, VaultConflict{Version: 0}
	case err != nil:
		return 0, err
	}
	return 0, VaultConflict{Version: current}
}

func (p *pgStore) GetVault(ctx context.Context, id, today string) (Vault, error) {
	var v Vault
	err := p.pool.QueryRow(ctx, `UPDATE vaults SET seen_on = greatest(seen_on, $2::date) WHERE vault_id = $1
		RETURNING version, sealed`, id, today).Scan(&v.Version, &v.Sealed)
	if errors.Is(err, pgx.ErrNoRows) {
		return Vault{}, ErrVaultNotFound
	}
	return v, err
}

func (p *pgStore) DeleteVault(ctx context.Context, id string) (bool, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM vaults WHERE vault_id = $1`, id)
	return tag.RowsAffected() > 0, err
}

func (p *pgStore) DeleteVaultsBefore(ctx context.Context, date string) (int, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM vaults WHERE seen_on < $1`, date)
	return int(tag.RowsAffected()), err
}
