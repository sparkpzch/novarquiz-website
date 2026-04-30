ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS media_provider text,
  ADD COLUMN IF NOT EXISTS mux_upload_id text,
  ADD COLUMN IF NOT EXISTS mux_asset_id text,
  ADD COLUMN IF NOT EXISTS mux_playback_id text,
  ADD COLUMN IF NOT EXISTS mux_status text,
  ADD COLUMN IF NOT EXISTS mux_poster_url text;

UPDATE questions
SET media_provider = 'firebase'
WHERE media_provider IS NULL AND media_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS mux_video_uploads (
  upload_id text PRIMARY KEY,
  question_id text NOT NULL,
  quiz_id text,
  file_name text,
  asset_id text,
  playback_id text,
  status text NOT NULL DEFAULT 'waiting',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mux_video_uploads_question_id
  ON mux_video_uploads(question_id);

CREATE INDEX IF NOT EXISTS idx_mux_video_uploads_asset_id
  ON mux_video_uploads(asset_id);
