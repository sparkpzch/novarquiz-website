import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachVideoSource, disposeVideoSource } from '../playback';

class NativeVideo extends EventTarget {
  src = '';
  loads = 0;
  pauses = 0;
  canPlayType(type: string) { return type === 'application/vnd.apple.mpegurl' ? 'probably' : ''; }
  load() { this.loads++; }
  pause() { this.pauses++; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}

test('Safari/native HLS receives the playlist directly; disposal aborts media and is idempotent', () => {
  const video = new NativeVideo();
  const dispose = attachVideoSource(video as unknown as HTMLVideoElement, 'https://cdn.example/master.m3u8');
  assert.equal(video.src, 'https://cdn.example/master.m3u8');
  assert.equal(video.loads, 1);
  disposeVideoSource(video as unknown as HTMLVideoElement);
  assert.equal(video.src, '');
  assert.equal(video.pauses, 1);
  dispose();
  assert.equal(video.pauses, 1);
});

test('switching source releases old media; stale cleanup cannot clear the replacement', () => {
  const video = new NativeVideo();
  const oldCleanup = attachVideoSource(video as unknown as HTMLVideoElement, 'https://cdn.example/one.mp4');
  attachVideoSource(video as unknown as HTMLVideoElement, 'https://cdn.example/two.mp4');
  oldCleanup();
  assert.equal(video.src, 'https://cdn.example/two.mp4');
  assert.equal(video.pauses, 1);
  disposeVideoSource(video as unknown as HTMLVideoElement);
});
