import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function cleanSlugs() {
  try {
    const { rows } = await pool.query('SELECT id, name FROM quizzes');
    for (const row of rows) {
      const slug = row.name.toLowerCase().trim().replace(/[^\u0E00-\u0E7Fa-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'quiz';
      await pool.query('UPDATE quizzes SET slug = $1 WHERE id = $2', [slug, row.id]);
      console.log(`Updated slug for ${row.name}: ${slug}`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await pool.end();
  }
}

cleanSlugs();
