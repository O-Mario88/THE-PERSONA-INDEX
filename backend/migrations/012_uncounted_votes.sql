-- Clear choices for the shared totals (Edwin, 2026-10-29). A phone that has
-- not said yes to adding its answers to the anonymous totals still sends each
-- answer, so its own mirror has it and the one-answer rule holds, but the vote
-- is marked not counted and the tally skips it (api.go, pgstore.go Tally).
-- Every vote already stored was counted, so the default keeps them as they are.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS counted boolean NOT NULL DEFAULT true;
