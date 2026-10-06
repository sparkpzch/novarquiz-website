import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTheme } from '../theme-preference';

test('saved dark choice wins over the initial light render after refresh', () => {
  assert.equal(resolveTheme('dark', 'light'), 'dark');
  assert.equal(resolveTheme('light', 'dark'), 'light');
});
test('server cookie keeps dark when client storage is unavailable', () => {
  assert.equal(resolveTheme(null, 'dark'), 'dark');
});
test('invalid stored or cookie values cannot become a palette', () => {
  assert.equal(resolveTheme('system', 'invalid'), 'light');
  assert.equal(resolveTheme(undefined, 'dark'), 'dark');
});
