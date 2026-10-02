import { answerPatternSignature, buildProvisionalInsightPrompt, hasSpecificInsightHeadline, personalDraftSignature, parseProvisionalInsight } from '../analytics/provisional-insights';
import type { InsightLocale, InsightSummary } from '../analytics/insights';
import { isEverydayInsight } from '../analytics/history-coaching';
import { validateInsightLanguage } from '../analytics/insights';
import type { AnswerReviewContext } from '../db/provisional-insights';
import type { PersonalInsightState } from '../analytics/history';
import { generatePersonalInsight, geminiLiteModel, isGeminiConfigured } from './gemini';

export type AutoProvisionalInsight = {
  summary: InsightSummary;
  status: 'provisional' | 'approved';
};

/** Sends recorded selections and authored explanations, but never a UID or
 * clinical profile. Each account caches its own unreviewed draft. */
type ProvisionalInput = {
  userId: string;
  quizId: string;
  audience: 'public' | 'hcp';
  locale: InsightLocale;
  /** Session-scoped answers supplied by an authenticated caller. */
  context?: AnswerReviewContext;
  readingStyle?: 'everyday';
  allowGeneration?: boolean;
};

export type PreparedInsight = {
  state: PersonalInsightState;
  insight?: AutoProvisionalInsight;
  generate?: () => Promise<AutoProvisionalInsight | null>;
};

async function defaultDependencies() {
  const {
    claimProvisionalInsight, failProvisionalInsight, finishProvisionalInsight,
    getProvisionalInsight, getInsightGenerationState, getSimilarApprovedInsight,
    isAnswerPatternRejected, getUserAnswerReviewContext, invalidateProvisionalLanguage,
  } = await import('../db/provisional-insights');
  return {
    claimProvisionalInsight, failProvisionalInsight, finishProvisionalInsight,
    getProvisionalInsight, getInsightGenerationState, getSimilarApprovedInsight,
    isAnswerPatternRejected, getUserAnswerReviewContext, invalidateProvisionalLanguage,
    generateText: generatePersonalInsight, geminiModel: geminiLiteModel, isGeminiConfigured,
  };
}
export type InsightDependencies = Awaited<ReturnType<typeof defaultDependencies>>;

export async function prepareProvisionalInsight(input: ProvisionalInput, dependencies?: InsightDependencies): Promise<PreparedInsight> {
  const {
    claimProvisionalInsight, failProvisionalInsight, finishProvisionalInsight,
    getProvisionalInsight, getInsightGenerationState, getSimilarApprovedInsight,
    isAnswerPatternRejected, getUserAnswerReviewContext, invalidateProvisionalLanguage,
    generateText, geminiModel, isGeminiConfigured,
  } = dependencies ?? await defaultDependencies();
  const context = input.context ?? await getUserAnswerReviewContext(input.userId, input.quizId);
  if (!context || context.answers.length === 0) return { state: 'unavailable' };
  const patternSignature = answerPatternSignature({
    ...context,
    quizId: input.quizId,
    audience: input.audience,
    locale: input.locale,
    ...(input.readingStyle ? { readingStyle: input.readingStyle } : {}),
  });

  const answerSignature = personalDraftSignature(patternSignature, input.userId);
  if (await isAnswerPatternRejected(input.quizId, input.audience, input.locale, patternSignature, context)) return { state: 'rejected' };

  // Reuse approved wording before an unreviewed cache entry, without sending
  // the player's answers to the model again.
  const approved = await getSimilarApprovedInsight(input.quizId, input.audience, input.locale, context);
  if (approved) {
    const summary = { headline: approved.headline, body: approved.body, suggestion: approved.suggestion };
    if (validateInsightLanguage(summary, input.locale) && (input.readingStyle !== 'everyday' || (isEverydayInsight(summary) && hasSpecificInsightHeadline(summary)))) {
      return { state: 'approved', insight: { summary, status: 'approved' } };
    }
  }

  const existing = await getProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature);
  if (existing) {
    const summary = { headline: existing.headline, body: existing.body, suggestion: existing.suggestion };
    if (validateInsightLanguage(summary, input.locale) && (input.readingStyle !== 'everyday' || (isEverydayInsight(summary) && hasSpecificInsightHeadline(summary)))) {
      return { state: existing.status === 'approved' ? 'approved' : 'pending', insight: { summary, status: existing.status as 'provisional' | 'approved' } };
    }
    if (existing.status === 'approved') return { state: 'unavailable' };
    await invalidateProvisionalLanguage(existing.id);
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
        if (validateInsightLanguage(summary, input.locale) && (input.readingStyle !== 'everyday' || (isEverydayInsight(summary) && hasSpecificInsightHeadline(summary)))) {
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
