import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installQuizExitGuard, QUIZ_GUARD_KEY } from '../quiz-exit-guard';

class Browser extends EventTarget {
  location = { href: 'https://example.com/play/session/question' };
  decisions: boolean[] = [];
  prompts = 0;
  entries = [
    { url: 'https://example.com/join/code', state: { __NA: true, tree: 'join' } as Record<string, unknown> },
    { url: this.location.href, state: { __NA: true, tree: 'quiz' } as Record<string, unknown> },
  ];
  index = 1;
  history = {
    state: {} as Record<string, unknown>,
    pushState: (state: Record<string, unknown>, _unused: string, url: string) => {
      this.entries.splice(this.index + 1);
      this.entries.push({ url, state }); this.index++; this.location.href = url;
    },
    back: () => this.go(-1),
    forward: () => this.go(1),
  };
  confirm = () => { this.prompts++; return this.decisions.shift() ?? false; };
  constructor() { super(); Object.defineProperty(this.history, 'state', { get: () => this.entries[this.index].state }); }
  go(delta: number) {
    const next = this.index + delta;
    if (next < 0 || next >= this.entries.length) return;
    this.index = next; this.location.href = this.entries[next].url;
    this.dispatchEvent(Object.assign(new Event('popstate'), { state: this.entries[next].state }));
  }
}

test('mouse Back cancellation retains the quiz and prompts only once', () => {
  const browser = new Browser();
  const dispose = installQuizExitGuard(browser as unknown as Window, () => 'Leave?');
  browser.history.back();
  assert.equal(browser.location.href, 'https://example.com/play/session/question');
  assert.equal(browser.prompts, 1);
  assert.equal(browser.history.state.tree, 'quiz');
  assert.equal(browser.history.state[QUIZ_GUARD_KEY], browser.location.href);
  dispose();
});
test('confirming Back leaves with one action and disarms reload protection', () => {
  const browser = new Browser(); browser.decisions.push(true);
  installQuizExitGuard(browser as unknown as Window, () => 'Leave?');
  browser.history.back();
  assert.equal(browser.location.href, 'https://example.com/join/code');
  assert.equal(browser.prompts, 1);
  const unload = new Event('beforeunload', { cancelable: true }); browser.dispatchEvent(unload);
  assert.equal(unload.defaultPrevented, false);
});
test('refresh/remount reuses the history guard without adding more entries', () => {
  const browser = new Browser();
  installQuizExitGuard(browser as unknown as Window, () => 'Leave?')();
  const dispose = installQuizExitGuard(browser as unknown as Window, () => 'Leave?');
  assert.equal(browser.entries.length, 3);
  const unload = new Event('beforeunload', { cancelable: true }); browser.dispatchEvent(unload);
  assert.equal(unload.defaultPrevented, true);
  dispose();
});
test('cancelling a jump across multiple history entries restores the quiz URL and router state', () => {
  const browser = new Browser();
  const dispose = installQuizExitGuard(browser as unknown as Window, () => 'Leave?');
  browser.go(-2);
  assert.equal(browser.location.href, 'https://example.com/play/session/question');
  assert.equal(browser.history.state.tree, 'quiz');
  dispose();
});
