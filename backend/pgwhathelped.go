package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The Postgres What Helped store (whathelped.go, migration 010).

// SaveHelped writes under the phone's lock, keyed by its mirror key, so a
// report racing "Delete everything" either lands first and is deleted with
// the rest, or finds the phone forgotten and is not written.
func (p *pgStore) SaveHelped(ctx context.Context, lockKey string, r HelpedReport) error {
	return p.deviceWrite(ctx, lockKey, `
		INSERT INTO what_helped (reporter_key, question_id, option_id, outcome, reported_week)
		SELECT $2, $3, $4, $5, $6
		WHERE NOT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $1)
		ON CONFLICT (reporter_key, question_id, option_id)
		DO UPDATE SET outcome = EXCLUDED.outcome, reported_week = EXCLUDED.reported_week`,
		lockKey, r.ReporterKey, r.QuestionID, r.OptionID, r.Outcome, r.Week)
}

func (p *pgStore) HelpedTallies(ctx context.Context) (map[HelpedStepKey]map[string]int, error) {
	rows, err := p.pool.Query(ctx, `SELECT question_id, option_id, outcome, count(*) FROM what_helped GROUP BY 1, 2, 3`)
	if err != nil {
		return nil, fmt.Errorf("what helped tallies: %w", err)
	}
	out := map[HelpedStepKey]map[string]int{}
	var key HelpedStepKey
	var outcome string
	var n int
	_, err = pgx.ForEachRow(rows, []any{&key.QuestionID, &key.OptionID, &outcome, &n}, func() error {
		if out[key] == nil {
			out[key] = map[string]int{}
		}
		out[key][outcome] = n
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("what helped tallies: %w", err)
	}
	return out, nil
}

func (p *pgStore) HelpedReports(ctx context.Context, reporterKey string) ([]HelpedReport, error) {
	rows, err := p.pool.Query(ctx, `SELECT reporter_key, question_id, option_id, outcome, reported_week::text FROM what_helped
		WHERE reporter_key = $1 ORDER BY question_id, option_id`, reporterKey)
	if err != nil {
		return nil, fmt.Errorf("what helped reports: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (HelpedReport, error) {
		var r HelpedReport
		return r, row.Scan(&r.ReporterKey, &r.QuestionID, &r.OptionID, &r.Outcome, &r.Week)
	})
	if err != nil {
		return nil, fmt.Errorf("what helped reports: %w", err)
	}
	return out, nil
}

func (p *pgStore) ForgetHelped(ctx context.Context, reporterKey string) (int, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM what_helped WHERE reporter_key = $1`, reporterKey)
	if err != nil {
		return 0, fmt.Errorf("forget what helped: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
