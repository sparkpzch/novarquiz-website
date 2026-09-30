import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath } from '../redirect';

test('sign-in preserves internal destinations and query strings', () => {
  assert.equal(safeRedirectPath('/admin?tab=quizzes-manager'), '/admin?tab=quizzes-manager');
  assert.equal(safeRedirectPath('/quizzes?q=heart%20failure'), '/quizzes?q=heart%20failure');
});

test('sign-in rejects external destinations and URL parser bypasses', () => {
  for (const path of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\n/evil.example', '/\t/evil.example', 'javascript:alert(1)']) {
    assert.equal(safeRedirectPath(path), '/', String(path));
  }
});
