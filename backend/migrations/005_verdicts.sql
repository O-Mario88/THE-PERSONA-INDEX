-- The tap under each insight card says whether the card fits: "That's me",
-- "Partly" or "Not me", in place of "I learned something" (Phase 2 of the
-- review of 2026-10-15). A card someone found true of them is the nearest
-- the old tap comes to "That's me", so an old "learned" becomes "me" and an
-- old "not" becomes "not_me"; nothing becomes "partly".
-- Like every migration, it changes nothing when run again.
ALTER TABLE mirror_answers ADD COLUMN IF NOT EXISTS verdict text
    CHECK (verdict IN ('me', 'partly', 'not_me'));
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'mirror_answers' AND column_name = 'learned') THEN
        UPDATE mirror_answers SET verdict = CASE WHEN learned THEN 'me' ELSE 'not_me' END
        WHERE learned IS NOT NULL AND verdict IS NULL;
        ALTER TABLE mirror_answers DROP COLUMN learned;
    END IF;
END $$;

-- Week summaries counted "rated" and, of those, "learned"; they now count
-- "me", "partly" and "notMe", and leave out a count of nought as before. A
-- summary written since always holds one of those once anything was rated,
-- so one that holds none of them is of the old shape.
UPDATE mirror_weeks
SET summary = (summary - 'learned') || jsonb_strip_nulls(jsonb_build_object(
    'me', nullif(coalesce((summary ->> 'learned')::int, 0), 0),
    'notMe', nullif((summary ->> 'rated')::int - coalesce((summary ->> 'learned')::int, 0), 0)))
WHERE (summary ? 'rated' OR summary ? 'learned') AND NOT summary ?| array['me', 'partly', 'notMe'];

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
