-- Allow timer_seconds to be NULL on a session, meaning "no timer" (questions
-- are never timed out). Previously the column had a NOT NULL DEFAULT 30
-- constraint which forced every session to have a timer.
--
-- When NULL:
--   - timer_override on individual questions is also ignored (no timer shown)
--   - The play page skips the countdown interval entirely
--
-- Existing rows keep their current value (30 or whatever was set); only new
-- sessions created with "no timer" will have NULL.

ALTER TABLE question_sessions
    ALTER COLUMN timer_seconds DROP NOT NULL,
    ALTER COLUMN timer_seconds SET DEFAULT NULL;
