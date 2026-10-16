-- The tap under each insight card says whether the card fits: "That's me",
-- "Partly" or "Not me", in place of "I learned something" (Phase 2 of the
-- review of 2026-10-15). A card someone found true of them is the nearest
-- the old tap comes to "That's me", so an old "learned" becomes "me" and an
-- old "not" becomes "not_me"; nothing becomes "partly".
ALTER TABLE mirror_answers ADD COLUMN IF NOT EXISTS verdict text
    CHECK (verdict IN ('me', 'partly', 'not_me'));
UPDATE mirror_answers SET verdict = CASE WHEN learned THEN 'me' ELSE 'not_me' END
WHERE learned IS NOT NULL AND verdict IS NULL;
ALTER TABLE mirror_answers DROP COLUMN IF EXISTS learned;

-- Week summaries counted "learned"; they now count "me", "partly", "notMe".
UPDATE mirror_weeks
SET summary = (summary - 'learned') || jsonb_build_object('me', summary -> 'learned')
WHERE summary ? 'learned';

-- Ratings are votes under "rating/<question>": "<option>/learned" becomes
-- "<option>/me", in the raw votes and in the published counts. "/not" keeps
-- its name.
UPDATE votes SET option_id = left(option_id, length(option_id) - length('/learned')) || '/me'
WHERE question_id LIKE 'rating/%' AND option_id LIKE '%/learned';

INSERT INTO vote_tallies (question_id, option_id, count)
SELECT question_id, left(option_id, length(option_id) - length('/learned')) || '/me', count
FROM vote_tallies
WHERE question_id LIKE 'rating/%' AND option_id LIKE '%/learned'
ON CONFLICT (question_id, option_id) DO UPDATE SET count = vote_tallies.count + EXCLUDED.count;
DELETE FROM vote_tallies WHERE question_id LIKE 'rating/%' AND option_id LIKE '%/learned';
