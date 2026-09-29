-- 014_drop_clinical_metadata_columns.sql
-- Removes the clinical/regulatory metadata columns that are no longer used
-- from both the questions and quizzes tables.

ALTER TABLE questions
  DROP COLUMN IF EXISTS intended_audience,
  DROP COLUMN IF EXISTS presentation_mode,
  DROP COLUMN IF EXISTS reading_level,
  DROP COLUMN IF EXISTS jurisdiction_tags,
  DROP COLUMN IF EXISTS medical_review_version,
  DROP COLUMN IF EXISTS legal_document_versions_required;

ALTER TABLE quizzes
  DROP COLUMN IF EXISTS intended_audience,
  DROP COLUMN IF EXISTS presentation_mode,
  DROP COLUMN IF EXISTS reading_level,
  DROP COLUMN IF EXISTS jurisdiction_tags,
  DROP COLUMN IF EXISTS medical_review_version,
  DROP COLUMN IF EXISTS legal_document_versions_required;
