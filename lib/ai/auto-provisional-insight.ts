import { answerPatternSignature, buildProvisionalInsightPrompt, parseProvisionalInsight } from '../analytics/provisional-insights';
import type { InsightLocale, InsightSummary } from '../analytics/insights';
import { isEverydayInsight } from '../analytics/history-coaching';
import { validateInsightLanguage } from '../analytics/insights';
import {
  claimProvisionalInsight,
  failProvisionalInsight,
  finishProvisionalInsight,
  getProvisionalInsight,
  getUserAnswerReviewContext,
  invalidateProvisionalLanguage,
  type AnswerReviewContext,
} from '../db/provisional-insights';
import { generateText, geminiModel, isGeminiConfigured } from './gemini';

export type AutoProvisionalInsight = {
  summary: InsightSummary;
  status: 'provisional' | 'approved';
};

/** Sends recorded selections and authored explanations, but never a UID or
 * clinical profile. Identical answer patterns share a cached model call. */
export async function getOrGenerateProvisionalInsight(input: {
  userId: string;
  quizId: string;
  audience: 'public' | 'hcp';
  locale: InsightLocale;
  /** Session-scoped answers supplied by an authenticated caller. */
  context?: AnswerReviewContext;
  readingStyle?: 'everyday';
}): Promise<AutoProvisionalInsight | null> {
  const context = input.context ?? await getUserAnswerReviewContext(input.userId, input.quizId);
  if (!context || context.answers.length === 0) return null;
  const answerSignature = answerPatternSignature({
    ...context,
    quizId: input.quizId,
    audience: input.audience,
    locale: input.locale,
    ...(input.readingStyle ? { readingStyle: input.readingStyle } : {}),
  });

  const existing = await getProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature);
  if (existing) {
    const summary = { headline: existing.headline, body: existing.body, suggestion: existing.suggestion };
    if (validateInsightLanguage(summary, input.locale) && (input.readingStyle !== 'everyday' || isEverydayInsight(summary))) {
      return { summary, status: existing.status as 'provisional' | 'approved' };
    }
    if (existing.status === 'approved') return null;
    await invalidateProvisionalLanguage(existing.id);
  }
  if (!isGeminiConfigured()) return null;

  const claim = await claimProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature, context);
  if (!claim) return null;

  try {
    const prompt = buildProvisionalInsightPrompt({
      ...context,
      audience: input.audience,
      locale: input.locale,
      readingStyle: input.readingStyle,
    });
    let drafted = parseProvisionalInsight(await generateText(prompt), input.locale, input.readingStyle);
    if (!drafted.ok && (drafted.reason.startsWith('summary is not in ') || drafted.reason === 'summary uses specialist or game language')) {
      drafted = parseProvisionalInsight(await generateText(`${prompt}\n\nReturn the JSON again. Every value MUST be in ${input.locale === 'th' ? 'Thai' : 'English'}.${input.readingStyle === 'everyday' ? ' Use only everyday words, without professional terms or game results.' : ''}`), input.locale, input.readingStyle);
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
}
