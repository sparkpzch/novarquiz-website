-- Bring the 005 base schema to the table names used by the application.
-- Existing databases may already have these changes from earlier manual migrations.
DO $$
BEGIN
  IF to_regclass('public.question_sessions') IS NOT NULL
     AND to_regclass('public.quizzes') IS NULL THEN
    ALTER TABLE question_sessions RENAME TO quizzes;
  END IF;

  IF to_regclass('public.play_sessions') IS NOT NULL
     AND to_regclass('public.sessions') IS NULL THEN
    ALTER TABLE play_sessions RENAME TO sessions;
  END IF;
END $$;

ALTER TABLE quizzes
  ALTER COLUMN timer_seconds DROP NOT NULL,
  ALTER COLUMN timer_seconds SET DEFAULT NULL;

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS play_sessions_current_question_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_current_question_id_fkey'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_current_question_id_fkey
      FOREIGN KEY (current_question_id) REFERENCES questions(id) ON DELETE SET NULL;
  END IF;
END $$;
