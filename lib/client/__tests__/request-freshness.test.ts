import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequestFreshness } from '../request-freshness';

test('paired focus/visibility events produce one request and no follow-up after it finishes', () => {
  let now = 1000;
  const gate = createRequestFreshness(30_000, () => now);
  assert.equal(gate.start(), true);
  assert.equal(gate.start(), false);
  gate.finish(true);
  now += 1;
  assert.equal(gate.start(), false);
});
test('returning within thirty seconds reuses the result; returning after expiry refreshes', () => {
  let now = 1000;
  const gate = createRequestFreshness(30_000, () => now);
  gate.start(); gate.finish(true);
  now += 29_999;
  assert.equal(gate.start(), false);
  now += 1;
  assert.equal(gate.start(), true);
});
test('polling and explicit refresh bypass freshness but never overlap an active request', () => {
  const gate = createRequestFreshness(30_000, () => 1000);
  gate.start(); gate.finish(true);
  assert.equal(gate.start(true), true);
  assert.equal(gate.start(true), false);
});
test('failed requests can retry, and a new consumer/account does not inherit freshness', () => {
  const gate = createRequestFreshness(30_000, () => 1000);
  gate.start(); gate.finish(false);
  assert.equal(gate.start(), true);
  gate.finish(true);
  assert.equal(createRequestFreshness(30_000, () => 1000).start(), true);
});
