-- Privacy fixes from the review of 2026-10-15.
--
-- 1. An answer keeps its date and sitting, never the moment it was given, so
--    a mirror row cannot be matched to a vote by time. (Votes are now stored
--    to the hour by the server, and an intimate vote stores "~private" in
--    place of its option, so the chosen option is never kept anywhere.)
-- 2. "Delete everything" marks the phone forgotten, so its old pass takes no
--    more writes and a vote retried after the delete cannot bring an answer
--    back. The mark goes after five weeks, with the rest of the mirror.
--
-- No deployment held real answers before this migration, so existing rows
-- are only brought into the new shape, not cleaned of past choices.
ALTER TABLE mirror_answers ADD COLUMN IF NOT EXISTS evening boolean NOT NULL DEFAULT false;
ALTER TABLE mirror_answers DROP COLUMN IF EXISTS answered_at;

UPDATE votes SET accepted_at = date_trunc('hour', accepted_at)
WHERE accepted_at <> date_trunc('hour', accepted_at);

CREATE TABLE IF NOT EXISTS forgotten_devices (
    device_key   text PRIMARY KEY,   -- the mirror key of a phone that deleted everything
    forgotten_on date NOT NULL
);

CREATE INDEX IF NOT EXISTS forgotten_devices_on ON forgotten_devices (forgotten_on);

-- Delete everything finds a phone's raw votes by their per-question keys,
-- through the unique (voter_hash, idem_key) index from 001.
