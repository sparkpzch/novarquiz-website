// scripts/migrate-005.ts
// One-time script: drops all tables and re-creates from 005_somchai_refac.sql
// Usage: npx tsx scripts/migrate-005.ts

import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function run() {
  const migrationsDir = path.resolve(process.cwd(), 'db/migrations');

  // Clean pg_dump artifacts that don't work on hosted databases like Neon:
  //  1. OWNER TO <role> statements (role doesn't exist on Neon)
  //  2. CREATE FUNCTION ... LANGUAGE c blocks (uuid-ossp C functions — already
  //     installed as an extension; can't be created manually)
  function cleanSql(raw: string): string {
    let sql = raw;

    // Remove multi-line "alter ... owner to ...;" blocks
    sql = sql.replace(/alter\s+(table|function|index|sequence)\s+\S+[\s\S]*?\s+owner\s+to\s+\w+\s*;/gi, '');

    // Remove CREATE FUNCTION blocks that use language c
    // These are uuid-ossp functions bundled by pg_dump — already available via extension
    sql = sql.replace(/create\s+function\s+[\s\S]*?language\s+c[\s\S]*?\$\$\s*;/gi, '');

    // Prepend the extension so uuid_generate_v4() is available
    sql = `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n` + sql;

    return sql;
  }

  const steps = [
    { label: 'Drop all existing tables', file: '006_reset_for_005.sql' },
    { label: 'Create new schema (005)', file: '005_somchai_refac.sql' },
  ];

  for (const step of steps) {
    const filePath = path.join(migrationsDir, step.file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const sql = cleanSql(raw);
    console.log(`\n▶ ${step.label} (${step.file})`);
    try {
      await pool.query(sql);
      console.log(`  ✅ Done`);
    } catch (err: unknown) {
      const e = err as Error;
      console.error(`  ❌ Failed: ${e.message}`);
      await pool.end();
      process.exit(1);
    }
  }

  await pool.end();
  console.log('\n✅ Migration to 005 complete.');
}

run();
