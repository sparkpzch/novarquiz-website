// Opt-in PostgreSQL regression check. Set INSIGHTS_TEST_DATABASE_URL to a
// database with migrations 010–013 and a published quiz. All writes roll back.
import { test } from 'node:test';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.INSIGHTS_TEST_DATABASE_URL;

test('insight drafts and review lifecycle preserve scope, gate reuse, and block deleted patterns', { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  process.env.DB_PROVIDER = databaseUrl!.includes('neon.tech') ? 'neon' : 'docker';
  const pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl!.includes('neon.tech') ? { rejectUnauthorized: true } : false });
  const client = await pool.connect();
  // Route all application queries through a single rolled-back transaction.
  globalThis.__novarquizPoolVersion = 'v4-pg-only';
  globalThis.__novarquizPool = {
    query: (sql: string, values?: unknown[]) => client.query(sql, values),
    connect: async () => ({ query: (sql: string, values?: unknown[]) => client.query(sql, values), release() {} }),
    end: async () => {}, on() {},
  };
  await client.query('BEGIN');
  try {
    const db = await import('../provisional-insights');
    const templates = await import('../queries');
    const quiz = (await client.query('SELECT id, name, description FROM quizzes WHERE is_published = TRUE LIMIT 1')).rows[0];
    assert.ok(quiz, 'Need a published quiz for the transaction test');
    const tag = `qa-${randomUUID()}`;
    const draft = await templates.upsertInsightTemplate({ quizId: quiz.id, clinicalTag: tag, audience: 'hcp', locale: 'en', headline: 'Read the label', body: 'Check the serving size before comparing products.', suggestion: null, source: 'manual', model: null, createdBy: 'qa-transaction' });
    assert.equal(draft.review_status, 'draft');
    await templates.reviewInsightTemplate(draft.id, 'approved', 'qa-transaction');
    const edited = await templates.upsertInsightTemplate({ id: draft.id, quizId: null, clinicalTag: '', audience: 'public', locale: 'th', headline: 'A revised label summary', body: 'Look at the serving size on the package.', suggestion: null, source: 'manual', model: null, createdBy: 'qa-transaction' });
    assert.equal(edited.id, draft.id); assert.equal(edited.quiz_id, quiz.id); assert.equal(edited.audience, 'hcp'); assert.equal(edited.locale, 'en'); assert.equal(edited.review_status, 'draft'); assert.equal(edited.reviewed_by, null);
    const context = { quizName: quiz.name, quizDescription: quiz.description, answers: [{ question: 'QA serving size?', selected: 'The serving size', selectedExplanation: 'Read the package table.', selectedAligned: true, alignedChoices: [{ text: 'The serving size', explanation: 'Read the package table.' }] }] };
    const signature = randomUUID();
    const claim = await db.claimProvisionalInsight(quiz.id, 'public', 'en', signature, context); assert.ok(claim);
    assert.equal(await db.finishProvisionalInsight(claim.id, claim.claim_token, { headline: 'Read the serving size', body: 'You checked the serving size on the label.', suggestion: 'Review the package table.' }, 'qa-mock'), true);
    const row = (await db.listProvisionalInsights()).find(r => r.id === claim.id)!; assert.ok(row.revision);
    const saved = await db.saveProvisionalDraft(row.id, { headline: 'A helpful label check', body: 'You chose to check the serving size.', suggestion: null }, row.revision); assert.ok(saved); assert.notEqual(saved.revision, row.revision);
    assert.equal(await db.reviewProvisionalInsight(row.id, 'approved', 'qa', { expectedRevision: row.revision }), null, 'Stale approvals must fail');
    const approved = await db.reviewProvisionalInsight(row.id, 'approved', 'qa', { expectedRevision: saved.revision }); assert.ok(approved); assert.equal(approved.status, 'approved');
    const reused = await db.getSimilarApprovedInsight(quiz.id, 'public', 'en', context); assert.equal(reused?.id, row.id);
    assert.equal(await db.getSimilarApprovedInsight(quiz.id, 'public', 'th', context), null);
    const rejected = await db.reviewProvisionalInsight(row.id, 'rejected', 'qa', { expectedRevision: approved.revision, disposition: 'keep' }); assert.ok(rejected); assert.equal(rejected.headline, saved.headline);
    assert.equal(await db.getProvisionalInsight(quiz.id, 'public', 'en', signature), null);
    const reconsidered = await db.saveProvisionalDraft(row.id, { headline: 'Reconsider this label recap', body: 'Check the label before comparing.', suggestion: null }, rejected.revision);
    assert.ok(reconsidered); assert.equal(reconsidered.status, 'rejected');
    assert.equal(await db.getProvisionalInsight(quiz.id, 'public', 'en', signature), null, 'Editing retained text must not make it visible before approval');
    const deleted = await db.reviewProvisionalInsight(row.id, 'rejected', 'qa', { expectedRevision: reconsidered.revision, disposition: 'delete' }); assert.ok(deleted); assert.equal(deleted.headline, null);
    assert.equal((await db.listProvisionalInsights()).some(r => r.id === row.id), false);
    assert.equal(await db.isAnswerPatternRejected(quiz.id, 'public', 'en', signature), true);
    assert.equal(await db.claimProvisionalInsight(quiz.id, 'public', 'en', signature, context), null);
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
