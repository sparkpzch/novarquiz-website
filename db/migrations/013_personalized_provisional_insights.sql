-- Cache a generated summary by its source answer pattern. The fingerprint
-- contains no user ID, so identical answers can share one model call safely.
ALTER TABLE provisional_insight_summaries
  ADD COLUMN IF NOT EXISTS answer_signature text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS answer_context jsonb;

ALTER TABLE provisional_insight_summaries
  DROP CONSTRAINT IF EXISTS provisional_insight_quiz_locale_key;

ALTER TABLE provisional_insight_summaries
  ADD CONSTRAINT provisional_insight_answer_pattern_key
  UNIQUE (quiz_id, audience, locale, answer_signature);

CREATE INDEX IF NOT EXISTS provisional_insight_quiz_lookup
  ON provisional_insight_summaries (quiz_id, audience, locale);
