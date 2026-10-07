import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeUpload, chargeVideoRetry, MIB, UPLOAD_LIMITS, type UploadUsage } from '../upload-policy';
const empty = (): UploadUsage => ({day:'2026-10-07',dailyBytes:0,dailyFiles:0,dailyVideoJobs:0,storageBytes:0});

test('upload budget rejects oversized files, daily byte/file limits and reserved storage overflow', () => {
  assert.equal(chargeUpload(null,'2026-10-07',51*MIB,false),null);
  assert.equal(chargeUpload({...empty(),dailyFiles:50},'2026-10-07',1,false),null);
  assert.equal(chargeUpload({...empty(),dailyBytes:UPLOAD_LIMITS.dailyBytes},'2026-10-07',1,false),null);
  assert.equal(chargeUpload({...empty(),storageBytes:UPLOAD_LIMITS.storageBytes},'2026-10-07',1,false),null);
});
test('video input reserves a bounded output allowance and retries share the daily processing budget', () => {
  const charged = chargeUpload(null,'2026-10-07',20*MIB,true)!;
  assert.equal(charged.storageBytes,170*MIB);
  assert.equal(charged.dailyVideoJobs,0);assert.equal(charged.dailyVideoUploads,1);
  assert.equal(chargeVideoRetry({...charged,dailyVideoJobs:10},'2026-10-07'),null);
  assert.equal(chargeUpload({...charged,dailyVideoJobs:10},'2026-10-07',1,true),null);
});
test('a new day resets daily counters without resetting retained storage reservations', () => {
  const next=chargeUpload({...empty(),dailyFiles:50,dailyVideoJobs:10,storageBytes:400*MIB},'2026-10-08',MIB,false)!;
  assert.equal(next.dailyFiles,1);assert.equal(next.dailyVideoJobs,0);assert.equal(next.storageBytes,401*MIB);
});
