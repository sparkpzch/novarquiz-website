import { answerPatternSignature, buildProvisionalInsightPrompt, parseProvisionalInsight } from '../analytics/provisional-insights';
import type { InsightLocale, InsightSummary } from '../analytics/insights';
import {
  claimProvisionalInsight,
  failProvisionalInsight,
  finishProvisionalInsight,
  getProvisionalInsight,
  getUserAnswerReviewContext,
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
}): Promise<AutoProvisionalInsight | null> {
  const context = await getUserAnswerReviewContext(input.userId, input.quizId);
  if (!context || context.answers.length === 0) return null;
  const answerSignature = answerPatternSignature({
    ...context,
    quizId: input.quizId,
    audience: input.audience,
    locale: input.locale,
  });

  const existing = await getProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature);
  if (existing) {
    return {
      summary: { headline: existing.headline, body: existing.body, suggestion: existing.suggestion },
      status: existing.status as 'provisional' | 'approved',
    };
  }
  if (!isGeminiConfigured()) return null;

  const claim = await claimProvisionalInsight(input.quizId, input.audience, input.locale, answerSignature, context);
  if (!claim) return null;

  try {
    const drafted = parseProvisionalInsight(await generateText(buildProvisionalInsightPrompt({
      ...context,
      audience: input.audience,
      locale: input.locale,
    })));
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
