-- What you're reaching for (Stage 2 of the proposal of 2026-10-24). A card
-- offers two steps: its own, and one that serves the need the answer reached
-- for (needs.go). need_step says which one the person picked, so the mirror
-- shows the right words. Set when the step starts and never changed after.
ALTER TABLE mirror_steps ADD COLUMN IF NOT EXISTS need_step boolean NOT NULL DEFAULT false;
