import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getUserHistory, getUserHistoryAnswers } from '@/lib/db/queries';
import { preparePersonalRecap } from '@/lib/ai/personal-recap';
import type { UserHistoryRow } from '@/lib/analytics/history';
import type { PlayerInsightReport } from '@/lib/analytics/player-insight';

const querySchema = z.object({ uid: z.string().min(1).max(128), locale: z.enum(['en', 'th']).default('en') });
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const admin = await getSessionUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers });
  const sessionId = z.string().uuid().safeParse((await params).sessionId);
  const query = querySchema.safeParse({ uid: request.nextUrl.searchParams.get('uid'), locale: request.nextUrl.searchParams.get('locale') ?? undefined });
  if (!sessionId.success || !query.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers });
  const limit = await checkRateLimit(`uid:${admin.uid}`, '/api/admin');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfter) } });
  try {
    const { uid } = query.data;
    // Scope to this participant's completed run, never another run of the quiz.
    const rows = await getUserHistory(uid) as UserHistoryRow[];
    const session = rows.find(row => row.session_id === sessionId.data);
    if (!session) return NextResponse.json({ error: 'Completed result not found for this player' }, { status: 404, headers });
    const answers = await getUserHistoryAnswers(uid, session.session_id, session.completed_at);
    let locale = query.data.locale;
    let prepared = await preparePersonalRecap(uid, session, answers, locale, undefined, { readOnly: true });
    // Inspect the existing language if no wording exists in the admin's language.
    // Opening a report must never request a translation or a new Gemini draft.
    if (!prepared.insight && prepared.state === 'unavailable') {
      const alternate = locale === 'en' ? 'th' : 'en';
      const saved = await preparePersonalRecap(uid, session, answers, alternate, undefined, { readOnly: true });
      if (saved.insight || saved.state === 'generating') { prepared = saved; locale = alternate; }
    }
    const report: PlayerInsightReport = {
      state: prepared.state, locale, answers,
      summary: prepared.insight?.summary ?? null,
      sourceContext: prepared.insight?.context ?? null,
    };
    return NextResponse.json(report, { headers });
  } catch (error) {
    console.error('Player insight report failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Unable to load this summary' }, { status: 500, headers });
  }
}
