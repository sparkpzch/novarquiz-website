import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';

const databaseUrl = process.env.INSIGHTS_TEST_DATABASE_URL;

test('bilingual review is atomic and preserves editing, rejection, deletion and cache reuse', { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl!;
  process.env.DB_PROVIDER = databaseUrl!.includes('neon.tech') ? 'neon' : 'docker';
  const pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl!.includes('neon.tech') ? { rejectUnauthorized: true } : false });
  const client = await pool.connect();
  globalThis.__novarquizPoolVersion = 'v4-pg-only';
  globalThis.__novarquizPool = { query: (sql, values) => client.query(sql, values), connect: async () => ({ query: (sql, values) => client.query(sql, values), release() {} }), end: async () => {}, on() {} };
  await client.query('BEGIN');
  try {
    const db = await import('../provisional-insights');
    const { reviewInsightGroup } = await import('../insight-group-review');
    const { withDbClient } = await import('../query-context');
    const { groupProvisionalInsights } = await import('../../analytics/insight-groups');
    const quiz = (await client.query('SELECT id, name, description FROM quizzes WHERE is_published = TRUE LIMIT 1')).rows[0];
    assert.ok(quiz, 'Need a published quiz; all writes roll back');
    const context = { quizName: quiz.name, quizDescription: quiz.description, answers: [{ question: `Bilingual regression ${randomUUID()}`, selected: 'Front label', selectedExplanation: 'Missing portions', selectedAligned: false, alignedChoices: [{ text: 'Serving size', explanation: 'Compare portions' }] }] };
    const thai = { headline: 'ทบทวนฉลากอาหาร', body: 'อ่านปริมาณต่อหนึ่งหน่วยบนฉลากอาหารเพื่อเปรียบเทียบ', suggestion: 'ลองอ่านคำอธิบายเรื่องฉลากอาหาร' };
    const english = { headline: 'Review the food label', body: 'Read the serving size on the label when comparing portions.', suggestion: 'Review the label explanation.' };
    const th = await db.claimProvisionalInsight(quiz.id, 'public', 'th', randomUUID(), context);
    const en = await db.claimProvisionalInsight(quiz.id, 'public', 'en', randomUUID(), context);
    assert.ok(th); assert.ok(en);
    await db.finishProvisionalInsight(th.id, th.claim_token, thai, 'test');
    await db.finishProvisionalInsight(en.id, en.claim_token, english, 'test');
    const read = async () => (await db.listProvisionalInsights()).filter(row => [th.id, en.id].includes(row.id));
    let rows = await read();
    assert.equal(groupProvisionalInsights(rows).length, 1);
    const changes = () => rows.map(row => ({ id: row.id, expectedRevision: row.revision }));
    const review = (members: Parameters<typeof reviewInsightGroup>[0], status: Parameters<typeof reviewInsightGroup>[1], disposition?: 'keep' | 'delete') => withDbClient(client, () => reviewInsightGroup(members, status, 'bilingual-regression', disposition));
    assert.equal(await review(changes().slice(0, 1), 'approved'), null, 'An incomplete language pair cannot be approved');
    const stale = changes(); stale[1].expectedRevision = randomUUID();
    assert.equal(await review(stale, 'approved'), null);
    assert.ok((await read()).every(row => row.status === 'provisional'), 'A stale EN cannot partially approve TH');
    const wrongLanguage = rows.map(row => ({ id: row.id, expectedRevision: row.revision, summary: english }));
    assert.equal(await review(wrongLanguage, 'approved'), null);
    assert.equal(await review([changes()[0], changes()[0]], 'approved'), null, 'Duplicate IDs cannot masquerade as a bilingual pair');
    let writes = 0;
    const failingClient = { release() {}, query: async <R extends QueryResultRow>(sql: string, values?: unknown[]) => {
      if (sql.includes('UPDATE provisional_insight_summaries') && ++writes === 2) throw new Error('Simulated second-language write failure');
      return client.query<R>(sql, values);
    } };
    await assert.rejects(withDbClient(failingClient, () => reviewInsightGroup(changes(), 'approved', 'bilingual-regression')), /second-language write failure/);
    assert.ok((await read()).every(row => row.status === 'provisional'), 'A failure after the first update rolls back both languages');
    const approved = await review(changes(), 'approved'); assert.ok(approved);
    assert.ok(approved.every(row => row.status === 'approved' && row.reviewed_by === 'bilingual-regression'));
    assert.equal(String(approved[0].reviewed_at), String(approved[1].reviewed_at));
    rows = await read();
    for (const locale of ['th', 'en'] as const) {
      assert.equal((await db.getSimilarReusableInsight(quiz.id, 'public', locale, context))?.status, 'approved', `${locale} must retain approval on language switching`);
      assert.equal(await db.getSimilarReusableInsight(quiz.id, 'hcp', locale, context), null);
    }
    const saved = await review(rows.map(row => ({ id: row.id, expectedRevision: row.revision, summary: row.locale === 'th' ? { ...thai, headline: 'ตรวจปริมาณบนฉลากอาหาร' } : { ...english, headline: 'Check the serving size' } })), 'draft');
    assert.ok(saved); assert.ok(saved.every(row => row.status === 'provisional' && row.reviewed_at === null));
    assert.equal(await review(changes(), 'approved'), null, 'Pre-edit revisions cannot approve newer wording');
    rows = await read();
    const rejected = await review(changes(), 'rejected', 'keep'); assert.ok(rejected);
    assert.ok(rejected.every(row => row.status === 'rejected' && row.headline));
    assert.equal(groupProvisionalInsights(rejected).length, 1);
    rows = await read();
    const reconsidered = await review(changes().map(change => ({ ...change, summary: rows.find(row => row.id === change.id)! })), 'draft');
    assert.ok(reconsidered); assert.ok(reconsidered.every(row => row.status === 'rejected'));
    rows = await read();
    const reapproved = await review(changes(), 'approved'); assert.ok(reapproved);
    rows = await read();
    const foreign = await db.claimProvisionalInsight(quiz.id, 'hcp', 'en', randomUUID(), context); assert.ok(foreign);
    await db.finishProvisionalInsight(foreign.id, foreign.claim_token, english, 'test');
    assert.equal(await review([changes()[0], { id: foreign.id, expectedRevision: foreign.claim_token }], 'approved'), null, 'Cross-audience requests are rejected');
    const deleted = await review(changes(), 'rejected', 'delete'); assert.ok(deleted);
    assert.ok(deleted.every(row => row.headline === null && row.body === null));
    assert.equal((await read()).length, 0);
    for (const row of deleted) assert.ok(await db.claimProvisionalInsight(quiz.id, 'public', row.locale, row.answer_signature, context), 'Deleted drafts can regenerate');
    const legacyContext = { quizName: quiz.name, quizDescription: null, answers: [] };
    const legacyTH = await db.claimProvisionalInsight(quiz.id, 'public', 'th', randomUUID(), legacyContext); assert.ok(legacyTH);
    await db.finishProvisionalInsight(legacyTH.id, legacyTH.claim_token, thai, 'test');
    const legacyEN = await db.claimProvisionalInsight(quiz.id, 'public', 'en', `translation:${legacyTH.id}`, { ...legacyContext, translationOf: legacyTH.id }); assert.ok(legacyEN);
    await db.finishProvisionalInsight(legacyEN.id, legacyEN.claim_token, english, 'test');
    const legacyRows = (await db.listProvisionalInsights()).filter(row => [legacyTH.id, legacyEN.id].includes(row.id));
    assert.equal(groupProvisionalInsights(legacyRows).length, 1);
    const archivedLegacy = await review(legacyRows.map(row => ({ id: row.id, expectedRevision: row.revision })), 'rejected', 'keep'); assert.ok(archivedLegacy);
    assert.equal(groupProvisionalInsights(archivedLegacy).length, 1, 'Retaining older summaries keeps the explicit translation link');
    const approvedLegacy = await review(archivedLegacy.map(row => ({ id: row.id, expectedRevision: row.revision })), 'approved'); assert.ok(approvedLegacy);
    assert.ok(approvedLegacy.every(row => row.status === 'approved'));

  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
