import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installPullToRefreshGuard } from '../pull-to-refresh-guard';

class Element {
  scrollTop = 0;
  scrollHeight = 800;
  clientHeight = 400;
  overflowY = 'auto';
}
class DocumentStub extends EventTarget {
  documentElement = new Element();
  scrollingElement = this.documentElement;
  defaultView = { HTMLElement: Element, getComputedStyle: (element: Element) => element };
  touch(type: string, x: number, y: number, path: unknown[] = [], count = 1, cancelable = true) {
    const event = Object.assign(new Event(type, { cancelable }), {
      touches: Array.from({ length: count }, () => ({ clientX: x, clientY: y })),
      composedPath: () => [...path, this.scrollingElement, this],
    });
    this.dispatchEvent(event);
    return event.defaultPrevented;
  }
}
function setup() {
  const doc = new DocumentStub();
  const dispose = installPullToRefreshGuard(doc as unknown as Document);
  doc.touch('touchstart', 50, 100);
  return { doc, dispose };
}

test('blocks pulling down at the page top, including a page too short to scroll', () => {
  const { doc } = setup();
  doc.scrollingElement.scrollHeight = doc.scrollingElement.clientHeight;
  assert.equal(doc.touch('touchmove', 50, 110), true);
  doc.scrollingElement.scrollTop = -5; // Safari rubber-band position
  assert.equal(doc.touch('touchmove', 50, 120), true);
});

test('allows scrolling the page and nested dialog until both reach their top', () => {
  const { doc } = setup();
  doc.scrollingElement.scrollTop = 80;
  assert.equal(doc.touch('touchmove', 50, 110), false);
  doc.scrollingElement.scrollTop = 0;
  const dialog = new Element();
  dialog.scrollTop = 50;
  assert.equal(doc.touch('touchmove', 50, 120, [dialog]), false);
  dialog.scrollTop = 0;
  assert.equal(doc.touch('touchmove', 50, 130, [dialog]), true);
});

test('preserves horizontal gestures, upward scrolling and pinch zoom', () => {
  const { doc } = setup();
  assert.equal(doc.touch('touchmove', 80, 110), false);
  assert.equal(doc.touch('touchmove', 50, 90), false);
  assert.equal(doc.touch('touchmove', 50, 120, [], 2), false);
  assert.equal(doc.touch('touchmove', 50, 130), false); // do not intercept the remainder of a pinch
});

test('touch cancel/end and unmount disarm the gesture; non-cancelable moves are untouched', () => {
  const { doc, dispose } = setup();
  assert.equal(doc.touch('touchmove', 50, 110, [], 1, false), false);
  doc.touch('touchcancel', 50, 110, [], 0);
  assert.equal(doc.touch('touchmove', 50, 120), false);
  doc.touch('touchstart', 50, 100);
  doc.touch('touchend', 50, 100, [], 0);
  assert.equal(doc.touch('touchmove', 50, 120), false);
  dispose();
  doc.touch('touchstart', 50, 100);
  assert.equal(doc.touch('touchmove', 50, 120), false);
});
