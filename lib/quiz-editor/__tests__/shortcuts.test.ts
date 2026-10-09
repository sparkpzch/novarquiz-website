import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasShortcut } from '../shortcuts';

const k = (o: Partial<KeyboardEvent>) => ({ key: '', code: '', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...o });

test('Figma-style canvas shortcuts', () => {
  assert.equal(canvasShortcut(k({ key: '!', code: 'Digit1', shiftKey: true })), 'fit');
  assert.equal(canvasShortcut(k({ key: ')', code: 'Digit0', shiftKey: true })), 'reset');
  assert.equal(canvasShortcut(k({ key: '0', code: 'Digit0', metaKey: true })), 'reset');
  assert.equal(canvasShortcut(k({ key: '=', code: 'Equal', metaKey: true })), 'zoomIn');
  assert.equal(canvasShortcut(k({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true })), 'zoomIn');
  assert.equal(canvasShortcut(k({ key: '-', code: 'Minus', ctrlKey: true })), 'zoomOut');
});

test('plain typing and other combos are ignored', () => {
  for (const e of [k({ key: '1', code: 'Digit1' }), k({ key: '=', code: 'Equal' }), k({ key: 's', code: 'KeyS', metaKey: true }),
    k({ key: '!', code: 'Digit1', shiftKey: true, metaKey: true }), k({ key: '=', code: 'Equal', metaKey: true, altKey: true })]) {
    assert.equal(canvasShortcut(e), null, JSON.stringify(e));
  }
});
