-- Per-choice scoring rework.
--
-- Previously: each choice had `is_correct` (bool); the play page awarded a
-- time-bonus for correct answers and 0 for wrong. This locked us into a single
-- "right answer" model.
--
-- Now: every choice carries its own signed `points` value (default 0). A
-- player's score is just the running sum of the points on the choices they
-- pick along their path. The timer becomes a count-up (recorded in
-- `user_answers.time_taken_ms`) used purely for analytics — it no longer
-- affects scoring.
--
-- `user_answers.is_correct` is also dropped because the concept of "correct"
-- no longer exists at the schema level. Analytics that need it can read
-- `points_earned > 0` instead.

ALTER TABLE choices
    ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows: anything previously marked correct gets 1 point,
-- everything else stays at 0 (the column default already covered that, but
-- be explicit so this migration is idempotent on partially-applied DBs).
UPDATE choices
SET points = CASE WHEN is_correct THEN 1 ELSE 0 END;

ALTER TABLE choices
    DROP COLUMN IF EXISTS is_correct;

-- user_answers no longer carries is_correct. points_earned + time_taken_ms
-- already cover both scoring and timing analytics.
ALTER TABLE user_answers
    DROP COLUMN IF EXISTS is_correct;
