package main

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Postgres side of the social store (social.go, migrations/008).

func isUniqueViolation(err error, constraint string) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505" && (constraint == "" || pg.ConstraintName == constraint)
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

const accountColumns = `id, name, coalesce(handle, ''), created_on::text, seen_on::text, suggest, connect, epoch, sync`

func scanAccount(row pgx.Row) (Account, error) {
	var a Account
	err := row.Scan(&a.ID, &a.Name, &a.Handle, &a.CreatedOn, &a.SeenOn, &a.Suggest, &a.Connect, &a.Epoch, &a.Sync)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrNoAccount
	}
	return a, err
}

func (p *pgStore) CreateAccount(ctx context.Context, a Account, l Login) error {
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO accounts (id, name, handle, created_on, seen_on, suggest, connect, epoch, sync)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			a.ID, a.Name, nullable(a.Handle), a.CreatedOn, a.SeenOn, a.Suggest, a.Connect, a.Epoch, a.Sync); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO account_logins (login_key, account_id, kind, hint) VALUES ($1, $2, $3, $4)`, l.Key, a.ID, l.Kind, l.Hint)
		return err
	})
	switch {
	case isUniqueViolation(err, "account_logins_pkey"):
		return ErrLoginTaken
	case isUniqueViolation(err, "accounts_handle"):
		return ErrHandleTaken
	}
	return err
}

func (p *pgStore) AccountByLogin(ctx context.Context, key string) (Account, error) {
	return scanAccount(p.pool.QueryRow(ctx, `SELECT `+accountColumns+`
		FROM accounts WHERE id = (SELECT account_id FROM account_logins WHERE login_key = $1)`, key))
}

func (p *pgStore) GetAccount(ctx context.Context, id string) (Account, error) {
	return scanAccount(p.pool.QueryRow(ctx, `SELECT `+accountColumns+` FROM accounts WHERE id = $1`, id))
}

func (p *pgStore) AccountByHandle(ctx context.Context, handle string) (Account, error) {
	return scanAccount(p.pool.QueryRow(ctx, `SELECT `+accountColumns+` FROM accounts WHERE handle = $1`, handle))
}

func (p *pgStore) UpdateAccount(ctx context.Context, a Account) error {
	tag, err := p.pool.Exec(ctx, `UPDATE accounts SET name = $2, handle = $3, suggest = $4, connect = $5, epoch = $6, sync = $7 WHERE id = $1`,
		a.ID, a.Name, nullable(a.Handle), a.Suggest, a.Connect, a.Epoch, a.Sync)
	if isUniqueViolation(err, "accounts_handle") {
		return ErrHandleTaken
	}
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNoAccount
	}
	return err
}

func (p *pgStore) AddLogin(ctx context.Context, l Login) error {
	tag, err := p.pool.Exec(ctx, `INSERT INTO account_logins (login_key, account_id, kind, hint) VALUES ($1, $2, $3, $4)
		ON CONFLICT (login_key) DO NOTHING`, l.Key, l.AccountID, l.Kind, l.Hint)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var owner string
		if err := p.pool.QueryRow(ctx, `SELECT account_id FROM account_logins WHERE login_key = $1`, l.Key).Scan(&owner); err != nil {
			return err
		}
		if owner != l.AccountID {
			return ErrLoginTaken
		}
	}
	return nil
}

func (p *pgStore) Logins(ctx context.Context, id string) ([]Login, error) {
	rows, err := p.pool.Query(ctx, `SELECT login_key, account_id, kind, hint FROM account_logins WHERE account_id = $1 ORDER BY kind, login_key`, id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Login, error) {
		var l Login
		return l, r.Scan(&l.Key, &l.AccountID, &l.Kind, &l.Hint)
	})
}

// DeleteAccount: every table references accounts ON DELETE CASCADE, except
// the friend inputs' marks, which reference the subject only.
func (p *pgStore) DeleteAccount(ctx context.Context, id string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM accounts WHERE id = $1`, id)
	return err
}

func (p *pgStore) PutSession(ctx context.Context, s Session) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO account_sessions (id, account_id, label, seen_on) VALUES ($1, $2, $3, $4)`, s.ID, s.AccountID, s.Label, s.SeenOn)
	return err
}

func (p *pgStore) TouchSession(ctx context.Context, id, today string) (Session, error) {
	var s Session
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `UPDATE account_sessions SET seen_on = $2 WHERE id = $1 RETURNING id, account_id, label, seen_on::text`, id, today).
			Scan(&s.ID, &s.AccountID, &s.Label, &s.SeenOn)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoSession
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE accounts SET seen_on = $2 WHERE id = $1 AND seen_on <> $2`, s.AccountID, today)
		return err
	})
	return s, err
}

func (p *pgStore) Sessions(ctx context.Context, accountID string) ([]Session, error) {
	rows, err := p.pool.Query(ctx, `SELECT id, account_id, label, seen_on::text FROM account_sessions WHERE account_id = $1 ORDER BY seen_on DESC, id`, accountID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Session, error) {
		var s Session
		return s, r.Scan(&s.ID, &s.AccountID, &s.Label, &s.SeenOn)
	})
}

func (p *pgStore) DeleteSession(ctx context.Context, accountID, id string) (bool, error) {
	tag, err := p.pool.Exec(ctx, `DELETE FROM account_sessions WHERE id = $1 AND account_id = $2`, id, accountID)
	return err == nil && tag.RowsAffected() > 0, err
}

func (p *pgStore) PutCode(ctx context.Context, c LoginCode) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO login_codes (login_key, code_hash, expires, tries) VALUES ($1, $2, $3, 0)
		ON CONFLICT (login_key) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires = EXCLUDED.expires, tries = 0`, c.Key, c.CodeHash, c.Expires)
	return err
}

func (p *pgStore) CheckCode(ctx context.Context, key, hash string, now time.Time) (bool, error) {
	good := false
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		var stored string
		var expires time.Time
		var tries int16
		err := tx.QueryRow(ctx, `SELECT code_hash, expires, tries FROM login_codes WHERE login_key = $1 FOR UPDATE`, key).Scan(&stored, &expires, &tries)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if !now.Before(expires) || stored == hash || int(tries)+1 >= maxCodeTries {
			good = now.Before(expires) && stored == hash
			_, err = tx.Exec(ctx, `DELETE FROM login_codes WHERE login_key = $1`, key)
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE login_codes SET tries = tries + 1 WHERE login_key = $1`, key)
		return err
	})
	return good, err
}

func (p *pgStore) PutSyncPhrase(ctx context.Context, id string, sealed []byte) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO account_sync (account_id, sealed) VALUES ($1, $2)
		ON CONFLICT (account_id) DO UPDATE SET sealed = EXCLUDED.sealed`, id, sealed)
	return err
}

func (p *pgStore) SyncPhrase(ctx context.Context, id string) ([]byte, error) {
	var b []byte
	err := p.pool.QueryRow(ctx, `SELECT sealed FROM account_sync WHERE account_id = $1`, id).Scan(&b)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return b, err
}

func (p *pgStore) DeleteSyncPhrase(ctx context.Context, id string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM account_sync WHERE account_id = $1`, id)
	return err
}

// MoveMirror moves one phone's rows under both devices' locks, taken in a
// fixed order so two moves cannot wait on each other.
func (p *pgStore) MoveMirror(ctx context.Context, from, to string) error {
	if from == to {
		return nil
	}
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		first, second := from, to
		if second < first {
			first, second = second, first
		}
		for _, k := range []string{first, second} {
			if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, hashtext($2))`, deviceLockSpace, k); err != nil {
				return err
			}
		}
		var forgotten bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM forgotten_devices WHERE device_key = $1)`, to).Scan(&forgotten); err != nil {
			return err
		}
		if forgotten {
			return ErrDeviceForgotten
		}
		for _, sql := range []string{
			`INSERT INTO mirror_answers (device_key, question_id, edition_date, theme, option_id, depth, evening, verdict)
			 SELECT $2, question_id, edition_date, theme, option_id, depth, evening, verdict FROM mirror_answers WHERE device_key = $1
			 ON CONFLICT (device_key, question_id) DO NOTHING`,
			`DELETE FROM mirror_answers WHERE device_key = $1`,
			`INSERT INTO mirror_steps (device_key, question_id, option_id, started_on, status, updated_at, need_step)
			 SELECT $2, question_id, option_id, started_on, status, updated_at, need_step FROM mirror_steps WHERE device_key = $1
			 ON CONFLICT (device_key, question_id) DO NOTHING`,
			`DELETE FROM mirror_steps WHERE device_key = $1`,
			`INSERT INTO mirror_plan_checks (device_key, check_key, checked_on, status)
			 SELECT $2, check_key, checked_on, status FROM mirror_plan_checks WHERE device_key = $1
			 ON CONFLICT (device_key, check_key) DO NOTHING`,
			`DELETE FROM mirror_plan_checks WHERE device_key = $1`,
			`INSERT INTO mirror_weeks (device_key, monday, summary)
			 SELECT $2, monday, summary FROM mirror_weeks WHERE device_key = $1
			 ON CONFLICT (device_key, monday) DO NOTHING`,
			`DELETE FROM mirror_weeks WHERE device_key = $1`,
		} {
			args := []any{from}
			if strings.Contains(sql, "$2") {
				args = append(args, to)
			}
			if _, err := tx.Exec(ctx, sql, args...); err != nil {
				return err
			}
		}
		return nil
	})
}

// The circle.

func (p *pgStore) Befriend(ctx context.Context, a, b, tagA, tagB, today string) error {
	err := pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		for _, row := range [][3]string{{a, b, tagA}, {b, a, tagB}} {
			if _, err := tx.Exec(ctx, `INSERT INTO friendships (a, b, tag, since) VALUES ($1, $2, $3, $4) ON CONFLICT (a, b) DO NOTHING`,
				row[0], row[1], row[2], today); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `DELETE FROM circle_asks WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)`, a, b)
		return err
	})
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23503" {
		return ErrNoAccount
	}
	return err
}

func (p *pgStore) Unfriend(ctx context.Context, a, b string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM friendships WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)`, a, b)
	return err
}

func (p *pgStore) SetFriend(ctx context.Context, a, b, tag string, muted bool) error {
	t, err := p.pool.Exec(ctx, `UPDATE friendships SET tag = $3, muted = $4 WHERE a = $1 AND b = $2`, a, b, tag, muted)
	if err == nil && t.RowsAffected() == 0 {
		return ErrNotFriends
	}
	return err
}

func (p *pgStore) Friends(ctx context.Context, id string) ([]Friend, error) {
	rows, err := p.pool.Query(ctx, `SELECT f.b, x.name, coalesce(x.handle, ''), f.tag, f.since::text, f.muted, x.seen_on::text, x.connect
		FROM friendships f JOIN accounts x ON x.id = f.b WHERE f.a = $1 ORDER BY f.since, x.name, f.b`, id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Friend, error) {
		var f Friend
		return f, r.Scan(&f.AccountID, &f.Name, &f.Handle, &f.Tag, &f.Since, &f.Muted, &f.SeenOn, &f.Connect)
	})
}

func (p *pgStore) AreFriends(ctx context.Context, a, b string) (bool, error) {
	var ok bool
	err := p.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM friendships WHERE a = $1 AND b = $2)`, a, b).Scan(&ok)
	return ok, err
}

func (p *pgStore) PutInvite(ctx context.Context, inv Invite) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO circle_invites (code, account_id, tag, expires_on) VALUES ($1, $2, $3, $4)`, inv.Code, inv.AccountID, inv.Tag, inv.ExpiresOn)
	return err
}

func scanInvite(row pgx.Row) (Invite, error) {
	var inv Invite
	err := row.Scan(&inv.Code, &inv.AccountID, &inv.Tag, &inv.ExpiresOn)
	if errors.Is(err, pgx.ErrNoRows) {
		return Invite{}, ErrNotFound
	}
	return inv, err
}

func (p *pgStore) GetInvite(ctx context.Context, code string) (Invite, error) {
	return scanInvite(p.pool.QueryRow(ctx, `SELECT code, account_id, tag, expires_on::text FROM circle_invites WHERE code = $1`, code))
}

func (p *pgStore) InviteFor(ctx context.Context, id, tag, today string) (Invite, error) {
	return scanInvite(p.pool.QueryRow(ctx, `SELECT code, account_id, tag, expires_on::text FROM circle_invites
		WHERE account_id = $1 AND tag = $2 AND expires_on > $3 ORDER BY expires_on DESC LIMIT 1`, id, tag, today))
}

func (p *pgStore) PutRoom(ctx context.Context, r Room) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		t, err := tx.Exec(ctx, `INSERT INTO circle_rooms (code, account_id, tag, expires) VALUES ($1, $2, $3, $4)
			ON CONFLICT (code) DO UPDATE SET account_id = EXCLUDED.account_id, tag = EXCLUDED.tag, expires = EXCLUDED.expires
			WHERE circle_rooms.expires <= $4 - $5::interval`, r.Code, r.AccountID, r.Tag, r.Expires, roomLife.String())
		if err != nil {
			return err
		}
		if t.RowsAffected() == 0 {
			return ErrCodeTaken
		}
		if _, err := tx.Exec(ctx, `DELETE FROM circle_room_members WHERE code = $1`, r.Code); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO circle_room_members (code, account_id) VALUES ($1, $2)`, r.Code, r.AccountID)
		return err
	})
}

func scanRoom(row pgx.Row) (Room, error) {
	var r Room
	err := row.Scan(&r.Code, &r.AccountID, &r.Tag, &r.Expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return Room{}, ErrNotFound
	}
	return r, err
}

func (p *pgStore) GetRoom(ctx context.Context, code string, now time.Time) (Room, error) {
	return scanRoom(p.pool.QueryRow(ctx, `SELECT code, account_id, tag, expires FROM circle_rooms WHERE code = $1 AND expires > $2`, code, now))
}

func (p *pgStore) OpenRoomOf(ctx context.Context, id string, now time.Time) (Room, error) {
	return scanRoom(p.pool.QueryRow(ctx, `SELECT code, account_id, tag, expires FROM circle_rooms WHERE account_id = $1 AND expires > $2
		ORDER BY expires DESC LIMIT 1`, id, now))
}

func (p *pgStore) JoinRoom(ctx context.Context, code, id string) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO circle_room_members (code, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, code, id)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23503" {
		return ErrNotFound
	}
	return err
}

func (p *pgStore) RoomMembers(ctx context.Context, code string) ([]string, error) {
	rows, err := p.pool.Query(ctx, `SELECT account_id FROM circle_room_members WHERE code = $1 ORDER BY account_id`, code)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

func (p *pgStore) RoomsOf(ctx context.Context, id string, now time.Time) ([]Room, error) {
	rows, err := p.pool.Query(ctx, `SELECT r.code, r.account_id, r.tag, r.expires FROM circle_room_members m JOIN circle_rooms r ON r.code = m.code
		WHERE m.account_id = $1 AND r.expires > $2 ORDER BY r.code`, id, now)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Room, error) {
		var x Room
		return x, r.Scan(&x.Code, &x.AccountID, &x.Tag, &x.Expires)
	})
}

func (p *pgStore) Ask(ctx context.Context, a, b string) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO circle_asks (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING`, a, b)
	return err
}

func (p *pgStore) Asked(ctx context.Context, a, b string) (bool, error) {
	var ok bool
	err := p.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM circle_asks WHERE a = $1 AND b = $2)`, a, b).Scan(&ok)
	return ok, err
}

func (p *pgStore) Dismiss(ctx context.Context, a, b string) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO circle_dismissed (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING`, a, b); err != nil {
			var pg *pgconn.PgError
			if errors.As(err, &pg) && pg.Code == "23503" {
				return nil // no such account: nothing to dismiss
			}
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM circle_asks WHERE a = $2 AND b = $1`, a, b)
		return err
	})
}

func (p *pgStore) Suggestions(ctx context.Context, id string, now time.Time) ([]Suggestion, error) {
	rows, err := p.pool.Query(ctx, `
		WITH mine AS (SELECT b FROM friendships WHERE a = $1),
		skip AS (SELECT b FROM mine UNION SELECT b FROM circle_dismissed WHERE a = $1 UNION SELECT $1),
		asked AS (SELECT a AS who, true AS asked, NULL::text AS room, NULL::text AS mutual FROM circle_asks WHERE b = $1),
		rooms AS (
			SELECT o.account_id AS who, false, min(r.code), NULL::text
			FROM circle_room_members me JOIN circle_rooms r ON r.code = me.code AND r.expires > $2
			JOIN circle_room_members o ON o.code = me.code
			WHERE me.account_id = $1 GROUP BY o.account_id),
		fof AS (
			SELECT f2.b AS who, false, NULL::text, x.name
			FROM mine JOIN friendships f2 ON f2.a = mine.b JOIN accounts x ON x.id = mine.b
			JOIN accounts y ON y.id = f2.b AND y.suggest)
		SELECT s.who, a.name, coalesce(a.handle, ''), s.asked, coalesce(s.room, ''), coalesce(s.mutual, '')
		FROM (SELECT * FROM asked UNION ALL SELECT * FROM rooms UNION ALL SELECT * FROM fof) s(who, asked, room, mutual)
		JOIN accounts a ON a.id = s.who
		WHERE s.who NOT IN (SELECT b FROM skip)`, id, now)
	if err != nil {
		return nil, err
	}
	type row struct {
		who, name, handle, room, mutual string
		asked                           bool
	}
	all, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (row, error) {
		var x row
		return x, r.Scan(&x.who, &x.name, &x.handle, &x.asked, &x.room, &x.mutual)
	})
	if err != nil {
		return nil, err
	}
	found := map[string]*Suggestion{}
	mutual := map[string][]string{}
	for _, x := range all {
		s := found[x.who]
		if s == nil {
			s = &Suggestion{AccountID: x.who, Name: x.name, Handle: x.handle}
		}
		s.Asked = s.Asked || x.asked
		if x.room != "" {
			s.Room = x.room
		}
		if x.mutual != "" {
			mutual[x.who] = append(mutual[x.who], x.mutual)
		}
		found[x.who] = s
	}
	out := []Suggestion{}
	for who, s := range found {
		if len(mutual[who]) >= minMutualFriends {
			sort.Strings(mutual[who])
			s.Mutual = mutual[who]
		}
		if s.Asked || s.Room != "" || len(s.Mutual) > 0 {
			out = append(out, *s)
		}
	}
	sortSuggestions(out)
	return out, nil
}

func (p *pgStore) AnswerFriend(ctx context.Context, asker, date string, in FriendInput) error {
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		t, err := tx.Exec(ctx, `INSERT INTO friend_prompt_log (asker, asked_on) VALUES ($1, $2) ON CONFLICT DO NOTHING`, asker, date)
		if err != nil {
			return err
		}
		if t.RowsAffected() == 0 {
			return ErrAlreadyAnswered
		}
		_, err = tx.Exec(ctx, `INSERT INTO friend_mirror_inputs (subject, monday, question_id, option_id, mark) VALUES ($1, $2, $3, $4, $5)`,
			in.Subject, in.Monday, in.QuestionID, in.OptionID, in.Mark)
		return err
	})
}

func (p *pgStore) AnsweredFriendOn(ctx context.Context, asker, date string) (bool, error) {
	var ok bool
	err := p.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM friend_prompt_log WHERE asker = $1 AND asked_on = $2)`, asker, date).Scan(&ok)
	return ok, err
}

func (p *pgStore) FriendInputs(ctx context.Context, subject, from string) ([]FriendInput, error) {
	rows, err := p.pool.Query(ctx, `SELECT subject, monday::text, question_id, option_id, mark FROM friend_mirror_inputs
		WHERE subject = $1 AND monday >= $2`, subject, from)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (FriendInput, error) {
		var in FriendInput
		return in, r.Scan(&in.Subject, &in.Monday, &in.QuestionID, &in.OptionID, &in.Mark)
	})
}

func (p *pgStore) PutNod(ctx context.Context, n Nod) error {
	t, err := p.pool.Exec(ctx, `INSERT INTO nods (sender, receiver, nodded_on, card) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, n.From, n.To, n.Date, n.Card)
	if err == nil && t.RowsAffected() == 0 {
		return ErrAlreadyNodded
	}
	return err
}

func scanNods(rows pgx.Rows, err error) ([]Nod, error) {
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Nod, error) {
		var n Nod
		return n, r.Scan(&n.From, &n.To, &n.Date, &n.Card)
	})
}

func (p *pgStore) NodsTo(ctx context.Context, to, from string) ([]Nod, error) {
	return scanNods(p.pool.Query(ctx, `SELECT sender, receiver, nodded_on::text, card FROM nods WHERE receiver = $1 AND nodded_on >= $2
		ORDER BY nodded_on DESC, sender`, to, from))
}

func (p *pgStore) NodsFrom(ctx context.Context, from, date string) ([]Nod, error) {
	return scanNods(p.pool.Query(ctx, `SELECT sender, receiver, nodded_on::text, card FROM nods WHERE sender = $1 AND nodded_on = $2`, from, date))
}

const togetherColumns = `id, asker, invitee, question_id, asker_option, coalesce(invitee_option, ''), invitee_hidden, expires`

func scanTogether(r pgx.Row) (Together, error) {
	var t Together
	err := r.Scan(&t.ID, &t.Asker, &t.Invitee, &t.QuestionID, &t.AskerOption, &t.InviteeOption, &t.InviteeHidden, &t.Expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return Together{}, ErrNotFound
	}
	return t, err
}

func (p *pgStore) PutTogether(ctx context.Context, t Together) error {
	_, err := p.pool.Exec(ctx, `INSERT INTO together (id, asker, invitee, question_id, asker_option, expires) VALUES ($1, $2, $3, $4, $5, $6)`,
		t.ID, t.Asker, t.Invitee, t.QuestionID, t.AskerOption, t.Expires)
	return err
}

func (p *pgStore) GetTogether(ctx context.Context, id string) (Together, error) {
	return scanTogether(p.pool.QueryRow(ctx, `SELECT `+togetherColumns+` FROM together WHERE id = $1`, id))
}

func (p *pgStore) AnswerTogether(ctx context.Context, id, invitee, option string) error {
	t, err := p.pool.Exec(ctx, `UPDATE together SET invitee_option = $3 WHERE id = $1 AND invitee = $2 AND invitee_option IS NULL`, id, invitee, option)
	if err == nil && t.RowsAffected() == 0 {
		if _, err := p.GetTogether(ctx, id); err != nil {
			return ErrNotFound
		}
		return ErrAlreadyAnswered
	}
	return err
}

func (p *pgStore) HideTogether(ctx context.Context, id, invitee string) error {
	t, err := p.pool.Exec(ctx, `UPDATE together SET invitee_hidden = true WHERE id = $1 AND invitee = $2`, id, invitee)
	if err == nil && t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (p *pgStore) DeleteTogether(ctx context.Context, id, asker string) error {
	t, err := p.pool.Exec(ctx, `DELETE FROM together WHERE id = $1 AND asker = $2`, id, asker)
	if err == nil && t.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (p *pgStore) Togethers(ctx context.Context, id string) ([]Together, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+togetherColumns+` FROM together WHERE asker = $1 OR invitee = $1 ORDER BY expires DESC`, id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Together, error) { return scanTogether(r) })
}

func (p *pgStore) DeleteSocialBefore(ctx context.Context, date string, now time.Time) (int, error) {
	n := 0
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM friend_mirror_inputs WHERE monday < $1`, []any{mondayOf(date)}},
		{`DELETE FROM friend_prompt_log WHERE asked_on < $1`, []any{date}},
		{`DELETE FROM nods WHERE nodded_on < $1`, []any{date}},
		{`DELETE FROM together WHERE expires <= $1`, []any{now.Add(-togetherShownAfter)}},
		{`DELETE FROM login_codes WHERE expires <= $1`, []any{now}},
		{`DELETE FROM circle_rooms WHERE expires <= $1`, []any{now}},
		{`DELETE FROM circle_invites WHERE expires_on < $1`, []any{date}},
	} {
		t, err := p.pool.Exec(ctx, q.sql, q.args...)
		if err != nil {
			return n, err
		}
		n += int(t.RowsAffected())
	}
	return n, nil
}
