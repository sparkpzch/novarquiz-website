import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getVideoSourceType, getManagedVideoFallback, getShortNativeVideoSource } from '../source';

test('recognizes signed and Firebase-encoded HLS URLs without interpreting query strings as formats', () => {
  assert.equal(getVideoSourceType('https://cdn.example/MASTER.M3U8?token=abc#x'), 'application/vnd.apple.mpegurl');
  assert.equal(getVideoSourceType('https://firebasestorage.googleapis.com/v0/b/bucket/o/videos%2Fmaster.m3u8?alt=media'), 'application/vnd.apple.mpegurl');
  assert.equal(getVideoSourceType('https://cdn.example/video.mp4?file=playlist.m3u8'), 'video/mp4');
  assert.equal(getVideoSourceType('https://cdn.example/%broken'), undefined);
});


test('generated HLS falls back to its own MP4 sibling only on managed storage', () => {
  const base = 'https://storage.googleapis.com/bucket/question-sessions/processed/ec6348dc-0664-4c5f-bcf7-07b4040e8778/';
  assert.equal(getManagedVideoFallback(base + 'master.m3u8'), base + 'fallback.mp4');
  assert.equal(getManagedVideoFallback(base.replace('storage.googleapis.com', 'evil.example') + 'master.m3u8'), null);
  assert.equal(getManagedVideoFallback('https://storage.googleapis.com/bucket/unmanaged/master.m3u8'), null);
  assert.equal(getManagedVideoFallback('not-a-url'), null);
});

 test('short native clips use progressive MP4 while longer streams retain HLS', () => {
  const base = 'https://storage.googleapis.com/bucket/question-sessions/processed/ec6348dc-0664-4c5f-bcf7-07b4040e8778/';
  assert.equal(getShortNativeVideoSource(base + 'master.m3u8#duration=4.1'), base + 'fallback.mp4#duration=4.1');
  for (const duration of ['0', '10.1', '-1', 'NaN', '']) {
    assert.equal(getShortNativeVideoSource(base + 'master.m3u8#duration=' + duration), null);
  }
  assert.equal(getShortNativeVideoSource(base + 'master.m3u8'), null);
  assert.equal(getShortNativeVideoSource('https://evil.example/master.m3u8#duration=4'), null);
});
