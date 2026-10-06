import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasFastStart } from '../mp4';
function atom(type: string, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(type, 4);
  return Buffer.concat([header, payload]);
}
test('metadata before media permits faststart; metadata at the end requires remux', () => {
  assert.equal(hasFastStart(Buffer.concat([atom('ftyp'), atom('moov'), atom('mdat')])), true);
  assert.equal(hasFastStart(Buffer.concat([atom('ftyp'), atom('mdat'), atom('moov')])), false);
});
test('moov text inside compressed data is not a movie metadata atom', () => {
  assert.equal(hasFastStart(Buffer.concat([atom('mdat', Buffer.from('moov')), atom('moov')])), false);
});
test('invalid or missing metadata is rejected before upload', () => {
  assert.throws(() => hasFastStart(atom('mdat')), /no movie metadata/);
  const invalid = atom('moov'); invalid.writeUInt32BE(50);
  assert.throws(() => hasFastStart(invalid), /Invalid MP4/);
});
