-- PDPA consent records (previously intended for Firestore `userConsents`,
-- which was never provisioned). One row per Firebase uid; re-consent
-- overwrites the row with the latest versions, purposes and proof fields.
CREATE TABLE IF NOT EXISTS user_consents (
  uid text PRIMARY KEY,
  tos_version text NOT NULL,
  privacy_version text NOT NULL,
  analytics_notice_version text,
  profiling_notice_version text,
  consent_purposes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  consented_at timestamptz NOT NULL DEFAULT now()
);
