import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  try {
    console.log('--- Checking quizzes table ---');
    const data = await pool.query('SELECT * FROM quizzes LIMIT 5');
    console.log('quizzes rows:', data.rows.length);
    console.log('Rows:', data.rows);

    console.log('\n--- Checking questions table ---');
    const questions = await pool.query('SELECT id, question_text, media_path FROM questions WHERE media_path IS NOT NULL');
    console.log('questions with media_path:', questions.rows.length);
    console.log('Rows:', questions.rows);

    console.log('\n--- Checking quizzes table ---');
    const quizzes = await pool.query('SELECT id, name, cover_image_path FROM quizzes WHERE cover_image_path IS NOT NULL');
    console.log('quizzes with cover_image_path:', quizzes.rows.length);
    console.log('Rows:', quizzes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

check();
