// Opt-in PostgreSQL regression check. Set INSIGHTS_TEST_DATABASE_URL to a
// database with a published quiz. All writes roll back.
import { test } from 'node:test';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.INSIGHTS_TEST_DATABASE_URL;

test('a quiz id resolves to the same public session that listings and join responses link to', { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  process.env.DB_PROVIDER = databaseUrl!.includes('neon.tech') ? 'neon' : 'docker';
  const pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl!.includes('neon.tech') ? { rejectUnauthorized: true } : false });
  const client = await pool.connect();
  globalThis.__novarquizPoolVersion = 'v4-pg-only';
  globalThis.__novarquizPool = {
    query: (sql: string, values?: unknown[]) => client.query(sql, values),
    connect: async () => ({ query: (sql: string, values?: unknown[]) => client.query(sql, values), release() {} }),
    end: async () => {}, on() {},
  };
  await client.query('BEGIN');
  try {
    const db = await import('../queries');
    const quiz = (await client.query('SELECT id, created_by FROM quizzes WHERE is_published = TRUE LIMIT 1')).rows[0];
    assert.ok(quiz, 'Need a published quiz for the transaction test');
    await client.query('DELETE FROM sessions WHERE session_id = $1', [quiz.id]);
    const insert = (isPrivate: boolean, status: string, startedAt: string) => client.query(
      'INSERT INTO sessions (session_id, user_id, is_private, status, started_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [quiz.id, quiz.created_by, isPrivate, status, startedAt]).then((result) => result.rows[0]);
    const archived = await insert(false, 'archived', '2030-01-02');
    const live = await insert(false, 'started', '2030-01-01');
    const lobby = await insert(true, 'started', '2030-01-03');

    // An open public session wins over a newer archived one; private never maps.
    assert.equal(await db.resolvePublicSessionId(quiz.id), live.id);
    assert.equal(await db.resolvePublicSessionId(lobby.id), lobby.id);
    assert.equal(await db.resolvePublicSessionId(`unknown-${randomUUID()}`).then((id) => id.startsWith('unknown-')), true);

    // Only the resolved public session advertises the quiz id as its URL.
    assert.equal(await db.getPlayUrlId(live), quiz.id);
    assert.equal(await db.getPlayUrlId(archived), archived.id);
    assert.equal(await db.getPlayUrlId(lobby), lobby.id);
    const listed = (await db.getAllSessions()).filter((row) => row.session_id === quiz.id);
    assert.deepEqual(listed.filter((row) => row.public_play_id).map((row) => row.id), [live.id]);
    assert.equal(listed.find((row) => row.id === live.id)?.public_play_id, quiz.id);
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
