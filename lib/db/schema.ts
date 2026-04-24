import fs from 'node:fs';
import path from 'node:path';

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
