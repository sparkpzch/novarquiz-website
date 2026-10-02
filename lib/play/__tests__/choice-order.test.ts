import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffleChoices } from '../choice-order';

const choices = ['A', 'B', 'C', 'D'].map(label => ({ label, choice_text: `Answer ${label}` }));

test('randomized choices stay stable during an attempt and retain canonical labels for scoring and branching', () => {
  const seed = 'john:session:first:question';
  assert.deepEqual(shuffleChoices(choices, seed), shuffleChoices(choices, seed));
  const shuffled = shuffleChoices(choices, seed);
  assert.deepEqual([...shuffled].sort((a, b) => a.label.localeCompare(b.label)), choices);
  assert.deepEqual(choices.map(choice => choice.label), ['A', 'B', 'C', 'D'], 'Never mutate the authored order');
  for (const choice of shuffled) assert.equal(choice.choice_text, `Answer ${choice.label}`);
});

test('new attempts, sessions, and players get independent permutations', () => {
  const permutations = new Set(Array.from({ length: 100 }, (_, attempt) => shuffleChoices(choices, `john:session:${attempt}:question`).map(c => c.label).join('')));
  assert.equal(permutations.size, 24, 'All four-choice permutations should occur across attempts');
  assert.notDeepEqual(shuffleChoices(choices, 'john:session:first:question'), shuffleChoices(choices, 'john:session:2026-10-02:question'));
  assert.notDeepEqual(shuffleChoices(choices, 'john:session:first:question'), shuffleChoices(choices, 'jane:session:first:question'));
  assert.deepEqual(shuffleChoices([], 'empty'), []);
  assert.deepEqual(shuffleChoices(choices.slice(0, 1), 'single'), choices.slice(0, 1));
});
