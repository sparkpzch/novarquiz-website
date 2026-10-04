ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS media_explanation text;

UPDATE questions
SET media_explanation = question_text
WHERE node_type = 'situation'
  AND media_url IS NOT NULL
  AND media_explanation IS NULL;
