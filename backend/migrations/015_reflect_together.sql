-- Reflect together (Edwin, 2026-10-29; reflecttogether.go). One person asks
-- a friend a question from a fixed list; both answer privately; each chooses
-- to reveal ('shown') or keep their answer private ('kept'). An answer is
-- shown to the other only when both chose 'shown'. Read for 30 days; either
-- person leaving deletes the row, and so does deleting either account.
CREATE TABLE IF NOT EXISTS reflect_together (
    id             text        PRIMARY KEY,
    asker          text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    invitee        text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    question_id    text        NOT NULL,
    asker_option   text        NOT NULL,
    invitee_option text        NOT NULL DEFAULT '',
    asker_reveal   text        NOT NULL DEFAULT '' CHECK (asker_reveal IN ('', 'shown', 'kept')),
    invitee_reveal text        NOT NULL DEFAULT '' CHECK (invitee_reveal IN ('', 'shown', 'kept')),
    created_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS reflect_together_asker ON reflect_together (asker);
CREATE INDEX IF NOT EXISTS reflect_together_invitee ON reflect_together (invitee);
