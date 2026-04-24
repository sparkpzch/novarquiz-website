-- Allow timer_seconds to be NULL on a quiz, meaning "no timer".
-- This was previously made nullable in 004 but reintroduced as NOT NULL in 005.
-- Since the table is now called 'quizzes' (from 007), we apply it there.

ALTER TABLE quizzes
    ALTER COLUMN timer_seconds DROP NOT NULL,
    ALTER COLUMN timer_seconds SET DEFAULT NULL;
