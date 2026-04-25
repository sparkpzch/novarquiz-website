
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

const dockerUrl = 'postgresql://postgres:postgres@localhost:5432/novarquiz_db';
const neonUrl = 'postgresql://neondb_owner:npg_qM80durGvFAi@ep-royal-lab-ao7hz4qh-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?uselibpqcompat=true&sslmode=require&channel_binding=require';

async function sync() {
  const dockerPool = new Pool({ connectionString: dockerUrl });
  const neonPool = new Pool({ connectionString: neonUrl });

  try {
    console.log('Starting sync from Docker to Neon...');

    // 1. Sync Quizzes (Filtered)
    console.log('Syncing quizzes...');
    const quizzesCols = ['id', 'name', 'description', 'cover_image_url', 'timer_seconds', 'is_published', 'created_by', 'created_at', 'updated_at'];
    const quizzes = await dockerPool.query(`SELECT ${quizzesCols.join(', ')} FROM quizzes`);
    for (const q of quizzes.rows) {
      await neonPool.query(`
        INSERT INTO quizzes (${quizzesCols.join(', ')})
        VALUES (${quizzesCols.map((_, i) => `$${i + 1}`).join(', ')})
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, description = EXCLUDED.description, cover_image_url = EXCLUDED.cover_image_url,
          timer_seconds = EXCLUDED.timer_seconds, is_published = EXCLUDED.is_published, 
          updated_at = EXCLUDED.updated_at
      `, quizzesCols.map(c => q[c]));
    }
    console.log(`Synced ${quizzes.rows.length} quizzes.`);

    // 2. Sync Questions
    console.log('Syncing questions...');
    const questionsCols = ['id', 'session_id', 'question_order', 'question_text', 'media_type', 'media_url', 'timer_override', 'is_entry_point', 'node_x', 'node_y', 'created_at', 'updated_at', 'node_type'];
    const questions = await dockerPool.query(`SELECT ${questionsCols.join(', ')} FROM questions`);
    for (const q of questions.rows) {
      await neonPool.query(`
        INSERT INTO questions (${questionsCols.join(', ')})
        VALUES (${questionsCols.map((_, i) => `$${i + 1}`).join(', ')})
        ON CONFLICT (id) DO UPDATE SET 
          question_order = EXCLUDED.question_order, question_text = EXCLUDED.question_text, 
          media_type = EXCLUDED.media_type, media_url = EXCLUDED.media_url, 
          is_entry_point = EXCLUDED.is_entry_point, node_x = EXCLUDED.node_x, node_y = EXCLUDED.node_y,
          updated_at = EXCLUDED.updated_at, node_type = EXCLUDED.node_type
      `, questionsCols.map(c => q[c]));
    }
    console.log(`Synced ${questions.rows.length} questions.`);

    // 3. Sync Choices
    console.log('Syncing choices...');
    const choicesCols = ['id', 'question_id', 'label', 'choice_text', 'created_at', 'explanation', 'score_impact'];
    const choices = await dockerPool.query(`SELECT ${choicesCols.join(', ')} FROM choices`);
    for (const c of choices.rows) {
      await neonPool.query(`
        INSERT INTO choices (${choicesCols.join(', ')})
        VALUES (${choicesCols.map((_, i) => `$${i + 1}`).join(', ')})
        ON CONFLICT (id) DO UPDATE SET 
          label = EXCLUDED.label, choice_text = EXCLUDED.choice_text, 
          explanation = EXCLUDED.explanation, score_impact = EXCLUDED.score_impact
      `, choicesCols.map(c_col => c[c_col]));
    }
    console.log(`Synced ${choices.rows.length} choices.`);

    // 4. Sync Question Connections
    console.log('Syncing question_connections...');
    const connectionsCols = ['id', 'session_id', 'from_question_id', 'from_choice_label', 'to_question_id', 'created_at', 'connection_type'];
    const connections = await dockerPool.query(`SELECT ${connectionsCols.join(', ')} FROM question_connections`);
    for (const conn of connections.rows) {
      await neonPool.query(`
        INSERT INTO question_connections (${connectionsCols.join(', ')})
        VALUES (${connectionsCols.map((_, i) => `$${i + 1}`).join(', ')})
        ON CONFLICT (id) DO UPDATE SET 
          from_choice_label = EXCLUDED.from_choice_label, to_question_id = EXCLUDED.to_question_id,
          connection_type = EXCLUDED.connection_type
      `, connectionsCols.map(c => conn[c]));
    }
    console.log(`Synced ${connections.rows.length} connections.`);

    console.log('Sync complete!');
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    await dockerPool.end();
    await neonPool.end();
  }
}

sync();
