import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composePersonalFeedback } from '../personal-feedback';

const answer = {
  question: 'Which option helps most?',
  choice: 'Wait and see',
  reason: 'This choice delays the check described in the question.',
  signal: 'incorrect' as const,
};

const approvedSummary = {
  headline: 'Review the decision',
  body: 'Your answers show where another check could help.',
  suggestion: 'Review the approved explanation before trying again.',
};

test('combines a chosen answer with approved summary text without rewriting either', () => {
  const feedback = composePersonalFeedback({
    choiceInsight: answer,
    summary: approvedSummary,
    latestTopic: { name: 'A quiz', score: 50 },
    locale: 'en',
  });

  assert.match(feedback?.headline ?? '', /Wait and see/);
  assert.equal(feedback?.question, answer.question);
  assert.equal(feedback?.body, answer.reason);
  assert.equal(feedback?.context, approvedSummary.body);
  assert.equal(feedback?.suggestion, approvedSummary.suggestion);
  assert.equal(feedback?.reviewStatus, 'approved');
});

test('does not repeat identical answer explanation and summary body', () => {
  const feedback = composePersonalFeedback({
    choiceInsight: answer,
    summary: { ...approvedSummary, body: answer.reason },
    latestTopic: null,
    locale: 'th',
  });

  assert.equal(feedback?.context, null);
  assert.match(feedback?.headline ?? '', /Wait and see/);
});

test('uses approved summary, then a score-only fallback when no answer explanation exists', () => {
  const summaryFeedback = composePersonalFeedback({
    choiceInsight: null,
    summary: approvedSummary,
    latestTopic: { name: 'A quiz', score: 100 },
    locale: 'en',
  });
  assert.equal(summaryFeedback?.headline, approvedSummary.headline);
  assert.equal(summaryFeedback?.body, approvedSummary.body);

  const fallback = composePersonalFeedback({
    choiceInsight: null,
    summary: null,
    latestTopic: { name: 'A quiz', score: 75 },
    locale: 'en',
  });
  assert.match(fallback?.body ?? '', /75%/);
  assert.equal(fallback?.suggestion, null);
  assert.equal(fallback?.question, null);
  assert.equal(fallback?.reviewStatus, 'metrics');
});

test('marks the whole card provisional when its summary context awaits review', () => {
  const feedback = composePersonalFeedback({
    choiceInsight: answer,
    summary: approvedSummary,
    summaryStatus: 'provisional',
    latestTopic: null,
    locale: 'en',
  });
  assert.equal(feedback?.reviewStatus, 'provisional');
  assert.equal(feedback?.body, answer.reason);
});

test('returns no feedback before any quiz answer exists', () => {
  assert.equal(composePersonalFeedback({
    choiceInsight: null,
    summary: null,
    latestTopic: null,
    locale: 'en',
  }), null);
});
