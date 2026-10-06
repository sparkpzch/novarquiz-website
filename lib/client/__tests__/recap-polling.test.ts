import test from 'node:test';
import assert from 'node:assert/strict';
import { recapPollDelay } from '../recap-polling';

test('refresh keeps polling interrupted generation beyond the initial two-minute window', () => {
  assert.equal(recapPollDelay('generating', 0, true), 5_000);
  assert.equal(recapPollDelay('generating', 119_999, true), 5_000);
  assert.equal(recapPollDelay('generating', 120_000, true), 30_000);
  assert.equal(recapPollDelay('generating', 600_000, true), 30_000);
});

test('transient failures and review decisions stay recoverable while the page is visible', () => {
  for (const state of [undefined, 'unavailable', 'rejected', 'pending', 'approved'] as const) {
    assert.equal(recapPollDelay(state, 0, true), 30_000);
    assert.equal(recapPollDelay(state, 0, false), null);
  }
  assert.equal(recapPollDelay('generating', 0, false), null);
  assert.equal(recapPollDelay('standard', 0, true), null);
  assert.equal(recapPollDelay('consent-required', 0, true), null);
});
