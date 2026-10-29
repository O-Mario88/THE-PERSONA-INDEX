-- Product counts (Edwin, 2026-10-29; productcounts.go, docs/first-release.md):
-- daily totals of four fixed events, sent only by phones whose person said
-- yes to "Count how I use the app". A row is a day, an event and a count:
-- no device, account, address, words or time of day.
CREATE TABLE IF NOT EXISTS product_counts (
    day   date   NOT NULL,
    event text   NOT NULL CHECK (event IN ('first_result', 'brief_used', 'second_mirror', 'step_helped')),
    count bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (day, event)
);
