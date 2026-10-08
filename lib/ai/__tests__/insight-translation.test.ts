import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareInsightTranslation } from '../insight-translation';
import type { ProvisionalInsight } from '../../db/provisional-insights';

type Dependencies = NonNullable<Parameters<typeof prepareInsightTranslation>[2]>;
const source: ProvisionalInsight = { id: 'source', quiz_id: 'quiz', quiz_name: 'Food', audience: 'public', locale: 'th', answer_signature: 'personal', answer_context: null,
  status: 'provisional', headline: 'อ่านฉลากอาหาร', body: 'ลองอ่านปริมาณต่อหนึ่งหน่วยบนฉลากอาหาร', suggestion: null, model: 'test', reviewed_by: null, reviewed_at: null, updated_at: '2026-10-08', revision: 'source-revision' };
const english = { headline: 'Read the food label', body: 'Read the serving size on the food label.', suggestion: null };
const thai = { headline: 'อ่านฉลากอาหาร', body: 'อ่านปริมาณต่อหนึ่งหน่วยบนฉลากอาหาร', suggestion: null };
function fixture() {
  const rows: ProvisionalInsight[] = [];
  let calls = 0, claims = 0, failures = 0;
  const dependencies: Dependencies = {
    isConfigured: () => true, model: () => 'test', list: async () => rows,
    claim: async (quiz, audience, locale, signature, context) => {
      claims++; rows.push({ ...source, id: 'translated', quiz_id: quiz, audience, locale, answer_signature: signature, answer_context: context, revision: 'translated-revision', status: 'generating' });
      return { id: 'translated', claim_token: 'token' };
    },
    generateText: async prompt => { calls++; assert.ok(!prompt.includes('reviewer-uid')); return JSON.stringify(prompt.includes('into Thai') ? thai : english); },
    finish: async (id, _token, summary) => { Object.assign(rows.find(row => row.id === id)!, summary, { status: 'provisional' }); return true; },
    fail: async () => { failures++; },
    review: async (id, status) => { const row = rows.find(row => row.id === id)!; row.status = status; return row; },
  };
  return { dependencies, rows, counts: () => ({ calls, claims, failures }) };
}

test('missing TH or EN is translated into its own pending row without approving or rewriting the source', async () => {
  for (const locale of ['th', 'en'] as const) {
    const f = fixture(); const original = { ...source, locale };
    const saved = await prepareInsightTranslation(original, 'reviewer-uid', f.dependencies);
    assert.ok(saved); assert.equal(saved.locale, locale === 'th' ? 'en' : 'th');
    assert.equal(saved.status, 'provisional'); assert.equal(original.status, 'provisional');
    assert.deepEqual(original, { ...source, locale }); assert.equal(saved.answer_context?.translationOf, source.id);
    assert.deepEqual(f.counts(), { calls: 1, claims: 1, failures: 0 });
    await prepareInsightTranslation(original, 'reviewer-uid', f.dependencies);
    assert.equal(f.counts().calls, 1, 'Repeated clicks reuse the existing translation');
  }
});

test('wrong-language output is retried and never saved as an English summary', async () => {
  const f = fixture(); let calls = 0;
  f.dependencies.generateText = async () => JSON.stringify(++calls === 1 ? thai : english);
  const row = await prepareInsightTranslation(source, 'reviewer-uid', f.dependencies);
  assert.equal(calls, 2); assert.equal(row?.headline, english.headline);
});

test('invalid translation or a failed generation lease cannot approve or overwrite content', async () => {
  const f = fixture(); f.dependencies.generateText = async () => 'not JSON';
  assert.equal(await prepareInsightTranslation(source, 'reviewer-uid', f.dependencies), null);
  assert.equal(f.counts().failures, 1); assert.equal(f.rows[0].status, 'generating');
  const competing = fixture(); competing.dependencies.claim = async () => null;
  assert.equal(await prepareInsightTranslation(source, 'reviewer-uid', competing.dependencies), null);
  assert.equal(competing.counts().calls, 0);
});

test('unconfigured AI returns without a claim and a rejected source keeps its translation hidden', async () => {
  const unavailable = fixture(); unavailable.dependencies.isConfigured = () => false;
  assert.equal(await prepareInsightTranslation(source, 'reviewer-uid', unavailable.dependencies), null);
  assert.deepEqual(unavailable.counts(), { calls: 0, claims: 0, failures: 0 });
  const rejected = fixture();
  assert.equal((await prepareInsightTranslation({ ...source, status: 'rejected' }, 'reviewer-uid', rejected.dependencies))?.status, 'rejected');
});
