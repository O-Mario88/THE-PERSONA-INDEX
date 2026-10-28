-- What Helped (Insights Release 2, 2026-10-26; whathelped.go). After saving
-- "Something you could try", a person may say how it went. One row per phone
-- per step, kept apart from votes and the mirror:
--
--   - reporter_key is a keyed hash of the device id made with its own key,
--     never the votes' per-question key or the mirror's key, so this table
--     cannot be joined to either.
--   - A report keeps the Monday of its week, never the day or the moment.
--   - Sending again replaces the phone's report; it never adds one.
--   - "Delete everything" and deleting the account remove a phone's rows.
--
-- Totals show only once 50 reports stand, with any outcome under 10 folded.
CREATE TABLE IF NOT EXISTS what_helped (
    reporter_key  text NOT NULL,
    question_id   text NOT NULL,
    option_id     text NOT NULL,
    outcome       text NOT NULL CHECK (outcome IN ('helped_lot', 'helped_little', 'no_change', 'not_tried')),
    reported_week date NOT NULL,   -- the Monday of the week; never the day
    PRIMARY KEY (reporter_key, question_id, option_id)
);

CREATE INDEX IF NOT EXISTS what_helped_step ON what_helped (question_id, option_id);
