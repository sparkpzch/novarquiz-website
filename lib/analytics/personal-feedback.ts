import type { InsightLocale, InsightSummary } from './insights';

export type PersonalFeedback = {
  headline: string;
  body: string;
  context: string | null;
  suggestion: string | null;
  question: string | null;
  reviewStatus: 'approved' | 'provisional' | 'standard' | 'metrics';
};

/** Combine the reviewed summary and quiz metrics without rewriting either. */
export function composePersonalFeedback(input: {
  summary: InsightSummary | null;
  summaryStatus?: 'approved' | 'provisional' | 'standard' | null;
  latestTopic: { name: string; score: number } | null;
  locale: InsightLocale;
}): PersonalFeedback | null {
  const { summary, latestTopic, locale } = input;
  const reviewStatus = input.summaryStatus ?? 'approved';

  if (summary) {
    return {
      headline: summary.headline,
      body: summary.body,
      context: null,
      suggestion: summary.suggestion,
      question: null,
      reviewStatus,
    };
  }

  if (!latestTopic) return null;
  return {
    headline: locale === 'th'
      ? `ภาพรวมแบบทดสอบ: ${latestTopic.name}`
      : `Quiz overview: ${latestTopic.name}`,
    body: locale === 'th'
      ? `จากคำตอบทั้งหมดในแบบทดสอบนี้ ${latestTopic.score}% ตรงกับเฉลย ดูคำอธิบายเพิ่มเติมได้ในประวัติ`
      : `Across your answers to this quiz, ${latestTopic.score}% matched the answer key. View explanations in History.`,
    context: null,
    suggestion: null,
    question: null,
    reviewStatus: 'metrics',
  };
}
