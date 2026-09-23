import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getApprovedInsightSummary,
  getUserChoiceInsight,
  getUserHealthStatsInput,
} from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { summarizeHealthStats } from '@/lib/stats/health';
import { INSIGHT_LOCALES } from '@/lib/analytics/insights';

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

    // Prefer a reviewed explanation for a choice this player actually made.
    // This includes both negative choices and zero-impact choices that were
    // reasonable but did not answer the question's learning objective.
    const choiceInsight = stats.latestTopic
      ? await getUserChoiceInsight(uid, stats.latestTopic.quiz_id)
      : null;

    // The narrative is looked up, never generated here: only rows a human
    // approved in the CMS can reach a player. No approved match is a normal
    // outcome — the page falls back to its own rule-based line.
    //
    // A null archetype is the common case, not an error: the six HCP vectors
    // describe clinical decision style, which a public quiz never produces.
    // Those players resolve against '*' rows instead.
    // Anchored on the quiz answered most recently, not the weakest one: the
    // player has just finished something and expects to read about that.
    const summary = stats.latestTopic
      ? await getApprovedInsightSummary({
          quizId: stats.latestTopic.quiz_id,
          archetypeId: stats.archetype,
          tags: stats.gapTags,
          audience: stats.latestTopic.audience,
          locale: query.data.locale,
        })
      : null;

    return NextResponse.json({ ...stats, choiceInsight, summary });
  } catch (err) {
    console.error('health-stats failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
