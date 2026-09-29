-- Retire choice-based HCP profiling while preserving answer utility and topic tags.
ALTER TABLE choices
  DROP COLUMN IF EXISTS vector_deltas CASCADE,
  DROP COLUMN IF EXISTS confidence_weight CASCADE,
  DROP COLUMN IF EXISTS allowed_usage CASCADE,
  DROP COLUMN IF EXISTS review_status CASCADE,
  DROP COLUMN IF EXISTS requires_hcp_version CASCADE;

ALTER TABLE user_answers
  DROP COLUMN IF EXISTS vector_scores CASCADE,
  DROP COLUMN IF EXISTS allowed_usage_snapshot CASCADE;

ALTER TABLE leaderboard_entries
  DROP COLUMN IF EXISTS profile_vector_scores CASCADE,
  DROP COLUMN IF EXISTS normalized_vector_scores CASCADE,
  DROP COLUMN IF EXISTS archetype_id CASCADE,
  DROP COLUMN IF EXISTS insight_classification CASCADE;
