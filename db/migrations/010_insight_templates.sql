-- Player-facing insight summaries for the /stats page.
--
-- The claim shown to a player is never generated at request time. Each row is
-- authored (or LLM-drafted) ahead of publish, reviewed by a human, and only
-- served once review_status = 'approved'. This keeps every medical-adjacent
-- sentence inside the same review path as the quiz content itself.
--
-- Resolution is most-specific-first: a row scoped to one quiz beats a global
-- row (quiz_id IS NULL), and a row scoped to one clinical tag beats the
-- tag-agnostic row (clinical_tag = '').

CREATE TABLE IF NOT EXISTS insight_templates (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id          uuid REFERENCES quizzes ON DELETE CASCADE,
  archetype_id     text        NOT NULL,
  clinical_tag     text        NOT NULL DEFAULT '',
  audience         text        NOT NULL DEFAULT 'public',
  locale           text        NOT NULL DEFAULT 'th',
  headline         text        NOT NULL,
  body             text        NOT NULL,
  suggestion       text,
  review_status    text        NOT NULL DEFAULT 'draft',
  source           text        NOT NULL DEFAULT 'manual',
  model            text,
  created_by       varchar(128) NOT NULL,
  reviewed_by      varchar(128),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insight_templates_audience_check
    CHECK (audience IN ('public', 'hcp')),
  CONSTRAINT insight_templates_locale_check
    CHECK (locale IN ('th', 'en')),
  CONSTRAINT insight_templates_review_status_check
    CHECK (review_status IN ('draft', 'reviewed', 'approved')),
  CONSTRAINT insight_templates_source_check
    CHECK (source IN ('manual', 'llm_draft'))
);

-- One row per resolution key. NULL quiz_id would defeat a plain UNIQUE, so the
-- global rows get their own partial index.
CREATE UNIQUE INDEX IF NOT EXISTS insight_templates_scoped_key
  ON insight_templates (quiz_id, archetype_id, clinical_tag, audience, locale)
  WHERE quiz_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS insight_templates_global_key
  ON insight_templates (archetype_id, clinical_tag, audience, locale)
  WHERE quiz_id IS NULL;

CREATE INDEX IF NOT EXISTS insight_templates_lookup
  ON insight_templates (archetype_id, audience, locale)
  WHERE review_status = 'approved';
