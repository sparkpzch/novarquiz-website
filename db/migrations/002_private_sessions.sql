-- Add private session support: PIN access and shareable link token
ALTER TABLE question_sessions
    ADD COLUMN IF NOT EXISTS is_private   boolean      NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pin_code     varchar(6),
    ADD COLUMN IF NOT EXISTS share_token  uuid         NOT NULL DEFAULT gen_random_uuid();

-- Back-fill pin_code for existing rows (6-digit random number as text)
UPDATE question_sessions
SET pin_code = LPAD((FLOOR(RANDOM() * 900000) + 100000)::int::text, 6, '0')
WHERE pin_code IS NULL;

ALTER TABLE question_sessions
    ALTER COLUMN pin_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_share_token
    ON question_sessions (share_token);
