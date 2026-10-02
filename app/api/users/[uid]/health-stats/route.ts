import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getUserHistory,
  getUserHistoryAnswers,
  getUserHealthStatsInput,
} from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { summarizeHealthStats } from '@/lib/stats/health';
import { INSIGHT_LOCALES } from '@/lib/analytics/insights';
import { composePersonalFeedback } from '@/lib/analytics/personal-feedback';
import { preparePersonalRecap } from '@/lib/ai/personal-recap';
import type { PreparedInsight } from '@/lib/ai/auto-provisional-insight';
import type { UserHistoryRow } from '@/lib/analytics/history';
import { checkRateLimit } from '@/lib/ratelimit';

export const maxDuration = 60;
const privateHeaders = { 'Cache-Control': 'private, no-store' };

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

  const limit = await checkRateLimit(user.uid, '/api/users/health-stats');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

  try {
    const input = await getUserHealthStatsInput(uid);
    const stats = summarizeHealthStats(input);
    // Home gets its recap from completed-session history; this request only
    // needs the topic breakdown and should not generate a second AI summary.
    if (query.data.summary === 'none') {
      return NextResponse.json({ ...stats, summary: null, feedback: null }, { headers: privateHeaders });
    }

    // Compatibility callers receive the same latest completed-quiz summary
    // as Home and Stats, never a general template or an unfinished attempt.
    let prepared: PreparedInsight = { state: 'unavailable' };
    const session = (await getUserHistory(uid) as UserHistoryRow[])[0];
    if (session) {
      try {
        const answers = await getUserHistoryAnswers(uid, session.session_id, session.completed_at);
        prepared = await preparePersonalRecap(uid, session, answers, query.data.locale);
        if (prepared.generate) {
          const generate = prepared.generate;
          after(async () => { await generate(); });
        }
      } catch (error) {
        console.error('health summary failed:', error instanceof Error ? error.message : 'unknown error');
      }
    }
    const resolvedSummary = prepared.insight?.summary ?? null;
    const feedback = composePersonalFeedback({
      summary: resolvedSummary,
      summaryStatus: prepared.insight?.status ?? null,
      latestTopic: null,
      locale: query.data.locale,
    });

    return NextResponse.json({ ...stats, summary: resolvedSummary, summaryStatus: prepared.insight?.status ?? null, insightState: prepared.state, summarySessionId: session?.session_id ?? null, feedback }, { headers: privateHeaders });
  } catch (err) {
    console.error('health-stats failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
