import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topicHistogram } from '../topic-histogram';

test('histogram assigns boundaries once, including 100 in the final interval', () => {
  const result = topicHistogram([0, 19.9, 20, 40, 60, 80, 100].map(percentage => ({ percentage })));
  assert.deepEqual(result.bins.map(bin => bin.count), [2, 1, 1, 1, 2]);
  assert.equal(result.answered, 7);
  assert.equal(result.bins.at(-1)?.end, 100);
});
test('missing and invalid scores are excluded rather than treated as zero', () => {
  const result = topicHistogram([null, NaN, -1, 101].map(percentage => ({ percentage })));
  assert.equal(result.missing, 4);
  assert.equal(result.answered, 0);
  assert.deepEqual(result.bins.map(bin => bin.count), [0, 0, 0, 0, 0]);
});
