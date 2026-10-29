-- The Outside Mirror as named notes (Edwin, 2026-10-29; outsidenotes.go).
-- A person (asker) invites one friend with a fixed prompt; the friend writes
-- a short note with their name on it, or declines (the row is deleted). The
-- asker keeps the note or dismisses it (deleted). An unanswered invitation
-- lapses after 30 days. Deleting either account deletes the row.
CREATE TABLE IF NOT EXISTS outside_notes (
    id         text        PRIMARY KEY,
    asker      text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    friend     text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    prompt_id  text        NOT NULL,
    body       text        NOT NULL DEFAULT '',
    status     text        NOT NULL CHECK (status IN ('asked', 'written', 'kept')),
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS outside_notes_asker ON outside_notes (asker);
CREATE INDEX IF NOT EXISTS outside_notes_friend ON outside_notes (friend);
