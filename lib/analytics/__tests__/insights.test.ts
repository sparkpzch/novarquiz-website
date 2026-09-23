// Run with: npx tsx --test lib/analytics/__tests__/insights.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANY_ARCHETYPE,
  BODY_MAX,
  pickInsightTemplate,
  HEADLINE_MAX,
  buildInsightPrompt,
  parseDraftResponse,
  validateInsightDraft,
} from '../insights';

const good = {
  headline: 'คำตอบของคุณสะท้อนว่ายังไม่ค่อยได้ตรวจสุขภาพ',
  body: 'คุณมักเลือกรอดูอาการก่อน ลองนัดตรวจประจำปีไว้ล่วงหน้าจะช่วยให้เจอปัญหาได้เร็วขึ้น',
  suggestion: 'ลองนัดตรวจสุขภาพประจำปีในเดือนนี้',
};

test('accepts a grounded, non-diagnostic draft', () => {
  const result = validateInsightDraft(good);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.headline, good.headline);
});

test('suggestion collapses to null when blank', () => {
  const result = validateInsightDraft({ ...good, suggestion: '   ' });
  assert.equal(result.ok && result.value.suggestion, null);
});

test('rejects drafts that diagnose the reader', () => {
  for (const body of [
    'จากคำตอบคุณเป็นโรคเบาหวานแล้ว',
    'Based on your answers you have hypertension.',
    'ผลนี้ใช้วินิจฉัยได้เลย',
  ]) {
    const result = validateInsightDraft({ ...good, body });
    assert.equal(result.ok, false, `should reject: ${body}`);
  }
});

test('rejects drafts that give medication advice', () => {
  for (const body of ['ควรกินยาลดความดันวันละเม็ด', 'Ask for a 500 mg dose.']) {
    assert.equal(validateInsightDraft({ ...good, body }).ok, false, `should reject: ${body}`);
  }
});

test('rejects empty or oversized fields', () => {
  assert.equal(validateInsightDraft({ ...good, headline: '' }).ok, false);
  assert.equal(validateInsightDraft({ ...good, body: '' }).ok, false);
  assert.equal(validateInsightDraft({ ...good, headline: 'ก'.repeat(HEADLINE_MAX + 1) }).ok, false);
  assert.equal(validateInsightDraft({ ...good, body: 'ก'.repeat(BODY_MAX + 1) }).ok, false);
});

test('rejects non-objects', () => {
  assert.equal(validateInsightDraft(null).ok, false);
  assert.equal(validateInsightDraft('a string').ok, false);
});

test('parseDraftResponse unwraps a fenced JSON block', () => {
  const result = parseDraftResponse('```json\n' + JSON.stringify(good) + '\n```');
  assert.equal(result.ok, true);
});

test('parseDraftResponse reports non-JSON rather than throwing', () => {
  const result = parseDraftResponse('Sure! Here is your summary.');
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'response was not valid JSON');
});

const scenario = {
  question: 'A friend invites you out for a heavy dinner. What do you order?',
  choices: [
    { text: 'Grilled pork buffet and cold beer', outcome: 'off_target' as const, meaning: null },
    { text: 'Rice, boiled fish, and vegetables', outcome: 'aligned' as const, meaning: 'balanced meal' },
    { text: 'Skip dinner entirely', outcome: 'off_target' as const, meaning: null },
  ],
};

test('prompt carries the authored scenarios and forbids inventing facts', () => {
  const prompt = buildInsightPrompt({
    quizName: 'Heart Health',
    quizDescription: 'A day in the life of a 55-year-old with ASCVD risk',
    archetypeId: 'balanced_clinician',
    clinicalTag: 'screening',
    audience: 'public',
    locale: 'th',
    scenarios: [scenario],
  });
  assert.match(prompt, /heavy dinner/);
  assert.match(prompt, /Grilled pork buffet/);
  assert.match(prompt, /Rice, boiled fish/);
  assert.match(prompt, /aligns with the objective/);
  assert.match(prompt, /Skip dinner entirely/);
  assert.match(prompt, /ASCVD risk/);
  assert.match(prompt, /Thai/);
  assert.match(prompt, /not in the list above/);
  assert.match(prompt, /Never name a medicine/);
  assert.match(prompt, /balanced_clinician/);
});

// The story is about a character; the summary is about the reader. Without
// this the model happily writes "ลุงสมชายควร..." on the player's own page.
test('prompt tells the model not to name the story character', () => {
  const prompt = buildInsightPrompt({
    quizName: 'Heart Health',
    quizDescription: null,
    archetypeId: ANY_ARCHETYPE,
    clinicalTag: '',
    audience: 'public',
    locale: 'th',
    scenarios: [scenario],
  });
  assert.match(prompt, /Do not name any character/);
  // A public player has no archetype, so the wildcard must not leak into the text.
  assert.doesNotMatch(prompt, /Behavioural segment/);
  assert.doesNotMatch(prompt, /Topic they most often got wrong/);
});

// ── pickInsightTemplate ─────────────────────────────────────────────────────

const T = (quiz_id: string | null, archetype_id: string, clinical_tag: string) =>
  ({ quiz_id, archetype_id, clinical_tag, id: `${quiz_id}/${archetype_id}/${clinical_tag}` });

test('quiz-scoped beats global', () => {
  const rows = [T(null, ANY_ARCHETYPE, ''), T('q1', ANY_ARCHETYPE, '')];
  const got = pickInsightTemplate(rows, { quizId: 'q1', archetypeId: null, tags: [] });
  assert.equal(got?.quiz_id, 'q1');
});

test('a tag the player missed beats the tag-agnostic row', () => {
  const rows = [T('q1', ANY_ARCHETYPE, ''), T('q1', ANY_ARCHETYPE, 'diet')];
  const got = pickInsightTemplate(rows, { quizId: 'q1', archetypeId: null, tags: ['diet'] });
  assert.equal(got?.clinical_tag, 'diet');
});

test('among tags, the one missed most often wins', () => {
  const rows = [T('q1', ANY_ARCHETYPE, 'diet'), T('q1', ANY_ARCHETYPE, 'emergency')];
  const got = pickInsightTemplate(rows, { quizId: 'q1', archetypeId: null, tags: ['emergency', 'diet'] });
  assert.equal(got?.clinical_tag, 'emergency');
});

test('a real archetype beats the wildcard', () => {
  const rows = [T('q1', ANY_ARCHETYPE, ''), T('q1', 'balanced_clinician', '')];
  const got = pickInsightTemplate(rows, { quizId: 'q1', archetypeId: 'balanced_clinician', tags: [] });
  assert.equal(got?.archetype_id, 'balanced_clinician');
});

test('rows for another quiz or an unmatched tag are never eligible', () => {
  const rows = [T('other', ANY_ARCHETYPE, ''), T('q1', ANY_ARCHETYPE, 'screening')];
  assert.equal(pickInsightTemplate(rows, { quizId: 'q1', archetypeId: null, tags: ['diet'] }), null);
});

test('an archetype-specific row is not served to a player without one', () => {
  const rows = [T('q1', 'balanced_clinician', '')];
  assert.equal(pickInsightTemplate(rows, { quizId: 'q1', archetypeId: null, tags: [] }), null);
});
