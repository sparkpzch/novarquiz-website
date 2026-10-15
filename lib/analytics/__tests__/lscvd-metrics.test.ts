import test from 'node:test';
import assert from 'node:assert/strict';
import { classBreaks, classOf, formatMetric, isSuppressed, metricByKey, METRICS } from '../lscvd-metrics';
import { summarize, type ParticipantRow } from '../lscvd';

const row: ParticipantRow = { province: 'TH-10', analyticsConsent: true, gender: 'female', weightKg: 55, heightCm: 160, health: null, answered: 4, positive: 3 };

test('quantile breaks spread provinces across classes even with one outlier', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 500];
  const quantile = classBreaks(values, 'quantile');
  assert.deepEqual(values.map(v => classOf(v, quantile)), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  const equal = classBreaks(values, 'equal');
  assert.deepEqual(values.slice(0, 9).map(v => classOf(v, equal)), Array(9).fill(0));
  assert.equal(classOf(500, equal), 4);
});

test('breaks handle empty and identical values', () => {
  assert.deepEqual(classBreaks([], 'quantile'), []);
  assert.deepEqual(classBreaks([7, 7, 7], 'equal'), []);
  assert.equal(classOf(7, []), 2);
});

test('higher metric values always mean more attention', () => {
  const s = summarize(Array(10).fill(row));
  assert.equal(metricByKey('lowKnowledge').value(s), 25); // knowledge 75 → 25
  assert.equal(metricByKey('participants').value(s), 10);
  assert.equal(metricByKey('nonsense').key, 'participants');
  assert.equal(new Set(METRICS.map(m => m.key)).size, METRICS.length);
});

test('suppression follows the right consent group per metric', () => {
  const s = summarize(Array(10).fill(row)); // analytics consent, no health answers
  assert.equal(isSuppressed(metricByKey('lowKnowledge'), s), false);
  assert.equal(isSuppressed(metricByKey('smoking'), s), true);
  assert.equal(formatMetric(metricByKey('smoking'), s, true), 'ข้อมูลไม่พอ');
  const few = summarize([row]);
  assert.equal(isSuppressed(metricByKey('participants'), few), false);
  assert.equal(formatMetric(metricByKey('participants'), few, false), '1 person');
  assert.equal(formatMetric(metricByKey('lowKnowledge'), s, false), 'Score 75%');
});

test('a province with nobody in it reads as no data, not as suppressed', () => {
  const empty = summarize([]);
  assert.equal(formatMetric(metricByKey('smoking'), empty, true), 'ไม่มีข้อมูล');
  assert.equal(formatMetric(metricByKey('participants'), empty, true), '0 คน');
});
