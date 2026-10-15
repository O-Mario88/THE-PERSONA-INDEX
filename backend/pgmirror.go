package main

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Postgres side of the mirror store (mirrorstore.go, migrations/002_mirror.sql).

func (p *pgStore) SaveAnswer(ctx context.Context, a MirrorAnswer) error {
	var option *string
	if a.OptionID != "" {
		option = &a.OptionID
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO mirror_answers (device_key, question_id, edition_date, theme, option_id, depth, answered_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (device_key, question_id) DO NOTHING`,
		a.DeviceKey, a.QuestionID, a.Date, a.Theme, option, a.Depth, a.AnsweredAt)
	return err
}

func (p *pgStore) SaveRating(ctx context.Context, deviceKey, questionID string, learned bool) error {
	_, err := p.pool.Exec(ctx, `
		UPDATE mirror_answers SET learned = $3
		WHERE device_key = $1 AND question_id = $2 AND learned IS NULL`, deviceKey, questionID, learned)
	return err
}

func (p *pgStore) SaveStep(ctx context.Context, s MirrorStep) error {
	_, err := p.pool.Exec(ctx, `
		INSERT INTO mirror_steps (device_key, question_id, option_id, started_on, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (device_key, question_id)
		DO UPDATE SET option_id = EXCLUDED.option_id, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
		s.DeviceKey, s.QuestionID, s.OptionID, s.Started, s.Status, s.UpdatedAt)
	return err
}

const answerColumns = `device_key, question_id, edition_date::text, theme, coalesce(option_id, ''), depth, answered_at, learned`

func scanAnswer(rows pgx.CollectableRow) (MirrorAnswer, error) {
	var a MirrorAnswer
	var depth int16
	err := rows.Scan(&a.DeviceKey, &a.QuestionID, &a.Date, &a.Theme, &a.OptionID, &depth, &a.AnsweredAt, &a.Learned)
	a.Depth = int(depth)
	a.AnsweredAt = a.AnsweredAt.UTC()
	return a, err
}

const stepColumns = `device_key, question_id, option_id, started_on::text, status, updated_at`

func scanStep(rows pgx.CollectableRow) (MirrorStep, error) {
	var s MirrorStep
	err := rows.Scan(&s.DeviceKey, &s.QuestionID, &s.OptionID, &s.Started, &s.Status, &s.UpdatedAt)
	s.UpdatedAt = s.UpdatedAt.UTC()
	return s, err
}

func (p *pgStore) DeviceHistory(ctx context.Context, deviceKey, from, to string) ([]MirrorAnswer, []MirrorStep, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+answerColumns+` FROM mirror_answers
		WHERE device_key = $1 AND edition_date BETWEEN $2 AND $3
		ORDER BY edition_date, answered_at`, deviceKey, from, to)
	if err != nil {
		return nil, nil, err
	}
	answers, err := pgx.CollectRows(rows, scanAnswer)
	if err != nil {
		return nil, nil, err
	}
	rows, err = p.pool.Query(ctx, `SELECT `+stepColumns+` FROM mirror_steps
		WHERE device_key = $1 AND started_on BETWEEN $2 AND $3
		ORDER BY started_on`, deviceKey, from, to)
	if err != nil {
		return nil, nil, err
	}
	steps, err := pgx.CollectRows(rows, scanStep)
	return answers, steps, err
}

// EachDevice streams the range's answers in device order, so memory holds one
// device at a time. Steps are few, so they are read first and grouped.
func (p *pgStore) EachDevice(ctx context.Context, from, to string, fn func(string, []MirrorAnswer, []MirrorStep) error) error {
	rows, err := p.pool.Query(ctx, `SELECT `+stepColumns+` FROM mirror_steps WHERE started_on BETWEEN $1 AND $2`, from, to)
	if err != nil {
		return err
	}
	all, err := pgx.CollectRows(rows, scanStep)
	if err != nil {
		return err
	}
	steps := map[string][]MirrorStep{}
	for _, s := range all {
		steps[s.DeviceKey] = append(steps[s.DeviceKey], s)
	}

	rows, err = p.pool.Query(ctx, `SELECT `+answerColumns+` FROM mirror_answers
		WHERE edition_date BETWEEN $1 AND $2
		ORDER BY device_key, edition_date, answered_at`, from, to)
	if err != nil {
		return err
	}
	defer rows.Close()
	var current []MirrorAnswer
	flush := func() error {
		if len(current) == 0 {
			return nil
		}
		k := current[0].DeviceKey
		err := fn(k, current, steps[k])
		current = nil
		return err
	}
	for rows.Next() {
		a, err := scanAnswer(rows)
		if err != nil {
			return err
		}
		if len(current) > 0 && current[0].DeviceKey != a.DeviceKey {
			if err := flush(); err != nil {
				return err
			}
		}
		current = append(current, a)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return flush()
}

func (p *pgStore) ForgetDevice(ctx context.Context, deviceKey string) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM mirror_answers WHERE device_key = $1`, deviceKey); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM mirror_steps WHERE device_key = $1`, deviceKey)
		return err
	})
}

func (p *pgStore) DeleteMirrorBefore(ctx context.Context, date string) (int, error) {
	a, err := p.pool.Exec(ctx, `DELETE FROM mirror_answers WHERE edition_date < $1`, date)
	if err != nil {
		return 0, err
	}
	s, err := p.pool.Exec(ctx, `DELETE FROM mirror_steps WHERE started_on < $1`, date)
	return int(a.RowsAffected() + s.RowsAffected()), err
}
