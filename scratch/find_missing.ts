import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function findMissingPaths() {
  try {
    const questions = await pool.query(`
      SELECT id, media_url, media_path 
      FROM questions 
      WHERE media_url IS NOT NULL AND media_path IS NULL
    `);
    console.log('Questions missing media_path:', questions.rows.length);
    if (questions.rows.length > 0) {
      console.log('Example URL:', questions.rows[0].media_url);
    }

    const quizzes = await pool.query(`
      SELECT id, cover_image_url, cover_image_path 
      FROM quizzes 
      WHERE cover_image_url IS NOT NULL AND cover_image_path IS NULL
    `);
    console.log('Quizzes missing cover_image_path:', quizzes.rows.length);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

findMissingPaths();
