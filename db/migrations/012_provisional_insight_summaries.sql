-- Base table for provisional feedback. Migration 013 adds the answer-pattern
-- key and source context. The generating row is a cross-instance lease: only
-- its claim token may finish it.
CREATE TABLE IF NOT EXISTS provisional_insight_summaries (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id       uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  audience      text NOT NULL,
  locale        text NOT NULL,
  status        text NOT NULL DEFAULT 'generating',
  claim_token   uuid NOT NULL DEFAULT uuid_generate_v4(),
  headline      text,
  body          text,
  suggestion    text,
  model         text,
  reviewed_by   varchar(128),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisional_insight_audience_check CHECK (audience IN ('public', 'hcp')),
  CONSTRAINT provisional_insight_locale_check CHECK (locale IN ('th', 'en')),
  CONSTRAINT provisional_insight_status_check
    CHECK (status IN ('generating', 'provisional', 'approved', 'rejected', 'failed')),
  CONSTRAINT provisional_insight_quiz_locale_key UNIQUE (quiz_id, audience, locale)
);

CREATE INDEX IF NOT EXISTS provisional_insight_review_queue
  ON provisional_insight_summaries (updated_at DESC)
  WHERE status = 'provisional';

-- A reviewed or provisional summary is grounded in the authored quiz. If that
-- material changes, remove the old copy so the next player gets a fresh draft.
CREATE OR REPLACE FUNCTION invalidate_quiz_provisional_insights()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM provisional_insight_summaries WHERE quiz_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invalidate_provisional_on_quiz_content
AFTER UPDATE OF name, description, intended_audience, is_published ON quizzes
FOR EACH ROW EXECUTE FUNCTION invalidate_quiz_provisional_insights();

CREATE OR REPLACE FUNCTION invalidate_question_provisional_insights()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    DELETE FROM provisional_insight_summaries WHERE quiz_id = NEW.session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM provisional_insight_summaries WHERE quiz_id = OLD.session_id;
    RETURN OLD;
  END IF;
  DELETE FROM provisional_insight_summaries
  WHERE quiz_id IN (OLD.session_id, NEW.session_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER invalidate_provisional_on_question_content
AFTER INSERT OR UPDATE OR DELETE ON questions
FOR EACH ROW EXECUTE FUNCTION invalidate_question_provisional_insights();

CREATE OR REPLACE FUNCTION invalidate_choice_provisional_insights()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_question_id uuid;
BEGIN
  source_question_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.question_id ELSE NEW.question_id END;
  DELETE FROM provisional_insight_summaries
  WHERE quiz_id IN (SELECT session_id FROM questions WHERE id = source_question_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invalidate_provisional_on_choice_content
AFTER INSERT OR UPDATE OR DELETE ON choices
FOR EACH ROW EXECUTE FUNCTION invalidate_choice_provisional_insights();
