-- Monthly, quarterly and yearly mirrors (period.go). Answers go after five
-- weeks, so each finished week of a phone's answers folds into one small
-- summary under the same device_key, kept thirteen months: counts, themes,
-- trait sums, the three answers that said the most in their own words and
-- the steps that helped. Never a private answer's question or option, and
-- nothing about other phones. Rows go at once when the phone deletes
-- everything.
CREATE TABLE IF NOT EXISTS mirror_weeks (
    device_key text  NOT NULL,
    monday     date  NOT NULL,
    summary    jsonb NOT NULL,
    PRIMARY KEY (device_key, monday)
);

CREATE INDEX IF NOT EXISTS mirror_weeks_monday ON mirror_weeks (monday);

-- One row per week folded for every phone, so a week with no summary for a
-- phone reads as a week it did not play, not a week with no record.
CREATE TABLE IF NOT EXISTS mirror_folds (
    monday    date        PRIMARY KEY,
    folded_at timestamptz NOT NULL
);
