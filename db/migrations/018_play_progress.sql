CREATE TABLE IF NOT EXISTS play_progress (
  session_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  attempt_boundary TEXT NOT NULL,
  question_id UUID NOT NULL,
  question_started_at BIGINT NOT NULL,
  started_at BIGINT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  answer JSONB,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);
