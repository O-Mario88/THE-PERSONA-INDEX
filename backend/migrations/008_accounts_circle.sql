-- Stage 5 (Edwin, 2026-10-24): lazy accounts and the circle. See social.go
-- for what each table may hold and why. Nothing here holds an answer, a
-- vote, an email address or a phone number.

CREATE TABLE IF NOT EXISTS accounts (
    id         text    PRIMARY KEY,           -- random, 16 bytes base64url
    name       text    NOT NULL DEFAULT '',   -- display name, what friends see
    handle     text,                          -- lower-case, for invites
    created_on date    NOT NULL,
    seen_on    date    NOT NULL,              -- the last day a session was used; never a moment
    suggest    boolean NOT NULL DEFAULT true, -- may be suggested to friends of friends
    connect    boolean NOT NULL DEFAULT true, -- quiet nods and Answer Together on
    epoch      integer NOT NULL DEFAULT 0,    -- times it deleted everything (the device id moves on)
    sync       boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_handle ON accounts (handle) WHERE handle IS NOT NULL;

-- Each way of signing in, as a keyed hash of "kind:subject". The hint is
-- what the account screen shows ("a•••@gmail.com"), never the address.
CREATE TABLE IF NOT EXISTS account_logins (
    login_key  text PRIMARY KEY,
    account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('email', 'phone', 'google', 'apple')),
    hint       text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS account_logins_account ON account_logins (account_id);

CREATE TABLE IF NOT EXISTS account_sessions (
    id         text PRIMARY KEY,
    account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    label      text NOT NULL DEFAULT '',
    seen_on    date NOT NULL
);

CREATE INDEX IF NOT EXISTS account_sessions_account ON account_sessions (account_id);

-- 6-digit codes waiting to be typed: a keyed hash, ten minutes, five tries.
CREATE TABLE IF NOT EXISTS login_codes (
    login_key text        PRIMARY KEY,
    code_hash text        NOT NULL,
    expires   timestamptz NOT NULL,
    tries     smallint    NOT NULL DEFAULT 0
);

-- The backup phrase, sealed with a server key, only while sync is on.
CREATE TABLE IF NOT EXISTS account_sync (
    account_id text  PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    sealed     bytea NOT NULL
);

-- Friendships, one row per side: how a files b, and whether a muted b.
CREATE TABLE IF NOT EXISTS friendships (
    a     text    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    b     text    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    tag   text    NOT NULL CHECK (tag IN ('work', 'family', 'school', 'friends')),
    since date    NOT NULL,
    muted boolean NOT NULL DEFAULT false,
    PRIMARY KEY (a, b),
    CHECK (a <> b)
);

CREATE INDEX IF NOT EXISTS friendships_b ON friendships (b);

CREATE TABLE IF NOT EXISTS circle_invites (
    code       text PRIMARY KEY,
    account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    tag        text NOT NULL,
    expires_on date NOT NULL
);

CREATE INDEX IF NOT EXISTS circle_invites_account ON circle_invites (account_id);

CREATE TABLE IF NOT EXISTS circle_rooms (
    code       text        PRIMARY KEY,
    account_id text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    tag        text        NOT NULL,
    expires    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS circle_rooms_account ON circle_rooms (account_id);

CREATE TABLE IF NOT EXISTS circle_room_members (
    code       text NOT NULL REFERENCES circle_rooms (code) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    PRIMARY KEY (code, account_id)
);

CREATE INDEX IF NOT EXISTS circle_room_members_account ON circle_room_members (account_id);

-- a asked to connect with b; or a dismissed b as a suggestion.
CREATE TABLE IF NOT EXISTS circle_asks (
    a text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    b text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS circle_dismissed (
    a text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    b text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    PRIMARY KEY (a, b)
);

-- Friend answers. Two tables that cannot be joined: the prompt log says only
-- that the asker answered a friend question on a day; the inputs say only
-- what was said about the subject, in which week, with a keyed mark that
-- counts distinct friends. No sender anywhere.
CREATE TABLE IF NOT EXISTS friend_prompt_log (
    asker    text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    asked_on date NOT NULL,
    PRIMARY KEY (asker, asked_on)
);

CREATE TABLE IF NOT EXISTS friend_mirror_inputs (
    subject     text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    monday      date NOT NULL,
    question_id text NOT NULL,
    option_id   text NOT NULL,
    mark        text NOT NULL
);

CREATE INDEX IF NOT EXISTS friend_mirror_inputs_subject ON friend_mirror_inputs (subject, monday);
CREATE INDEX IF NOT EXISTS friend_mirror_inputs_monday ON friend_mirror_inputs (monday);

-- Quiet nods: a fixed card, once a day per pair. Never counted.
CREATE TABLE IF NOT EXISTS nods (
    sender    text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    receiver  text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    nodded_on date NOT NULL,
    card      text NOT NULL,
    PRIMARY KEY (sender, receiver, nodded_on)
);

CREATE INDEX IF NOT EXISTS nods_receiver ON nods (receiver, nodded_on);

-- Answer Together: gone a day after it expires. Never fed to a mirror.
CREATE TABLE IF NOT EXISTS together (
    id             text        PRIMARY KEY,
    asker          text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    invitee        text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    question_id    text        NOT NULL,
    asker_option   text        NOT NULL,
    invitee_option text,
    invitee_hidden boolean     NOT NULL DEFAULT false,
    expires        timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS together_asker ON together (asker);
CREATE INDEX IF NOT EXISTS together_invitee ON together (invitee);
