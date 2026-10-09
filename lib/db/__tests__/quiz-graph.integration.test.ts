import { test } from 'node:test';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = process.env.GRAPH_TEST_DATABASE_URL;

test('saving the quiz graph keeps player answers for questions still in the graph', { skip: !url }, async () => {
  process.env.DATABASE_URL = url!;
  process.env.DB_PROVIDER = url!.includes('neon.tech') ? 'neon' : 'docker';
  const db = new Pool({ connectionString: url, ssl: url!.includes('neon.tech') ? { rejectUnauthorized: true } : false });
  const client = await db.connect();
  // replaceQuizGraph opens its own transaction; map it onto a savepoint so the
  // outer transaction can still roll everything back.
  const tx: Record<string, string> = { BEGIN: 'SAVEPOINT graph', COMMIT: 'RELEASE SAVEPOINT graph', ROLLBACK: 'ROLLBACK TO SAVEPOINT graph' };
  const query = (sql: string, values?: unknown[]) => client.query(tx[sql] ?? sql, values);
  globalThis.__novarquizPoolVersion = 'v4-pg-only';
  globalThis.__novarquizPool = { query, connect: async () => ({ query, release() {} }), end: async () => {}, on() {} };
  await client.query('BEGIN');
  try {
    const { replaceQuizGraph } = await import('../queries');
    const uid = `qa-${randomUUID()}`;
    const quizId = (await client.query('INSERT INTO quizzes (name, created_by) VALUES ($1, $2) RETURNING id', ['QA graph', uid])).rows[0].id;
    const choices = [{ label: 'A', choice_text: 'Yes', score_impact: 1 }, { label: 'B', choice_text: 'No', score_impact: 0 }];
    const { idMap } = await replaceQuizGraph(quizId, [
      { id: 'kept', question_text: 'Kept?', question_order: 0, is_entry_point: true, choices },
      { id: 'removed', question_text: 'Removed?', question_order: 1, choices },
    ], [{ from_question_id: 'kept', from_choice_label: 'A', to_question_id: 'removed' }]);
    const run = (await client.query('INSERT INTO sessions (session_id, user_id) VALUES ($1, $2) RETURNING id', [quizId, uid])).rows[0].id;
    for (const questionId of [idMap.kept, idMap.removed]) {
      await client.query('INSERT INTO user_answers (session_id, user_id, question_id, chosen_label, utility_score) VALUES ($1, $2, $3, $4, 1)', [run, uid, questionId, 'A']);
    }

    await replaceQuizGraph(quizId, [
      { id: idMap.kept, question_text: 'Kept, reworded?', question_order: 0, is_entry_point: true, choices },
      { id: 'added', question_text: 'Added?', question_order: 1, choices },
    ], [{ from_question_id: idMap.kept, from_choice_label: 'A', to_question_id: 'added' }]);

    const answers = (await client.query('SELECT question_id FROM user_answers WHERE user_id = $1', [uid])).rows.map((row) => row.question_id);
    assert.deepEqual(answers, [idMap.kept]);
    const kept = (await client.query('SELECT question_text FROM questions WHERE id = $1', [idMap.kept])).rows[0];
    assert.equal(kept.question_text, 'Kept, reworded?');
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM questions WHERE session_id = $1', [quizId])).rows[0].count), 2);
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM choices WHERE question_id = $1', [idMap.kept])).rows[0].count), 2);
  } finally { await client.query('ROLLBACK'); client.release(); await db.end(); }
});
