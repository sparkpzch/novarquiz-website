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
// Applied to leaderboard/profile rows before they are sent to any client,
// enforcing the three-tier privacy classification model:
//
//   'aggregate'    — data must not appear as individual rows; strip entirely.
//   'pseudonymous' — strip direct identifiers; keep behavioral/score data.
//   'identified'   — explicit individual consent; pass through unchanged.
//
// This runs server-side only (Node runtime). Never call on the client.
// =============================================================================

type InsightClassification = 'aggregate' | 'pseudonymous' | 'identified';

/**
 * Masks or strips a leaderboard entry based on its `insight_classification`.
 *
 * @returns The sanitized row, or `null` if the row must be excluded entirely.
 */
export function maskLeaderboardEntry<T extends Record<string, unknown>>(
  row: T,
): T | null {
  const classification = (row.insight_classification ?? 'aggregate') as InsightClassification;

  if (classification === 'aggregate') {
    // Aggregate-only data must not surface as an individual row.
    return null;
  }

  if (classification === 'pseudonymous') {
    // Replace direct identifiers with a keyed HMAC — one-way and non-reversible
    // without SESSION_SECRET. Unlike bare SHA-256, this prevents pre-computation
    // attacks using known Firebase uid values.
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET not configured');
    // leaderboard_entries rows carry `user_id`, not `uid`; fall back to it so
    // each participant gets a distinct, stable pseudo-id (not a constant '').
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
      user_display_name: 'HCP Participant',
      user_photo_url: null,
      profile_photo: null,
    };
  }

  // 'identified' — user gave explicit individual consent; return as-is.
  return row;
}

/**
 * Public leaderboard variant of maskLeaderboardEntry: every row is kept and
 * shows the player's display name, but photo and raw uid are always masked
 * (pseudo-id) regardless of classification.
 */
export function maskPublicLeaderboardEntry<T extends Record<string, unknown>>(
  row: T,
): T | null {
  const masked = maskLeaderboardEntry({ ...row, insight_classification: 'pseudonymous' });
  return masked && { ...masked, user_display_name: row.user_display_name };
}

// HCP clinical-profiling columns. The public leaderboard routes have no admin
// gate, so these are stripped from every row regardless of classification —
// they may only surface through the admin analytics route.
const HCP_PROFILING_COLUMNS = [
  'profile_vector_scores',
  'normalized_vector_scores',
  'archetype_id',
  'insight_classification',
] as const;

/**
 * Strips HCP profiling columns from a (already masked) leaderboard row before
 * it leaves a public, non-admin boundary. Returns a new object; never mutates.
 */
export function toPublicLeaderboardEntry<T extends Record<string, unknown>>(
  row: T,
): Record<string, unknown> {
  const omit = new Set<string>(HCP_PROFILING_COLUMNS);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !omit.has(key)));
}
