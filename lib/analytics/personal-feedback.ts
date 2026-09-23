import { matchesInsightLanguage, type ChoiceInsight, type InsightLocale, type InsightSummary } from './insights';

export type PersonalFeedback = {
  headline: string;
  body: string;
  context: string | null;
  suggestion: string | null;
  question: string | null;
  reviewStatus: 'approved' | 'provisional' | 'metrics';
};

/** Combine reviewed answer feedback and a summary without rewriting either. */
export function composePersonalFeedback(input: {
  choiceInsight: ChoiceInsight | null;
  summary: InsightSummary | null;
  summaryStatus?: 'approved' | 'provisional' | null;
  latestTopic: { name: string; score: number } | null;
  locale: InsightLocale;
}): PersonalFeedback | null {
  const { choiceInsight, summary, latestTopic, locale } = input;
  const reviewStatus = input.summaryStatus === 'provisional' ? 'provisional' : 'approved';

  if (choiceInsight && matchesInsightLanguage(choiceInsight.reason, locale)) {
    const headline = locale === 'th'
      ? choiceInsight.signal === 'incorrect'
        ? `คำตอบ “${choiceInsight.choice}” ยังไม่สอดคล้องกับเป้าหมายของข้อนี้`
        : `คำตอบ “${choiceInsight.choice}” ยังไม่ตรงประเด็นที่สุด`
      : choiceInsight.signal === 'incorrect'
        ? `“${choiceInsight.choice}” did not align with this question’s goal`
        : `“${choiceInsight.choice}” was not the most relevant answer`;

    return {
      headline,
      body: choiceInsight.reason,
      context: summary?.body && summary.body !== choiceInsight.reason ? summary.body : null,
      suggestion: summary?.suggestion ?? null,
      question: choiceInsight.question,
      reviewStatus,
    };
  }

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
      ? `จากคำตอบทั้งหมดในแบบทดสอบนี้ ${latestTopic.score}% ตรงกับเป้าหมายของคำถาม ลองทบทวนคำอธิบายของแต่ละข้อเพื่อเตรียมตัวครั้งถัดไป`
      : `Across your answers to this quiz, ${latestTopic.score}% met the questions’ goals. Review the answer explanations before your next attempt.`,
    context: null,
    suggestion: null,
    question: null,
    reviewStatus: 'metrics',
  };
}
