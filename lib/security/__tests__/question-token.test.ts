import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionToken, readQuestionToken, verifyQuestionToken } from '../question-token';

const originalSecret = process.env.SESSION_SECRET;
before(() => { process.env.SESSION_SECRET = 'test-secret-for-question-tokens'; });
after(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

test('question proof is bound to the player, session and question', () => {
  const token = createQuestionToken('session-a', 'player-a', 'question-a', 'first');
  assert.ok(readQuestionToken(token, 'session-a', 'player-a', 'question-a', 'first'));
  assert.equal(verifyQuestionToken(token, 'session-a', 'player-b', 'question-a', 'first'), false);
  assert.equal(verifyQuestionToken(token, 'session-b', 'player-a', 'question-a', 'first'), false);
  assert.equal(verifyQuestionToken(token, 'session-a', 'player-a', 'question-b', 'first'), false);
  assert.equal(verifyQuestionToken(token, 'session-a', 'player-a', 'question-a', 'next-attempt'), false);
  assert.equal(verifyQuestionToken(`${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`, 'session-a', 'player-a', 'question-a', 'first'), false);
});

test('question proof expires', () => {
  const realNow = Date.now;
  try {
    Date.now = () => 1_700_000_000_000;
    const token = createQuestionToken('session', 'player', 'question', 'first');
    Date.now = () => 1_700_000_000_000 + 24 * 60 * 60_000 + 1;
    assert.equal(readQuestionToken(token, 'session', 'player', 'question', 'first'), null);
  } finally {
    Date.now = realNow;
  }
});
