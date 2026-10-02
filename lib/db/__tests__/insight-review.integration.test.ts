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
    assert.equal(await db.getInsightGenerationState(quiz.id, 'public', 'en', signature), 'provisional');
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
    assert.equal(await db.getInsightGenerationState(quiz.id, 'public', 'en', signature), 'rejected');
    assert.equal(await db.isAnswerPatternRejected(quiz.id, 'public', 'en', 'another-account-key', context), true, 'Deleted rejected patterns must stay blocked for other accounts');

    // A interrupted post-response job is recoverable, while its old owner can
    // never overwrite the newer generation or an admin decision.
    const recoverySignature = randomUUID();
    const firstJob = await db.claimProvisionalInsight(quiz.id, 'public', 'en', recoverySignature, context); assert.ok(firstJob);
    assert.equal(await db.getInsightGenerationState(quiz.id, 'public', 'en', recoverySignature), 'generating');
    assert.equal(await db.claimProvisionalInsight(quiz.id, 'public', 'en', recoverySignature, context), null);
    await client.query("UPDATE provisional_insight_summaries SET updated_at = now() - interval '90 seconds' WHERE id = $1", [firstJob.id]);
    const recovered = await db.claimProvisionalInsight(quiz.id, 'public', 'en', recoverySignature, context); assert.ok(recovered);
    assert.notEqual(recovered.claim_token, firstJob.claim_token);
    assert.equal(await db.finishProvisionalInsight(firstJob.id, firstJob.claim_token, { headline: 'Stale draft', body: 'Must never overwrite the newer job.', suggestion: null }, 'qa-mock'), false);
    assert.equal(await db.finishProvisionalInsight(recovered.id, recovered.claim_token, { headline: 'Read the serving size', body: 'Compare serving sizes on the food labels.', suggestion: null }, 'qa-mock'), true);

    // Even an answer one microsecond after completion belongs to a later
    // attempt and cannot change the completed recap used by Home and Stats.
    const source = (await client.query(`SELECT q.id, q.session_id AS quiz_id, c.label
      FROM questions q JOIN quizzes quiz ON quiz.id = q.session_id AND quiz.is_published = TRUE
      JOIN choices c ON c.question_id = q.id WHERE c.score_impact > 0 AND c.label IN ('A', 'B', 'C', 'D') LIMIT 1`)).rows[0];
    assert.ok(source, 'Need a published question with an answer key');
    const historyUid = `qa-history-${randomUUID()}`;
    const cutoff = '2026-10-02T10:00:00.123456Z';
    const run = (await client.query('INSERT INTO sessions (session_id, user_id) VALUES ($1, $2) RETURNING id', [source.quiz_id, historyUid])).rows[0];
    await client.query(`INSERT INTO user_answers (session_id, user_id, question_id, chosen_label, utility_score, answered_at)
      VALUES ($1, $2, $3, $4, 1, $5::timestamptz), ($1, $2, $3, $4, 0, $5::timestamptz + interval '1 microsecond')`, [run.id, historyUid, source.id, source.label, cutoff]);
    await client.query('INSERT INTO leaderboard_entries (session_id, user_id, completed_at, correct_count) VALUES ($1, $2, $3, 1)', [run.id, historyUid, cutoff]);
    const oldBranch = (await client.query(`SELECT q.id, c.label FROM questions q
      JOIN choices c ON c.question_id = q.id WHERE q.session_id = $1 AND q.id <> $2
      AND c.label IN ('A', 'B', 'C', 'D') LIMIT 1`, [source.quiz_id, source.id])).rows[0];
    if (oldBranch) {
      await client.query(`INSERT INTO user_answers (session_id, user_id, question_id, chosen_label, utility_score, answered_at)
        VALUES ($1, $2, $3, $4, 0, $5::timestamptz - interval '1 day')`, [run.id, historyUid, oldBranch.id, oldBranch.label, cutoff]);
    }
    const history = await templates.getUserHistory(historyUid);
    assert.equal(history[0].completed_at, cutoff);
    const completedAnswers = await templates.getUserHistoryAnswers(historyUid, run.id, history[0].completed_at);
    assert.equal(completedAnswers.length, 1); assert.equal(completedAnswers[0].selectedAligned, true);
    assert.equal((await templates.getUserHistoryAnswers(historyUid, run.id))[0].selectedAligned, false);
    assert.equal((await templates.getUserHistoryAnswers(`other-${historyUid}`, run.id, cutoff)).length, 0);


  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
