// Run with: npx tsx --test lib/analytics/__tests__/insights.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANY_ARCHETYPE,
  BODY_MAX,
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
  poorChoices: ['Grilled pork buffet and cold beer', 'Skip dinner entirely'],
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
