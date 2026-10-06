CREATE TABLE IF NOT EXISTS video_processing_jobs (
  id UUID PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_generation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  output_path TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  claim_token UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_path,source_generation)
);

ALTER TABLE video_processing_jobs ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION;
