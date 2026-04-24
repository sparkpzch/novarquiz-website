// scripts/migrate-005.ts
// One-time script: drops all tables and re-creates from 005_somchai_refac.sql
// Usage: npx tsx scripts/migrate-005.ts

import { Pool } from 'pg';
import { getDatabaseConnectionOptions } from '@/lib/db/config';
import {
  BASE_SCHEMA_FILE,
  RESET_BASE_SCHEMA_FILE,
  readBaseSchemaSql,
  readMigrationSql,
} from '@/lib/db/schema';

const pool = new Pool(getDatabaseConnectionOptions());

async function run() {
  const steps = [
    { label: 'Drop all existing tables', file: RESET_BASE_SCHEMA_FILE, sql: readMigrationSql(RESET_BASE_SCHEMA_FILE) },
    { label: 'Create new schema (005)', file: BASE_SCHEMA_FILE, sql: readBaseSchemaSql() },
  ];

  for (const step of steps) {
    console.log(`\n▶ ${step.label} (${step.file})`);
    try {
      await pool.query(step.sql);
      console.log(`  ✅ Done`);
    } catch (err: unknown) {
      const e = err as Error;
      console.error(`  ❌ Failed: ${e.message}`);
      await pool.end();
      process.exit(1);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(
    `
      INSERT INTO schema_migrations (file_name)
      VALUES ($1)
      ON CONFLICT (file_name) DO NOTHING
    `,
    [BASE_SCHEMA_FILE]
  );

  await pool.end();
  console.log('\n✅ Migration to 005 complete.');
}

run();
