import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';

export const BASE_SCHEMA_FILE = '005_somchai_refac.sql';
export const RESET_BASE_SCHEMA_FILE = '006_reset_for_005.sql';
export const BASE_SCHEMA_VERSION = 5;

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations');

export function readMigrationSql(fileName: string) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf-8');
}

export function sanitizeBaseSchemaSql(rawSql: string) {
  let sql = rawSql;

  // Strip role ownership metadata from pg_dump output so the script works
  // across managed providers and local Postgres.
  sql = sql.replace(
    /alter\s+(table|function|index|sequence)\s+\S+[\s\S]*?\s+owner\s+to\s+\w+\s*;/gi,
    ''
  );

  // Strip uuid-ossp C function definitions from pg_dump output. The extension
  // already provides these functions and they cannot be created manually.
  sql = sql.replace(/create\s+function\s+[\s\S]*?language\s+c[\s\S]*?\$\$\s*;/gi, '');

  return `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n${sql.trim()}\n`;
}

export function readBaseSchemaSql() {
  return sanitizeBaseSchemaSql(readMigrationSql(BASE_SCHEMA_FILE));
}

export function getForwardMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => /^\d+_.*\.sql$/.test(fileName))
    .sort()
    .filter((fileName) => {
      if (fileName === BASE_SCHEMA_FILE || fileName === RESET_BASE_SCHEMA_FILE) {
        return false;
      }

      const versionPrefix = fileName.match(/^(\d+)_/)?.[1];
      const version = versionPrefix ? Number.parseInt(versionPrefix, 10) : Number.NaN;

      return Number.isFinite(version) && version > BASE_SCHEMA_VERSION;
    });
}

// =============================================================================
// Data Privacy Sanitizer
// =============================================================================
//
// Public leaderboard IDs are pseudonymized independently of any profiling data.
// =============================================================================

/** Always pseudonymize direct identifiers before a row crosses a public boundary. */
export function maskLeaderboardEntry<T extends Record<string, unknown>>(
  row: T,
): T {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  const rawUid =
    typeof row.uid === 'string'
      ? row.uid
      : typeof row.user_id === 'string'
        ? row.user_id
        : '';
  const pseudoId = createHmac('sha256', secret).update(rawUid).digest('hex').slice(0, 16);
  return {
    ...row,
    uid: pseudoId,
    user_id: pseudoId,
    user_display_name: 'Participant',
    user_photo_url: null,
    profile_photo: null,
  };
}

/**
 * Public leaderboard variant of maskLeaderboardEntry: every row is kept and
 * shows the player's display name and photo, but the raw uid is always
 * replaced with the pseudo-id regardless of classification.
 */
export function maskPublicLeaderboardEntry<T extends Record<string, unknown>>(
  row: T,
): T | null {
  const masked = maskLeaderboardEntry(row);
  return {
    ...masked,
    user_display_name: row.user_display_name,
    user_photo_url: row.user_photo_url,
  };
}

// Keep this boundary safe while a forward migration is pending on databases
// that still return legacy profile fields from SELECT *.
const RETIRED_PROFILE_FIELDS = [
  'profile_vector_scores',
  'normalized_vector_scores',
  'archetype_id',
  'insight_classification',
] as const;

export function toPublicLeaderboardEntry<T extends Record<string, unknown>>(
  row: T,
): Record<string, unknown> {
  const retired = new Set<string>(RETIRED_PROFILE_FIELDS);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !retired.has(key)));
}
