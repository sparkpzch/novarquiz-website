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
const Query = z.object({ locale: z.enum(INSIGHT_LOCALES).default('th') });

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

    // Approved CMS copy always wins. Only when absent do we use a separately
    // marked AI draft based on the player's recorded selections, the answer
    // key, and authored explanations. The UID is used only for DB lookup;
    // answer patterns, rather than user IDs, key the shared cache.
    //
    // Anchored on the quiz answered most recently, not the weakest one: the
    // player has just finished something and expects to read about that.
    const summary = stats.latestTopic
      ? await getApprovedInsightSummary({
          quizId: stats.latestTopic.quiz_id,
          tags: stats.gapTags,
          audience: stats.latestTopic.audience,
          locale: query.data.locale,
        })
      : null;

    const maySendAnswersToGemini = !summary && stats.latestTopic
      ? (await getUserConsent(uid))?.privacy_version === PRIVACY_VERSION
      : false;

    const provisional = maySendAnswersToGemini && stats.latestTopic
      ? await getOrGenerateProvisionalInsight({
          userId: uid,
          quizId: stats.latestTopic.quiz_id,
          audience: stats.latestTopic.audience === 'hcp' ? 'hcp' : 'public',
          locale: query.data.locale,
        })
      : null;

    const feedback = composePersonalFeedback({
      summary: summary ?? provisional?.summary ?? null,
      summaryStatus: provisional?.status ?? (summary ? 'approved' : null),
      latestTopic: stats.latestTopic,
      locale: query.data.locale,
    });

    return NextResponse.json({ ...stats, summary, feedback });
  } catch (err) {
    console.error('health-stats failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
