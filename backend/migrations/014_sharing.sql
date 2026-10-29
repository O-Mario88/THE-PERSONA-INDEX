-- Connect as a place to feel understood by people you trust (Edwin,
-- 2026-10-29; closer.go, sharing.go). A shared item can now be something that
-- helped, a win, an excerpt of a reflection, an answer or part of a Mirror;
-- it says what kind of response would feel helpful, whether replies are
-- welcome, and whether it went to particular people or the Inner Circle.
ALTER TABLE shares ADD COLUMN IF NOT EXISTS mode     text    NOT NULL DEFAULT 'share';
ALTER TABLE shares ADD COLUMN IF NOT EXISTS replies  boolean NOT NULL DEFAULT true;
ALTER TABLE shares ADD COLUMN IF NOT EXISTS audience text    NOT NULL DEFAULT 'people';
ALTER TABLE shares DROP CONSTRAINT IF EXISTS shares_kind_check;
ALTER TABLE shares ADD CONSTRAINT shares_kind_check CHECK (kind IN ('helped', 'win', 'reflection', 'answer', 'mirror'));

-- share_notes: private replies. One thread per person an item went to
-- (with_account), between that person and the author only. Removing the
-- person from the item deletes their thread; withdrawing the item, or
-- deleting either account, deletes it too.
CREATE TABLE IF NOT EXISTS share_notes (
    id           text        PRIMARY KEY,
    share_id     text        NOT NULL REFERENCES shares (id) ON DELETE CASCADE,
    with_account text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    sender       text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    kind         text        NOT NULL CHECK (kind IN ('resonated', 'talk', 'similar', 'encourage', 'celebrate', 'words')),
    body         text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS share_notes_share ON share_notes (share_id, with_account);
