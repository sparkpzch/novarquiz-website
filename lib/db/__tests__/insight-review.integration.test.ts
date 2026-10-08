// Opt-in PostgreSQL regression check. Set INSIGHTS_TEST_DATABASE_URL to a
// database with migrations 010–013 and a published quiz. All writes roll back.
import { test } from 'node:test';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.INSIGHTS_TEST_DATABASE_URL;

test('insight drafts and review lifecycle preserve scope, share pending text, and regenerate deleted patterns', { skip: !databaseUrl }, async () => {
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
    const claims = await Promise.all(Array.from({ length: 8 }, () => db.claimProvisionalInsight(quiz.id, 'public', 'en', signature, context)));
    assert.equal(claims.filter(Boolean).length, 1, 'Concurrent submissions must share one database generation lease');
    const claim = claims.find(Boolean)!; assert.ok(claim);
    assert.equal(await db.finishProvisionalInsight(claim.id, claim.claim_token, { headline: 'Read the serving size', body: 'You checked the serving size on the label.', suggestion: 'Review the package table.' }, 'qa-mock'), true);
    assert.equal(await db.getInsightGenerationState(quiz.id, 'public', 'en', signature), 'provisional');
    const row = (await db.listProvisionalInsights()).find(r => r.id === claim.id)!; assert.ok(row.revision);
    const pending = await db.getSimilarReusableInsight(quiz.id, 'public', 'en', context);
    assert.equal(pending?.id, claim.id); assert.equal(pending?.status, 'provisional', 'Pending wording is reusable before review');
    assert.equal(await db.getSimilarReusableInsight(quiz.id, 'hcp', 'en', context), null);
    assert.equal(await db.getSimilarReusableInsight(quiz.id, 'public', 'en', { ...context, answers: [{ ...context.answers[0], selected: 'Different answer' }] }), null);
    const saved = await db.saveProvisionalDraft(row.id, { headline: 'A helpful label check', body: 'You chose to check the serving size.', suggestion: null }, row.revision); assert.ok(saved); assert.notEqual(saved.revision, row.revision);
    assert.equal(await db.reviewProvisionalInsight(row.id, 'approved', 'qa', { expectedRevision: row.revision }), null, 'Stale approvals must fail');
    const approved = await db.reviewProvisionalInsight(row.id, 'approved', 'qa', { expectedRevision: saved.revision }); assert.ok(approved); assert.equal(approved.status, 'approved');
    const reused = await db.getSimilarReusableInsight(quiz.id, 'public', 'en', context); assert.equal(reused?.id, row.id);
    // The same mistake shares approved wording and one generation lease even
    // when the other questions were answered with different correct options.
    const { answerPatternSignature } = await import('../../analytics/provisional-insights');
    const { prepareProvisionalInsight } = await import('../../ai/auto-provisional-insight');
    const missedContext = { ...context, answers: [
      { ...context.answers[0], question: `QA missed ${tag}`, selected: 'Skip the check', selectedAligned: false },
      { ...context.answers[0], question: `QA correct ${tag}` },
    ] };
    const changedCorrect = { ...missedContext, answers: [missedContext.answers[0], { ...missedContext.answers[1], selected: 'Another correct option' }] };
    const scope = { quizId: quiz.id, audience: 'public' as const, locale: 'en' as const };
    const sharedSignature = answerPatternSignature({ ...scope, ...missedContext });
    assert.equal(sharedSignature, answerPatternSignature({ ...scope, ...changedCorrect }));
    const sharedClaims = await Promise.all([missedContext, changedCorrect].map(c => db.claimProvisionalInsight(quiz.id, 'public', 'en', sharedSignature, c)));
    assert.equal(sharedClaims.filter(Boolean).length, 1);
    const sharedClaim = sharedClaims.find(Boolean)!;
    const reviewedWording = { headline: 'Review the check', body: 'You skipped the check. Review the authored explanation.', suggestion: null };
    await db.finishProvisionalInsight(sharedClaim.id, sharedClaim.claim_token, reviewedWording, 'qa-test');
    const sharedDraft = await db.getProvisionalInsight(quiz.id, 'public', 'en', sharedSignature);
    const sharedApproved = await db.reviewProvisionalInsight(sharedClaim.id, 'approved', 'qa', { expectedRevision: sharedDraft!.revision });
    assert.ok(sharedApproved);
    const noModel = { ...db, generateText: async () => { throw new Error('Same mistake must not call AI'); }, geminiModel: () => 'qa-test', isGeminiConfigured: () => true };
    for (let repeat = 0; repeat < 3; repeat++) {
      const result = await prepareProvisionalInsight({ ...scope, userId: 'qa-same-mistake', context: changedCorrect, allowGeneration: true }, noModel);
      assert.equal(result.state, 'approved'); assert.equal(result.generate, undefined); assert.deepEqual(result.insight?.summary, reviewedWording);
    }
    await db.reviewProvisionalInsight(sharedClaim.id, 'rejected', 'qa', { expectedRevision: sharedApproved.revision, disposition: 'delete' });
    const sharedRegenerated = await db.claimProvisionalInsight(quiz.id, 'public', 'en', sharedSignature, changedCorrect);
    assert.ok(sharedRegenerated, 'Deleting wording must release the generation lease');
    assert.notEqual(sharedRegenerated.claim_token, sharedClaim.claim_token);
    assert.equal(await db.finishProvisionalInsight(sharedClaim.id, sharedClaim.claim_token, reviewedWording, 'stale'), false);

    assert.equal(await db.getSimilarReusableInsight(quiz.id, 'public', 'th', context), null);
    const rejected = await db.reviewProvisionalInsight(row.id, 'rejected', 'qa', { expectedRevision: approved.revision, disposition: 'keep' }); assert.ok(rejected); assert.equal(rejected.headline, saved.headline);
    assert.equal(await db.getProvisionalInsight(quiz.id, 'public', 'en', signature), null);
    const reconsidered = await db.saveProvisionalDraft(row.id, { headline: 'Reconsider this label recap', body: 'Check the label before comparing.', suggestion: null }, rejected.revision);
    assert.ok(reconsidered); assert.equal(reconsidered.status, 'rejected');
    assert.equal(await db.getProvisionalInsight(quiz.id, 'public', 'en', signature), null, 'Editing retained text must not make it visible before approval');
    const deleted = await db.reviewProvisionalInsight(row.id, 'rejected', 'qa', { expectedRevision: reconsidered.revision, disposition: 'delete' }); assert.ok(deleted); assert.equal(deleted.headline, null);
    assert.equal((await db.listProvisionalInsights()).some(r => r.id === row.id), false);
    const replacement = await db.claimProvisionalInsight(quiz.id, 'public', 'en', signature, context);
    assert.ok(replacement, 'Retained rejected copy must not prevent a replacement');
    const deletedReplacement = await db.claimProvisionalInsight(quiz.id, 'public', 'en', deleted.answer_signature, context);
    assert.ok(deletedReplacement, 'Deleted copies can be regenerated immediately');
    assert.equal(await db.getInsightGenerationState(quiz.id, 'public', 'en', signature), 'generating');

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
    let completedAnswers = await templates.getUserHistoryAnswers(historyUid, run.id, history[0].completed_at);
    assert.equal(completedAnswers.length, 1); assert.equal(completedAnswers[0].selectedAligned, true);
    assert.equal((await templates.getUserHistoryAnswers(historyUid, run.id))[0].selectedAligned, false);
    assert.equal((await templates.getUserHistoryAnswers(`other-${historyUid}`, run.id, cutoff)).length, 0);


    // The original consent bug stored a Next client reference instead of a
    // document version. It must request a fresh affirmative consent, then
    // generate and persist a pending recap without opening Stats first.
    const { preparePersonalRecap } = await import('../../ai/personal-recap');
    const { PRIVACY_VERSION, TOS_VERSION } = await import('../../privacy/versions');
    const { withDbClient, withDbSavepoint } = await import('../query-context');
    const brokenVersion = 'function(){throw Error("Attempted to call PRIVACY_VERSION() from the server but PRIVACY_VERSION is on the client.")}';
    const consent = { uid: historyUid, tos_version: TOS_VERSION, privacy_version: brokenVersion, consent_purposes: { platform_account: true, marketing_follow_up: false }, ip_address: 'test', user_agent: 'rollback-only-test' };
    await templates.upsertUserConsent(consent);
    let modelCalls = 0;
    const recap = { headline: `Review this quiz example ${tag}`, body: 'You selected a listed option; revisit its explanation in the quiz example.', suggestion: 'Revisit the explanation for the option you selected.' };
    const dependencies = { ...db, generateText: async (prompt: string) => {
      modelCalls++; assert.ok(prompt.includes(completedAnswers[0].selected)); assert.ok(!prompt.includes(historyUid));
      return JSON.stringify(recap);
    }, geminiModel: () => 'qa-flash-lite', isGeminiConfigured: () => true };
    const session = history[0] as import('../../analytics/history').UserHistoryRow;
    // Consent/generation applies to missed answers; fully correct attempts use standard feedback.
    const missed = (await client.query('SELECT label FROM choices WHERE question_id=$1 AND score_impact<=0 LIMIT 1', [source.id])).rows[0];
    assert.ok(missed);
    await client.query('UPDATE user_answers SET chosen_label=$4,utility_score=0 WHERE session_id=$1 AND user_id=$2 AND answered_at=$3::timestamptz', [run.id,historyUid,cutoff,missed.label]);
    completedAnswers = await templates.getUserHistoryAnswers(historyUid, run.id, cutoff);
    assert.equal(completedAnswers[0].selectedAligned, false);
    const blocked = await preparePersonalRecap(historyUid, session, completedAnswers, 'en', dependencies);
    assert.equal(blocked.state, 'consent-required'); assert.equal(blocked.generate, undefined); assert.equal(modelCalls, 0);
    await templates.upsertUserConsent({ ...consent, privacy_version: PRIVACY_VERSION });
    const prepared = await withDbClient(client, () => withDbSavepoint(() => preparePersonalRecap(historyUid, session, completedAnswers, 'en', dependencies)));
    assert.equal(prepared.state, 'generating'); assert.ok(prepared.generate);
    assert.equal((await prepared.generate())?.status, 'provisional');
    const queued = (await db.listProvisionalInsights()).find(row => row.headline === recap.headline);
    assert.ok(queued); assert.equal(queued.status, 'provisional');
    const pendingRecap = await preparePersonalRecap(historyUid, session, completedAnswers, 'en', dependencies);
    assert.equal(pendingRecap.state, 'pending'); assert.equal(modelCalls, 1);
    const adminRead = await preparePersonalRecap(historyUid, session, completedAnswers, 'en', dependencies, { readOnly: true });
    assert.equal(adminRead.state, 'pending'); assert.equal(adminRead.generate, undefined);
    assert.deepEqual(adminRead.insight?.context?.answers, completedAnswers.map(({ question, selected, selectedExplanation, selectedAligned, alignedChoices }) => ({ question, selected, selectedExplanation, selectedAligned, alignedChoices })));
    assert.equal((await preparePersonalRecap(historyUid, session, completedAnswers, 'th', dependencies, { readOnly: true })).state, 'unavailable');
    assert.equal(modelCalls, 1, 'Admin language changes must not generate new drafts');
    await db.reviewProvisionalInsight(queued.id, 'approved', 'qa', { expectedRevision: queued.revision });
    const reviewedRecap = await preparePersonalRecap(historyUid, session, completedAnswers, 'en', dependencies);
    assert.equal(reviewedRecap.state, 'approved'); assert.equal(modelCalls, 1);
    assert.deepEqual(reviewedRecap.insight?.summary, pendingRecap.insight?.summary);
    const sourceQuiz = await templates.getQuizById(source.quiz_id);
    const audience = sourceQuiz?.intended_audience === 'hcp' ? 'hcp' : 'public';
    const approvedTemplate = await templates.upsertInsightTemplate({ quizId: source.quiz_id, clinicalTag: tag, audience, locale: 'en', headline: 'Reviewed CMS guidance', body: 'Read the author-approved label guidance.', suggestion: null, source: 'manual', model: null, createdBy: 'qa-transaction' });
    await templates.reviewInsightTemplate(approvedTemplate.id, 'approved', 'qa-transaction');
    const approvedDependencies = { ...dependencies, getApprovedInsightSummary: templates.getApprovedInsightSummary };
    for (let refresh=0; refresh<3; refresh++) {
      const cms = await preparePersonalRecap(historyUid, session, completedAnswers.map(answer=>({...answer,tags:[tag]})), 'en', approvedDependencies);
      assert.equal(cms.state, 'approved'); assert.equal(cms.insight?.summary.headline, 'Reviewed CMS guidance'); assert.equal(cms.generate, undefined);
    }
    assert.equal(modelCalls, 1, 'Approved CMS must avoid any additional model calls');
    await withDbClient(client, async () => {
      await assert.rejects(withDbSavepoint(async () => { await client.query('SELECT nonexistent_recap_column'); }));
      assert.equal((await templates.getUserHistory(historyUid)).length, 1, 'A failed recap must not abort the completed result transaction');
    });


  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
