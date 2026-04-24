#!/bin/sh
set -eu

echo "Bootstrapping Novarquiz schema from 005_somchai_refac.sql"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schema_migrations (
  file_name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

perl -0pe '
  s/alter\s+(table|function|index|sequence)\s+\S+[\s\S]*?\s+owner\s+to\s+\w+\s*;//gi;
  s/create\s+function\s+[\s\S]*?language\s+c[\s\S]*?\$\$\s*;//gi;
' /docker-entrypoint-migrations/005_somchai_refac.sql \
  | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
INSERT INTO schema_migrations (file_name)
VALUES ('005_somchai_refac.sql')
ON CONFLICT (file_name) DO NOTHING;
SQL
