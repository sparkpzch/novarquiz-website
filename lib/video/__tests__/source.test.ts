import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getVideoSourceType } from '../source';

test('recognizes signed and Firebase-encoded HLS URLs without interpreting query strings as formats', () => {
  assert.equal(getVideoSourceType('https://cdn.example/MASTER.M3U8?token=abc#x'), 'application/vnd.apple.mpegurl');
  assert.equal(getVideoSourceType('https://firebasestorage.googleapis.com/v0/b/bucket/o/videos%2Fmaster.m3u8?alt=media'), 'application/vnd.apple.mpegurl');
  assert.equal(getVideoSourceType('https://cdn.example/video.mp4?file=playlist.m3u8'), 'video/mp4');
  assert.equal(getVideoSourceType('https://cdn.example/%broken'), undefined);
});
