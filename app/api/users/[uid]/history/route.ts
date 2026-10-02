import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUserHistory, getUserHistoryAnswers } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { INSIGHT_LOCALES } from '@/lib/analytics/insights';
import { summarizeHistoryTopics, type UserHistoryRow } from '@/lib/analytics/history';
import { composePersonalFeedback } from '@/lib/analytics/personal-feedback';
import { preparePersonalRecap } from '@/lib/ai/personal-recap';
import type { PreparedInsight } from '@/lib/ai/auto-provisional-insight';

export const maxDuration = 60;
const privateHeaders = { 'Cache-Control': 'private, no-store' };

const Params = z.object({ uid: z.string().min(1).max(128) });
const Query = z.object({ session: z.string().uuid().optional(), locale: z.enum(INSIGHT_LOCALES).default('en'), summary: z.enum(['include', 'none']).default('include') });

export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const parsed = Params.safeParse(await params);
  const query = Query.safeParse({
    session: request.nextUrl.searchParams.get('session') ?? undefined,
    locale: request.nextUrl.searchParams.get('locale') ?? undefined,
    summary: request.nextUrl.searchParams.get('summary') ?? undefined,
  });
  if (!parsed.success || !query.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { uid } = parsed.data;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.isAdmin && user.uid !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const limit = await checkRateLimit(user.uid, '/api/users/history');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

  try {
    const rows = await getUserHistory(uid) as UserHistoryRow[];
    if (!query.data.session) return NextResponse.json(rows, { headers: privateHeaders });
    // A run must belong to this user's own history, even when its ID is guessed.
    const session = rows.find((row) => row.session_id === query.data.session);
    if (!session) return NextResponse.json({ error: 'Session not found in your history' }, { status: 404 });
    const answers = await getUserHistoryAnswers(uid, session.session_id, session.completed_at);
    const topics = summarizeHistoryTopics(answers);
    // The History report only reads recorded results. AI belongs on Stats.
    if (query.data.summary === 'none') return NextResponse.json({ session, answers, topics, feedback: null }, { headers: privateHeaders });
    const { locale } = query.data;
    let prepared: PreparedInsight = { state: 'unavailable' };
    // Keep the recorded answers available even if the model/provider is down.
    try {
      prepared = await preparePersonalRecap(uid, session, answers, locale);
      if (prepared.generate) {
        const generate = prepared.generate;
        after(async () => { await generate(); });
      }
    } catch (error) {
      console.error('history summary failed:', error instanceof Error ? error.message : 'unknown error');
    }
    const feedback = composePersonalFeedback({
      summary: prepared.insight?.summary ?? null,
      summaryStatus: prepared.insight?.status ?? null,
      latestTopic: answers.length ? { name: session.session_name, score: Math.round(answers.filter((a) => a.selectedAligned).length / answers.length * 100) } : null,
      locale,
    });
    return NextResponse.json({ session, answers, topics, feedback, insightState: prepared.state }, { headers: privateHeaders });
  } catch (error) {
    console.error('history failed:', error);
    return NextResponse.json({ error: 'Unable to load history' }, { status: 500 });
  }
}
