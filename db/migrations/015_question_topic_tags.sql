-- Normalize question-level topic tags for analytics lookups while retaining
-- choice.clinical_tags as the authoring source of truth.
CREATE TABLE IF NOT EXISTS question_topic_tags (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (question_id, tag),
  CHECK (length(btrim(tag)) > 0)
);

INSERT INTO question_topic_tags (question_id, tag)
SELECT DISTINCT c.question_id, btrim(tags.tag)
FROM choices c
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.clinical_tags, '[]'::jsonb)) AS tags(tag)
WHERE btrim(tags.tag) <> ''
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS user_answers_user_session_question_latest_idx
  ON user_answers (user_id, session_id, question_id, answered_at DESC, id DESC);

CREATE OR REPLACE FUNCTION refresh_question_topic_tags(target_question_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM question_topic_tags WHERE question_id = target_question_id;

  IF NOT EXISTS (SELECT 1 FROM questions WHERE id = target_question_id) THEN
    RETURN;
  END IF;

  INSERT INTO question_topic_tags (question_id, tag)
  SELECT DISTINCT c.question_id, btrim(tags.tag)
  FROM choices c
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.clinical_tags, '[]'::jsonb)) AS tags(tag)
  WHERE c.question_id = target_question_id
    AND btrim(tags.tag) <> ''
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION sync_question_topic_tags_from_choice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_question_topic_tags(OLD.question_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_question_topic_tags(NEW.question_id);
  IF TG_OP = 'UPDATE' AND OLD.question_id IS DISTINCT FROM NEW.question_id THEN
    PERFORM refresh_question_topic_tags(OLD.question_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS choices_sync_question_topic_tags ON choices;
CREATE TRIGGER choices_sync_question_topic_tags
AFTER INSERT OR UPDATE OR DELETE ON choices
FOR EACH ROW EXECUTE FUNCTION sync_question_topic_tags_from_choice();
