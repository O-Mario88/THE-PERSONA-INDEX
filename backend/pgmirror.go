package main

import (
	"context"
	"encoding/json"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Postgres side of the mirror store (mirrorstore.go, migrations/002_mirror.sql).

func (p *pgStore) SaveAnswer(ctx context.Context, a MirrorAnswer) error {
	var option *string
	if a.OptionID != "" {
		option = &a.OptionID
	}
	return p.deviceWrite(ctx, a.DeviceKey, `
		INSERT INTO mirror_answers (device_key, question_id, edition_date, theme, option_id, depth, evening)
		SELECT $1, $2, $3, $4, $5, $6, $7
		WHERE NOT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $1)
		ON CONFLICT (device_key, question_id) DO NOTHING`,
		a.DeviceKey, a.QuestionID, a.Date, a.Theme, option, a.Depth, a.Evening)
}

func (p *pgStore) SaveStep(ctx context.Context, s MirrorStep) error {
	return p.deviceWrite(ctx, s.DeviceKey, `
		INSERT INTO mirror_steps (device_key, question_id, option_id, started_on, status, updated_at, need_step)
		SELECT $1, $2, $3, $4, $5, $6, $7
		WHERE NOT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $1)
		ON CONFLICT (device_key, question_id)
		DO UPDATE SET option_id = EXCLUDED.option_id, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
		s.DeviceKey, s.QuestionID, s.OptionID, s.Started, s.Status, s.UpdatedAt, s.NeedStep)
}

// deviceWrite runs one write under the device's lock, in one implicit
// transaction, and reports ErrDeviceForgotten for a phone that deleted
// everything (the write itself checks that and does nothing).
func (p *pgStore) deviceWrite(ctx context.Context, deviceKey, sql string, args ...any) error {
	batch := &pgx.Batch{}
	batch.Queue(`SELECT pg_advisory_xact_lock($1, hashtext($2))`, deviceLockSpace, deviceKey)
	batch.Queue(sql, args...)
	batch.Queue(`SELECT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $1)`, deviceKey)
	br := p.pool.SendBatch(ctx, batch)
	defer br.Close()
	if _, err := br.Exec(); err != nil {
		return err
	}
	if _, err := br.Exec(); err != nil {
		return err
	}
	var forgotten bool
	if err := br.QueryRow().Scan(&forgotten); err != nil {
		return err
	}
	if err := br.Close(); err != nil {
		return err
	}
	if forgotten {
		return ErrDeviceForgotten
	}
	return nil
}

const answerColumns = `device_key, question_id, edition_date::text, theme, coalesce(option_id, ''), depth, evening, coalesce(verdict, '')`

// answerOrder is the order answers are read back in: by date and sitting.
const answerOrder = `edition_date, evening, question_id`

func scanAnswer(rows pgx.CollectableRow) (MirrorAnswer, error) {
	var a MirrorAnswer
	var depth int16
	err := rows.Scan(&a.DeviceKey, &a.QuestionID, &a.Date, &a.Theme, &a.OptionID, &depth, &a.Evening, &a.Verdict)
	a.Depth = int(depth)
	return a, err
}

const stepColumns = `device_key, question_id, option_id, started_on::text, status, updated_at, need_step`

func scanStep(rows pgx.CollectableRow) (MirrorStep, error) {
	var s MirrorStep
	err := rows.Scan(&s.DeviceKey, &s.QuestionID, &s.OptionID, &s.Started, &s.Status, &s.UpdatedAt, &s.NeedStep)
	s.UpdatedAt = s.UpdatedAt.UTC()
	return s, err
}

func (p *pgStore) DeviceHistory(ctx context.Context, deviceKey, from, to string) ([]MirrorAnswer, []MirrorStep, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+answerColumns+` FROM mirror_answers
		WHERE device_key = $1 AND edition_date BETWEEN $2 AND $3
		ORDER BY `+answerOrder, deviceKey, from, to)
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
		ORDER BY device_key, `+answerOrder, from, to)
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

// ForgetDevice deletes everything kept for one phone in one implicit
// transaction, under the phone's lock, and marks the phone forgotten so its
// old pass takes no more writes: a vote retried after the delete cannot bring
// an answer back.
func (p *pgStore) ForgetDevice(ctx context.Context, deviceKey string, voterHashes []string, today string) (Forgotten, error) {
	batch := &pgx.Batch{}
	batch.Queue(`SELECT pg_advisory_xact_lock($1, hashtext($2))`, deviceLockSpace, deviceKey)
	batch.Queue(`DELETE FROM mirror_answers WHERE device_key = $1`, deviceKey)
	batch.Queue(`DELETE FROM mirror_steps WHERE device_key = $1`, deviceKey)
	batch.Queue(`DELETE FROM mirror_plan_checks WHERE device_key = $1`, deviceKey)
	batch.Queue(`DELETE FROM mirror_weeks WHERE device_key = $1`, deviceKey)
	batch.Queue(`DELETE FROM votes WHERE voter_hash = ANY($1)`, voterHashes)
	batch.Queue(`INSERT INTO forgotten_devices (device_key, forgotten_on) VALUES ($1, $2)
		ON CONFLICT (device_key) DO NOTHING`, deviceKey, today)
	br := p.pool.SendBatch(ctx, batch)
	defer br.Close()
	var f Forgotten
	if _, err := br.Exec(); err != nil {
		return f, err
	}
	for _, n := range []*int{&f.Answers, &f.Steps, &f.PlanChecks, &f.Weeks, &f.Votes} {
		tag, err := br.Exec()
		if err != nil {
			return Forgotten{}, err
		}
		*n = int(tag.RowsAffected())
	}
	if _, err := br.Exec(); err != nil {
		return Forgotten{}, err
	}
	return f, br.Close()
}

func (p *pgStore) DeviceData(ctx context.Context, deviceKey string, voterHashes []string) (Kept, error) {
	var k Kept
	var first *string
	err := p.pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM mirror_answers WHERE device_key = $1),
		       (SELECT count(*) FROM mirror_answers WHERE device_key = $1 AND option_id IS NULL),
		       (SELECT min(edition_date)::text FROM mirror_answers WHERE device_key = $1),
		       (SELECT count(*) FROM mirror_steps WHERE device_key = $1),
		       (SELECT count(*) FROM mirror_plan_checks WHERE device_key = $1),
		       (SELECT count(*) FROM mirror_weeks WHERE device_key = $1),
		       (SELECT count(*) FROM votes WHERE voter_hash = ANY($2))`, deviceKey, voterHashes,
	).Scan(&k.Answers, &k.Private, &first, &k.Steps, &k.PlanChecks, &k.Weeks, &k.Votes)
	if first != nil {
		k.FirstAnswer = *first
	}
	return k, err
}

func (p *pgStore) DeleteMirrorBefore(ctx context.Context, date string) (int, error) {
	n := 0
	for _, sql := range []string{
		`DELETE FROM mirror_answers WHERE ctid IN (SELECT ctid FROM mirror_answers WHERE edition_date < $1 LIMIT $2)`,
		`DELETE FROM mirror_steps WHERE ctid IN (SELECT ctid FROM mirror_steps WHERE started_on < $1 LIMIT $2)`,
		`DELETE FROM mirror_plan_checks WHERE ctid IN (SELECT ctid FROM mirror_plan_checks WHERE checked_on < $1 LIMIT $2)`,
		`DELETE FROM forgotten_devices WHERE ctid IN (SELECT ctid FROM forgotten_devices WHERE forgotten_on < $1 LIMIT $2)`,
	} {
		d, err := p.deleteInBatches(ctx, sql, date)
		n += d
		if err != nil {
			return n, err
		}
	}
	return n, nil
}

// SaveWeekSummaries writes the batch in one implicit transaction, each
// summary under its phone's lock, in device order so two folds running at
// once cannot deadlock.
func (p *pgStore) SaveWeekSummaries(ctx context.Context, ws []WeekSummary) error {
	if len(ws) == 0 {
		return nil
	}
	ws = slices.Clone(ws)
	slices.SortStableFunc(ws, func(x, y WeekSummary) int { return strings.Compare(x.DeviceKey, y.DeviceKey) })
	batch := &pgx.Batch{}
	for _, w := range ws {
		raw, err := json.Marshal(w)
		if err != nil {
			return err
		}
		from, to := summarySources(w.Monday)
		batch.Queue(`SELECT pg_advisory_xact_lock($1, hashtext($2))`, deviceLockSpace, w.DeviceKey)
		batch.Queue(`INSERT INTO mirror_weeks (device_key, monday, summary)
			SELECT $1::text, $2::date, $3::jsonb WHERE EXISTS (
				SELECT 1 FROM mirror_answers WHERE device_key = $1 AND edition_date BETWEEN $4 AND $5)
			ON CONFLICT (device_key, monday) DO UPDATE SET summary = EXCLUDED.summary`, w.DeviceKey, w.Monday, raw, from, to)
	}
	return p.pool.SendBatch(ctx, batch).Close()
}

func (p *pgStore) WeekSummaries(ctx context.Context, deviceKey, from, to string) ([]WeekSummary, error) {
	rows, err := p.pool.Query(ctx, `SELECT monday::text, summary FROM mirror_weeks
		WHERE device_key = $1 AND monday BETWEEN $2 AND $3 ORDER BY monday`, deviceKey, from, to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (WeekSummary, error) {
		var w WeekSummary
		var raw []byte
		if err := row.Scan(&w.Monday, &raw); err != nil {
			return w, err
		}
		err := json.Unmarshal(raw, &w)
		w.DeviceKey = deviceKey
		return w, err
	})
}

func (p *pgStore) MarkFolded(ctx context.Context, monday string) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO mirror_folds (monday, folded_at) VALUES ($1, now())
		ON CONFLICT (monday) DO NOTHING`, monday)
	return err
}

func (p *pgStore) FoldedWeeks(ctx context.Context, from, to string) ([]string, error) {
	rows, err := p.pool.Query(ctx, `SELECT monday::text FROM mirror_folds WHERE monday BETWEEN $1 AND $2 ORDER BY monday`, from, to)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

func (p *pgStore) DeleteWeeksBefore(ctx context.Context, monday string) (int, error) {
	w, err := p.deleteInBatches(ctx, `DELETE FROM mirror_weeks WHERE ctid IN (SELECT ctid FROM mirror_weeks WHERE monday < $1 LIMIT $2)`, monday)
	if err != nil {
		return w, err
	}
	f, err := p.deleteInBatches(ctx, `DELETE FROM mirror_folds WHERE ctid IN (SELECT ctid FROM mirror_folds WHERE monday < $1 LIMIT $2)`, monday)
	return w + f, err
}
