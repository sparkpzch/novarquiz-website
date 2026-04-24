// scripts/migrate.ts
// Bootstraps the database from the 005 base schema, then applies forward
// migrations tracked in schema_migrations.
// Usage: npx tsx scripts/migrate.ts

import { Pool } from 'pg';
import { getDatabaseConnectionOptions } from '@/lib/db/config';
import {
  BASE_SCHEMA_FILE,
  getForwardMigrationFiles,
  readBaseSchemaSql,
  readMigrationSql,
} from '@/lib/db/schema';

const pool = new Pool(getDatabaseConnectionOptions());

async function ensureSchemaMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query<{ file_name: string }>(
    'SELECT file_name FROM schema_migrations ORDER BY file_name ASC'
  );

  return new Set(result.rows.map((row) => row.file_name));
}

async function hasBaseSchema() {
  const result = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'question_sessions'
    ) AS "exists"
  `);

  return result.rows[0]?.exists ?? false;
}

async function markMigrationApplied(fileName: string) {
  await pool.query(
    `
      INSERT INTO schema_migrations (file_name)
      VALUES ($1)
      ON CONFLICT (file_name) DO NOTHING
    `,
    [fileName]
  );
}

async function applyMigration(fileName: string, sql: string) {
  console.log(`Applying: ${fileName}`);

  try {
    await pool.query('BEGIN');
    await pool.query(sql);
    await markMigrationApplied(fileName);
    await pool.query('COMMIT');
    console.log('  ✅ Done');
  } catch (err: unknown) {
    await pool.query('ROLLBACK');
    const e = err as Error;
    console.error(`  ❌ Failed: ${e.message}`);
    process.exit(1);
  }
}

async function migrate() {
  await ensureSchemaMigrationsTable();

  const appliedMigrations = await getAppliedMigrations();

  if (!(await hasBaseSchema())) {
    await applyMigration(BASE_SCHEMA_FILE, readBaseSchemaSql());
    appliedMigrations.add(BASE_SCHEMA_FILE);
  } else if (!appliedMigrations.has(BASE_SCHEMA_FILE)) {
    await markMigrationApplied(BASE_SCHEMA_FILE);
    appliedMigrations.add(BASE_SCHEMA_FILE);
  }

  for (const fileName of getForwardMigrationFiles()) {
    if (appliedMigrations.has(fileName)) {
      continue;
    }

    await applyMigration(fileName, readMigrationSql(fileName));
  }

  await pool.end();
  console.log('\nDatabase schema is up to date.');
}

migrate();
