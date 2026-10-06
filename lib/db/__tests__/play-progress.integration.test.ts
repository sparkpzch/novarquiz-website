import { test } from 'node:test';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = process.env.PLAY_TEST_DATABASE_URL;
test('refresh preserves question/timer/feedback, retries score once, stale transitions cannot rewind, replay starts clean', { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const db = new Pool({ connectionString: url });
  const client = await db.connect();
  globalThis.__novarquizPoolVersion = 'v4-pg-only';
  globalThis.__novarquizPool = { query: (sql: string, values?: unknown[]) => client.query(sql, values), connect: async () => ({ query: (sql: string, values?: unknown[]) => client.query(sql, values), release() {} }), end: async () => {}, on() {} };
  await client.query('BEGIN');
  try {
    const progress = await import('../play-progress');
    const session = randomUUID(), uid = `qa-${randomUUID()}`, first = randomUUID(), second = randomUUID(), third = randomUUID();
    const initial = await progress.startProgress(session, uid, 'attempt-one', first);
    assert.ok(initial);
    await progress.resetProgress(session, uid);
    const refreshed = await progress.startProgress(session, uid, 'attempt-one', first);
    assert.equal(refreshed?.question_started_at, initial.question_started_at);
    assert.equal(refreshed?.started_at, initial.started_at);
    const answer = { chosen_label: 'B', points_earned: 1, explanation: 'Read the label.' };
    await progress.answerProgress(session, uid, 'attempt-one', first, answer);
    await progress.answerProgress(session, uid, 'attempt-one', first, { ...answer, chosen_label: 'C', points_earned: 10 });
    const feedback = await progress.getProgress(session, uid, 'attempt-one');
    assert.deepEqual(feedback?.answer, answer); assert.equal(feedback?.score, 1); assert.equal(feedback?.streak, 1);
    // Joining an active room again must preserve the checkpoint; only a
    // completed checkpoint is cleared when explicitly joining another run.
    await progress.resetProgress(session, uid);
    assert.deepEqual(await progress.getProgress(session, uid, 'attempt-one'), feedback);
    const next = await progress.advanceProgress(session, uid, 'attempt-one', first, second);
    assert.equal(next?.question_id, second); assert.equal(next?.answer, null); assert.equal(next?.score, 1);
    const stale = await progress.advanceProgress(session, uid, 'attempt-one', first, third);
    assert.equal(stale?.question_id, second);
    await progress.answerProgress(session, uid, 'attempt-one', second, { ...answer, points_earned: 0 });
    assert.equal((await progress.getProgress(session, uid))?.streak, 0);
    await progress.completeProgress(session, uid);
    const ended = await progress.advanceProgress(session, uid, 'attempt-one', second, third);
    assert.equal(ended?.question_id, second); assert.equal(ended?.completed, true);
    await progress.resetProgress(session, uid);
    assert.equal(await progress.getProgress(session, uid), null);
    const replay = await progress.startProgress(session, uid, 'attempt-two', first);
    assert.equal(replay?.score, 0); assert.equal(replay?.answer, null); assert.equal(replay?.completed, false);
    assert.equal(await progress.getProgress(session, uid, 'attempt-one'), null);
  } finally { await client.query('ROLLBACK'); client.release(); await db.end(); }
});
