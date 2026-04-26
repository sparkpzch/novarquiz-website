import { Pool } from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const sql = `
    ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
  `;

  try {
    await pool.query(sql);
    console.log('Column slug added to quizzes.');

    // Populate slugs for existing quizzes
    const { rows } = await pool.query('SELECT id, name FROM quizzes WHERE slug IS NULL');
    for (const row of rows) {
      const baseSlug = row.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = baseSlug + '-' + randomUUID().substring(0, 4);
      await pool.query('UPDATE quizzes SET slug = $1 WHERE id = $2', [slug, row.id]);
      console.log(`Updated slug for ${row.id}: ${slug}`);
    }
    
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
