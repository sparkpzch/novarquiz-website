import assert from 'node:assert/strict';
import test from 'node:test';
import { AnswerBody } from '../answer-request';

const answer = {
  question_id: 'f98d8453-5fc2-4cb0-a9c7-f512e28f45c6',
  chosen_label: 'A',
  question_token: 'signed-question-token',
};

test('resuming after three minutes playing and three minutes away still accepts the answer', () => {
  const parsed = AnswerBody.safeParse({ ...answer, time_taken_ms: 6 * 60_000 });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.time_taken_ms, 6 * 60_000);
  assert.equal(parsed.data.chosen_label, answer.chosen_label);
  assert.equal(parsed.data.question_token, answer.question_token);
});

test('normal and boundary answer durations are preserved', () => {
  for (const time_taken_ms of [0, 1500, 300_000, 300_001, 600_000, 3_600_000]) {
    assert.equal(AnswerBody.parse({ ...answer, time_taken_ms }).time_taken_ms, time_taken_ms);
  }
});

test('malformed answer durations and choices remain invalid', () => {
  for (const time_taken_ms of [-1, 1.5, NaN, Infinity, '1500', 2_147_483_648]) {
    assert.equal(AnswerBody.safeParse({ ...answer, time_taken_ms }).success, false);
  }
  assert.equal(AnswerBody.safeParse({ ...answer, chosen_label: '', time_taken_ms: 600_000 }).success, false);
  assert.equal(AnswerBody.safeParse({ ...answer, question_id: 'invalid', time_taken_ms: 600_000 }).success, false);
});
