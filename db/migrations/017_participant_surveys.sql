CREATE TABLE IF NOT EXISTS participant_surveys (
  uid text PRIMARY KEY REFERENCES profiles(uid) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (length(first_name) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (length(last_name) BETWEEN 1 AND 80),
  age integer CHECK (age BETWEEN 1 AND 120),
  gender text NOT NULL CHECK (gender IN ('female','male','other','prefer_not_to_say')),
  weight_kg numeric CHECK (weight_kg BETWEEN 1 AND 500),
  height_cm numeric CHECK (height_cm BETWEEN 30 AND 250),
  activity text NOT NULL CHECK (activity IN ('low','moderate','high','prefer_not_to_say')),
  analytics_consent boolean NOT NULL DEFAULT false,
  survey_version text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
