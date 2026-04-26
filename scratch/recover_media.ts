import { Pool } from 'pg';
import dotenv from 'dotenv';
import { incrementMediaUsage } from '../lib/db/media';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function parsePathFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)\?/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function recover() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('--- Recovering Question Paths ---');
    const questions = await client.query('SELECT id, media_url FROM questions WHERE media_url IS NOT NULL AND media_path IS NULL');
    for (const q of questions.rows) {
      const path = parsePathFromUrl(q.media_url);
      if (path) {
        console.log(`Recovered path for question ${q.id}: ${path}`);
        await client.query('UPDATE questions SET media_path = $1 WHERE id = $2', [path, q.id]);
        await incrementMediaUsage(client, path);
      }
    }

    console.log('\n--- Recovering Quiz Paths ---');
    const quizzes = await client.query('SELECT id, cover_image_url FROM quizzes WHERE cover_image_url IS NOT NULL AND cover_image_path IS NULL');
    for (const q of quizzes.rows) {
      const path = parsePathFromUrl(q.cover_image_url);
      if (path) {
        console.log(`Recovered path for quiz ${q.id}: ${path}`);
        await client.query('UPDATE quizzes SET cover_image_path = $1 WHERE id = $2', [path, q.id]);
        await incrementMediaUsage(client, path);
      }
    }

    await client.query('COMMIT');
    console.log('\nRecovery complete!');
  } catch (err) {
    console.error('Error during recovery:', err);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

recover();
