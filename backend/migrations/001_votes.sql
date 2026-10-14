-- Raw votes double as the tally queue: a row with tallied_at IS NULL is work
-- the tally worker still has to fold into vote_tallies.
CREATE TABLE IF NOT EXISTS votes (
    id          text        PRIMARY KEY,
    question_id text        NOT NULL,
    option_id   text        NOT NULL,
    voter_hash  text        NOT NULL,          -- keyed hash of the device id, never the id itself
    idem_key    text        NOT NULL,
    dedupe_key  text        NOT NULL UNIQUE,   -- computed by voteDedupeKey (voterule.go)
    accepted_at timestamptz NOT NULL,
    tallied_at  timestamptz,
    UNIQUE (voter_hash, idem_key)
);

CREATE INDEX IF NOT EXISTS votes_untallied ON votes (accepted_at) WHERE tallied_at IS NULL;
CREATE INDEX IF NOT EXISTS votes_tallied_age ON votes (accepted_at) WHERE tallied_at IS NOT NULL;

-- Published counts. Kept forever; raw votes are deleted after the retention period.
CREATE TABLE IF NOT EXISTS vote_tallies (
    question_id text   NOT NULL,
    option_id   text   NOT NULL,
    count       bigint NOT NULL,
    PRIMARY KEY (question_id, option_id)
);
