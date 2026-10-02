import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnswerGraph } from '../answer-graph';
import type { HistoryAnswer } from '../history';

const answer: HistoryAnswer = { id: 'q1', question: 'Which label?', selected: 'Front label', selectedExplanation: 'Read serving size.', selectedAligned: false, alignedChoices: [{ text: 'Serving size', explanation: 'Compare portions.' }], utilityScore: 0, maxUtility: 1, timeMs: 3000, tags: ['food'] };
const source = { quizName: 'Labels', quizDescription: null, learningFocus: { topic: 'Food labels', question: answer.question }, answers: [answer] };

test('graph traces exact recorded choices and marks answers outside the reused summary source', () => {
  const other = { ...answer, id: 'q2', question: 'Which movement?', selected: 'Walk', selectedAligned: true };
  const nodes = buildAnswerGraph([answer, other], source);
  assert.equal(nodes[0].group, 'focus'); assert.equal(nodes[0].answer.selected, 'Front label');
  assert.equal(nodes[1].group, 'additional'); assert.equal(nodes[1].usedForSummary, false);
  assert.equal(buildAnswerGraph([{ ...answer, selected: 'Serving size' }], source)[0].usedForSummary, false);
  assert.equal(buildAnswerGraph([{ ...answer, selectedExplanation: 'Updated explanation' }], source)[0].usedForSummary, false);
});

test('graph does not invent evidence for missing sources or reuse one source answer twice', () => {
  assert.equal(buildAnswerGraph([answer], null)[0].group, 'additional');
  const repeated = buildAnswerGraph([answer, { ...answer, id: 'q2' }], source);
  assert.deepEqual(repeated.map(node => node.usedForSummary), [true, false]);
  assert.deepEqual(buildAnswerGraph([], source), []);
});
