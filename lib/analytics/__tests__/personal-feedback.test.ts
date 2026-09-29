import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composePersonalFeedback } from '../personal-feedback';

const approvedSummary = {
  headline: 'Review the decision',
  body: 'Your answers show where another check could help.',
  suggestion: 'Review the approved explanation before trying again.',
};

test('uses the reviewed summary as written', () => {
  const feedback = composePersonalFeedback({
    summary: approvedSummary,
    latestTopic: { name: 'A quiz', score: 50 },
    locale: 'en',
  });
  assert.equal(feedback?.headline, approvedSummary.headline);
  assert.equal(feedback?.body, approvedSummary.body);
  assert.equal(feedback?.suggestion, approvedSummary.suggestion);
  assert.equal(feedback?.reviewStatus, 'approved');
});

test('uses the localized summary and marks provisional wording', () => {
  const thaiSummary = {
    headline: 'ทบทวนคำตอบของคุณ',
    body: 'ลองอ่านเฉลยของข้อนี้ก่อนทำแบบทดสอบอีกครั้ง',
    suggestion: 'ทบทวนคำอธิบายของแต่ละข้อ',
  };
  const feedback = composePersonalFeedback({
    summary: thaiSummary,
    summaryStatus: 'provisional',
    latestTopic: { name: 'A quiz', score: 50 },
    locale: 'th',
  });
  assert.equal(feedback?.body, thaiSummary.body);
  assert.equal(feedback?.headline, thaiSummary.headline);
  assert.equal(feedback?.reviewStatus, 'provisional');
});

test('uses a score-only fallback when no reviewed summary exists', () => {
  const fallback = composePersonalFeedback({
    summary: null,
    latestTopic: { name: 'A quiz', score: 75 },
    locale: 'en',
  });
  assert.match(fallback?.body ?? '', /75%/);
  assert.equal(fallback?.suggestion, null);
  assert.equal(fallback?.question, null);
  assert.equal(fallback?.reviewStatus, 'metrics');
});

test('returns no feedback before any quiz answer exists', () => {
  assert.equal(composePersonalFeedback({
    summary: null,
    latestTopic: null,
    locale: 'en',
  }), null);
});
