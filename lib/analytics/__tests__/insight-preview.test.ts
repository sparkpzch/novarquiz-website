import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstInsightSentence } from '../insight-preview';

test('compact summaries show a complete first sentence and preserve unpunctuated Thai', () => {
  assert.equal(firstInsightSentence('Check the serving size. Compare portions next.', 'en'), 'Check the serving size.');
  assert.equal(firstInsightSentence('ลองดูปริมาณต่อหน่วยบริโภคก่อนเปรียบเทียบผลิตภัณฑ์', 'th'), 'ลองดูปริมาณต่อหน่วยบริโภคก่อนเปรียบเทียบผลิตภัณฑ์');
  assert.equal(firstInsightSentence('  ', 'en'), '');
  assert.equal(firstInsightSentence('Try a 1.5 litre example. Read the quiz explanation.', 'en'), 'Try a 1.5 litre example.');
});
