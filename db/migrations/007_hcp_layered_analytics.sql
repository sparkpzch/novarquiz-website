ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS intended_audience text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS presentation_mode text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS reading_level text,
  ADD COLUMN IF NOT EXISTS jurisdiction_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medical_review_version text,
  ADD COLUMN IF NOT EXISTS legal_document_versions_required jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS intended_audience text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS presentation_mode text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS reading_level text,
  ADD COLUMN IF NOT EXISTS jurisdiction_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medical_review_version text,
  ADD COLUMN IF NOT EXISTS legal_document_versions_required jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE choices
  ADD COLUMN IF NOT EXISTS behavior_meaning text,
  ADD COLUMN IF NOT EXISTS vector_deltas jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS clinical_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_weight double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allowed_usage text NOT NULL DEFAULT 'aggregate_only',
  ADD COLUMN IF NOT EXISTS requires_hcp_version boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft';

ALTER TABLE user_answers
  ADD COLUMN IF NOT EXISTS vector_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS behavior_meaning_snapshot text,
  ADD COLUMN IF NOT EXISTS allowed_usage_snapshot text NOT NULL DEFAULT 'aggregate_only';

ALTER TABLE leaderboard_entries
  ADD COLUMN IF NOT EXISTS profile_vector_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS normalized_vector_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archetype_id text,
  ADD COLUMN IF NOT EXISTS insight_classification text NOT NULL DEFAULT 'aggregate';
