import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getQuizDraftContext, upsertInsightTemplate } from '@/lib/db/queries';
import {
  ANY_ARCHETYPE,
  ARCHETYPE_KEYS,
  INSIGHT_LOCALES,
  buildInsightPrompt,
  parseDraftResponse,
} from '@/lib/analytics/insights';
import { GeminiError, generateText, geminiModel, isGeminiConfigured } from '@/lib/ai/gemini';

// ---------------------------------------------------------------------------
// Drafts wording for one insight slot with Gemini and stores it as 'draft'.
//
// This runs at authoring time, never while a player is looking at their stats.
// The prompt is built from quiz content the admin wrote (questions, every
// choice, and optional behavior_meaning) — no player answers, no personal data,
// which is what makes a free-tier model acceptable here. The result still has
// to be approved by a human in the CMS before any player can see it.
// ---------------------------------------------------------------------------

const Body = z.object({
  quizId: z.string().uuid(),
  // '*' is the default: a public quiz produces no clinical archetype, so most
  // rows are written against the wildcard.
  archetypeId: z.enum(ARCHETYPE_KEYS).default(ANY_ARCHETYPE),
  clinicalTag: z.string().max(80).default(''),
  locale: z.enum(INSIGHT_LOCALES),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Tighter than the shared /api/admin limit: every call spends free-tier quota.
  const { allowed, retryAfter } = await checkRateLimit(
    `uid:${user.uid}`,
    '/api/admin/insight-templates/draft',
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 503 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { quizId, archetypeId, clinicalTag, locale } = parsed.data;

  try {
    const context = await getQuizDraftContext(quizId, clinicalTag);
    if (!context) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });

    // With nothing to ground it, the model would have to invent the facts.
    // Any quiz with point-losing choices clears this — no extra authoring.
    if (context.scenarios.length === 0) {
      return NextResponse.json(
        {
          error: clinicalTag
            ? `No point-losing choices are tagged "${clinicalTag}" in this quiz. ` +
              'Clear the tag to draft from the whole quiz.'
            : 'This quiz has no choices with a negative or zero score impact, so there is ' +
              'nothing for a summary to be about.',
        },
        { status: 422 },
      );
    }

    const audience = context.audience === 'hcp' ? 'hcp' : 'public';
    const text = await generateText(
      buildInsightPrompt({
        quizName: context.quizName,
        quizDescription: context.quizDescription,
        archetypeId,
        clinicalTag,
        audience,
        locale,
        scenarios: context.scenarios,
      }),
    );

    const draft = parseDraftResponse(text);
    if (!draft.ok) return NextResponse.json({ error: `Rejected draft: ${draft.reason}` }, { status: 422 });

    const template = await upsertInsightTemplate({
      quizId,
      archetypeId,
      clinicalTag,
      audience,
      locale,
      ...draft.value,
      source: 'llm_draft',
      model: geminiModel(),
      createdBy: user.uid,
    });

    return NextResponse.json(template);
  } catch (err) {
    if (err instanceof GeminiError) {
      console.error('insight draft failed:', err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('insight draft failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
