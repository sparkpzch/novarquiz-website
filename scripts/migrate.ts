// scripts/migrate.ts
// Applies all SQL migration files in db/migrations/ in filename order.
// Usage: npx tsx scripts/migrate.ts

import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const dir = path.resolve(process.cwd(), 'db/migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    console.log(`Applying: ${file}`);
    try {
      await pool.query(sql);
      console.log(`  ✅ Done`);
    } catch (err: unknown) {
      const e = err as Error;
      console.error(`  ❌ Failed: ${e.message}`);
      process.exit(1);
    }
  }

  await pool.end();
  console.log('\nAll migrations applied.');
}

migrate();
