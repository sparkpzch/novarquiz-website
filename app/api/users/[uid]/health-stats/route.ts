import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getApprovedInsightSummary,
  getUserConsent,
  getUserHealthStatsInput,
} from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { summarizeHealthStats } from '@/lib/stats/health';
import { INSIGHT_LOCALES } from '@/lib/analytics/insights';
import { composePersonalFeedback } from '@/lib/analytics/personal-feedback';
import { getOrGenerateProvisionalInsight } from '@/lib/ai/auto-provisional-insight';
import { PRIVACY_VERSION } from '@/components/ui/TermsModal';

const Params = z.object({ uid: z.string().min(1).max(128) });
const Query = z.object({
  locale: z.enum(INSIGHT_LOCALES).default('th'),
  summary: z.enum(['include', 'none']).default('include'),
});

// Per-topic knowledge summary for the /stats "Health" tab. Only the player's
// own answers (or any, for admins) — same access rule as /history.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const parsed = Params.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { uid } = parsed.data;

  const query = Query.safeParse({
    locale: request.nextUrl.searchParams.get('locale') ?? undefined,
    summary: request.nextUrl.searchParams.get('summary') ?? undefined,
  });
  if (!query.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.isAdmin && user.uid !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const input = await getUserHealthStatsInput(uid);
    const stats = summarizeHealthStats(input);
    // Home gets its recap from completed-session history; this request only
    // needs the topic breakdown and should not generate a second AI summary.
    if (query.data.summary === 'none') {
      return NextResponse.json({ ...stats, summary: null, feedback: null });
    }

    // Recorded-answer summaries take priority over general CMS copy. Consent
    // gates new model calls; approved cached wording needs no external call.
    const summary = stats.latestTopic
      ? await getApprovedInsightSummary({
          quizId: stats.latestTopic.quiz_id,
          tags: stats.gapTags,
          audience: stats.latestTopic.audience,
          locale: query.data.locale,
        })
      : null;

    let provisional = null;
    if (stats.latestTopic) {
      try {
        provisional = await getOrGenerateProvisionalInsight({
          userId: uid,
          quizId: stats.latestTopic.quiz_id,
          audience: stats.latestTopic.audience === 'hcp' ? 'hcp' : 'public',
          locale: query.data.locale,
          readingStyle: 'everyday',
          allowGeneration: (await getUserConsent(uid))?.privacy_version === PRIVACY_VERSION,
        });
      } catch (error) {
        console.error('health summary failed:', error instanceof Error ? error.message : 'unknown error');
      }
    }
    const resolvedSummary = provisional?.summary ?? summary;

    const feedback = composePersonalFeedback({
      summary: resolvedSummary,
      summaryStatus: provisional?.status ?? (summary ? 'approved' : null),
      latestTopic: stats.latestTopic,
      locale: query.data.locale,
    });

    return NextResponse.json({ ...stats, summary: resolvedSummary, summaryStatus: provisional?.status ?? (summary ? 'approved' : null), feedback });
  } catch (err) {
    console.error('health-stats failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
