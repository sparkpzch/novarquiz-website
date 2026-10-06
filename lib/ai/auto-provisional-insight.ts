import { answerPatternSignature, approvedAnswerCoverage, buildProvisionalInsightPrompt, hasSpecificInsightHeadline, parseProvisionalInsight } from '../analytics/provisional-insights';
import type { InsightLocale, InsightSummary } from '../analytics/insights';
import { isEverydayInsight } from '../analytics/history-coaching';
import { validateInsightLanguage } from '../analytics/insights';
import type { AnswerReviewContext } from '../db/provisional-insights';
import type { PersonalInsightState } from '../analytics/history';
import { generatePersonalInsight, geminiLiteModel, isGeminiConfigured } from './gemini';

export type AutoProvisionalInsight = {
  summary: InsightSummary;
  status: 'provisional' | 'approved' | 'standard';
  context?: AnswerReviewContext | null;
};

/** Sends recorded selections and authored explanations, but never a UID or
 * clinical profile. Matching answers share one draft and generation lease. */
type ProvisionalInput = {
  userId: string;
  quizId: string;
  audience: 'public' | 'hcp';
  locale: InsightLocale;
  /** Session-scoped answers supplied by an authenticated caller. */
  context?: AnswerReviewContext;
  readingStyle?: 'everyday';
  allowGeneration?: boolean;
  /** Admin reports inspect saved wording without spending quota or changing it. */
  readOnly?: boolean;
  tags?: string[];
};

export type PreparedInsight = {
  state: PersonalInsightState;
  insight?: AutoProvisionalInsight;
  generate?: () => Promise<AutoProvisionalInsight | null>;
};

async function defaultDependencies() {
  const { getApprovedInsightSummary } = await import('../db/queries');
  const {
    claimProvisionalInsight, failProvisionalInsight, finishProvisionalInsight,
    getProvisionalInsight, getInsightGenerationState, getSimilarReusableInsight,
    isAnswerPatternRejected, getUserAnswerReviewContext, invalidateProvisionalLanguage,
  } = await import('../db/provisional-insights');
  return {
    getApprovedInsightSummary,
    claimProvisionalInsight, failProvisionalInsight, finishProvisionalInsight,
    getProvisionalInsight, getInsightGenerationState, getSimilarReusableInsight,
    isAnswerPatternRejected, getUserAnswerReviewContext, invalidateProvisionalLanguage,
    generateText: generatePersonalInsight, geminiModel: geminiLiteModel, isGeminiConfigured,
  };
}
export type InsightDependencies = Omit<Awaited<ReturnType<typeof defaultDependencies>>, 'getApprovedInsightSummary'> & {
  getApprovedInsightSummary?: Awaited<ReturnType<typeof defaultDependencies>>['getApprovedInsightSummary'];
};

export async function prepareProvisionalInsight(input: ProvisionalInput, dependencies?: InsightDependencies): Promise<PreparedInsight> {
  const {
    claimProvisionalInsight, failProvisionalInsight, finishProvisionalInsight,
    getProvisionalInsight, getInsightGenerationState, getSimilarReusableInsight,
    isAnswerPatternRejected, getUserAnswerReviewContext, invalidateProvisionalLanguage,
    generateText, geminiModel, isGeminiConfigured,
    getApprovedInsightSummary,
  } = dependencies ?? await defaultDependencies();
  const context = input.context ?? await getUserAnswerReviewContext(input.userId, input.quizId);
  if (!context || context.answers.length === 0) return { state: 'unavailable' };
  // The template CMS and answer-pattern review queue are separate stores.
  // Approved CMS wording must win before any lease or model invocation.
  const approved = await getApprovedInsightSummary?.({ quizId: input.quizId, tags: input.tags ?? [], audience: input.audience, locale: input.locale });
  if (approved) return { state: 'approved', insight: { status: 'approved', summary: approved, context } };
  // Correct answers need no paid analysis, generation lease, or review queue.
  if (context.answers.every(answer => answer.selectedAligned)) {
    return {
      state: 'standard',
      insight: {
        status: 'standard', context,
        summary: input.locale === 'th'
          ? { headline: 'ตอบถูกครบทุกข้อ', body: 'คุณตอบถูกทุกข้อ แสดงว่าเข้าใจเนื้อหาในแบบทดสอบนี้ได้ดี', suggestion: null }
          : { headline: 'All answers correct', body: 'You answered every question correctly, showing a good understanding of this quiz.', suggestion: null },
      },
    };
  }
  const usable = (summary: InsightSummary, status: string) => status === 'approved' ||
    (validateInsightLanguage(summary, input.locale) && (input.readingStyle !== 'everyday' || (isEverydayInsight(summary) && hasSpecificInsightHeadline(summary))));

  const patternSignature = answerPatternSignature({
    ...context,
    quizId: input.quizId,
    audience: input.audience,
    locale: input.locale,
    ...(input.readingStyle ? { readingStyle: input.readingStyle } : {}),
  });

  const answerSignature = patternSignature;
  // Review verifies wording; it does not gate reuse. Prefer reviewed wording,
  // then a compatible pending draft, including drafts stored under older keys.
  const reusable = await getSimilarReusableInsight(input.quizId, input.audience, input.locale, context);
  if (reusable?.status === 'approved') {
    return { state: 'approved', insight: { status: 'approved', summary: { headline: reusable.headline, body: reusable.body, suggestion: reusable.suggestion }, context: reusable.answer_context } };
  }
  if (await isAnswerPatternRejected(input.quizId, input.audience, input.locale, patternSignature, context)) return { state: 'rejected' };
  if (reusable) {
    const summary = { headline: reusable.headline, body: reusable.body, suggestion: reusable.suggestion };
    if (usable(summary, reusable.status)) {
      return { state: 'pending', insight: { summary, status: 'provisional', context: reusable.answer_context } };
    }
    if (!input.readOnly && reusable.status === 'provisional') await invalidateProvisionalLanguage(reusable.id);
  }

  const existing = await getProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature);
  if (existing) {
    const summary = { headline: existing.headline, body: existing.body, suggestion: existing.suggestion };
    if (usable(summary, existing.status) && (!existing.answer_context || approvedAnswerCoverage(existing.answer_context, context, summary) > 0)) {
      return { state: existing.status === 'approved' ? 'approved' : 'pending', insight: { summary, status: existing.status as 'provisional' | 'approved', context: existing.answer_context } };
    }
    if (existing.status === 'approved' || input.readOnly) return { state: 'unavailable' };
    await invalidateProvisionalLanguage(existing.id);
  }
  if (input.readOnly) {
    const status = await getInsightGenerationState(input.quizId, input.audience, input.locale, answerSignature);
    return { state: status === 'generating' ? 'generating' : status === 'rejected' ? 'rejected' : 'unavailable' };
  }
  if (input.allowGeneration === false) return { state: 'consent-required' };
  if (!isGeminiConfigured()) return { state: 'unavailable' };

  const claim = await claimProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature, context);
  if (!claim) {
    // Another request may have finished or been reviewed while we claimed.
    const status = await getInsightGenerationState(input.quizId, input.audience, input.locale, answerSignature);
    if (status === 'provisional' || status === 'approved') {
      const latest = await getProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature);
      if (latest) {
        const summary = { headline: latest.headline, body: latest.body, suggestion: latest.suggestion };
        if (usable(summary, latest.status) && (!latest.answer_context || approvedAnswerCoverage(latest.answer_context, context, summary) > 0)) {
          return { state: latest.status === 'approved' ? 'approved' : 'pending', insight: { summary, status: latest.status as 'provisional' | 'approved' } };
        }
      }
    }
    return { state: status === 'generating' ? 'generating' : status === 'rejected' ? 'rejected' : 'unavailable' };
  }

  return { state: 'generating', generate: async () => {
    try {
      const prompt = buildProvisionalInsightPrompt({
        ...context,
        audience: input.audience,
        locale: input.locale,
        readingStyle: input.readingStyle,
      });
      let drafted = parseProvisionalInsight(await generateText(prompt), input.locale, input.readingStyle);
      if (!drafted.ok) {
        drafted = parseProvisionalInsight(await generateText(`${prompt}\n\nThe previous draft failed validation: ${drafted.reason}. Fix that issue. Return the JSON again. Every value MUST be in ${input.locale === 'th' ? 'Thai' : 'English'}.${input.readingStyle === 'everyday' ? ' Use only everyday words, without professional terms or game results.' : ''}`), input.locale, input.readingStyle);
      }
      if (!drafted.ok) {
        console.warn(`Provisional insight rejected: ${drafted.reason}`);
        await failProvisionalInsight(claim.id, claim.claim_token);
        return null;
      }

      const saved = await finishProvisionalInsight(claim.id, claim.claim_token, drafted.value, geminiModel());
      if (!saved) return null;
      return { summary: drafted.value, status: 'provisional' };
    } catch (error) {
      console.error('Provisional insight generation failed:', error instanceof Error ? error.message : 'unknown error');
      await failProvisionalInsight(claim.id, claim.claim_token).catch(() => {});
      return null;
    }
  } };
}

/** Synchronous compatibility for callers that need to await the model. */
export async function getOrGenerateProvisionalInsight(input: ProvisionalInput): Promise<AutoProvisionalInsight | null> {
  const prepared = await prepareProvisionalInsight(input);
  return prepared.insight ?? (prepared.generate ? await prepared.generate() : null);
}
