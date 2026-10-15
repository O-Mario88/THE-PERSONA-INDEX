-- The weekly mirror (mirrorstore.go). Each phone's answers and small steps,
-- kept so its mirror is built from the database. device_key is a keyed hash
-- of the device id (never the token), the same for all of one phone's rows;
-- the votes table keeps its per-question key and stays unlinkable on its own.
-- A private answer keeps no option, and its question id is a keyed hash.
-- Rows go after five weeks, and at once when the phone deletes everything.
CREATE TABLE IF NOT EXISTS mirror_answers (
    device_key   text        NOT NULL,
    question_id  text        NOT NULL,
    edition_date date        NOT NULL,
    theme        text        NOT NULL,
    option_id    text,                    -- NULL for a private answer
    depth        smallint    NOT NULL,    -- 0 for a private answer
    answered_at  timestamptz NOT NULL,
    learned      boolean,                 -- the "I learned something" tap, once given
    PRIMARY KEY (device_key, question_id)
);

CREATE INDEX IF NOT EXISTS mirror_answers_date ON mirror_answers (edition_date);

CREATE TABLE IF NOT EXISTS mirror_steps (
    device_key  text        NOT NULL,
    question_id text        NOT NULL,
    option_id   text        NOT NULL,
    started_on  date        NOT NULL,
    status      text        NOT NULL,     -- started | helped | no_change | not_tried
    updated_at  timestamptz NOT NULL,
    PRIMARY KEY (device_key, question_id)
);

CREATE INDEX IF NOT EXISTS mirror_steps_started ON mirror_steps (started_on);
