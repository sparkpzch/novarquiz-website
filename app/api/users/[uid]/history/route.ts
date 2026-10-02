import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getApprovedInsightSummary, getUserConsent, getUserHealthStatsInput, getUserHistory, getUserHistoryAnswers } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { INSIGHT_LOCALES } from '@/lib/analytics/insights';
import { summarizeHistoryTopics, type UserHistoryRow } from '@/lib/analytics/history';
import { isEverydayInsight } from '@/lib/analytics/history-coaching';
import { composePersonalFeedback } from '@/lib/analytics/personal-feedback';
import { getOrGenerateProvisionalInsight } from '@/lib/ai/auto-provisional-insight';
import { PRIVACY_VERSION } from '@/components/ui/TermsModal';

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
    if (!query.data.session) return NextResponse.json(rows);
    // A run must belong to this user's own history, even when its ID is guessed.
    const session = rows.find((row) => row.session_id === query.data.session);
    if (!session) return NextResponse.json({ error: 'Session not found in your history' }, { status: 404 });
    const answers = await getUserHistoryAnswers(uid, session.session_id);
    const topics = summarizeHistoryTopics(answers);
    // The History report only reads recorded results. AI belongs on Stats.
    if (query.data.summary === 'none') return NextResponse.json({ session, answers, topics, feedback: null });
    const gapTags = [...new Set(answers.filter((answer) => !answer.selectedAligned).flatMap((answer) => answer.tags))];
    const { locale } = query.data;
    let summary = null;
    let provisional = null;
    // Summary failures must not hide the recorded results and explanations.
    if (session.quiz_id && answers.length) {
      try {
        const input = await getUserHealthStatsInput(uid);
        const topic = input.topics.find((item) => item.quiz_id === session.quiz_id);
        const audience = topic?.audience === 'hcp' ? 'hcp' : 'public';
        const reviewed = await getApprovedInsightSummary({ quizId: session.quiz_id, tags: gapTags, audience, locale });
        summary = reviewed && isEverydayInsight(reviewed) ? reviewed : null;
        provisional = await getOrGenerateProvisionalInsight({
          userId: uid, quizId: session.quiz_id, audience, locale, readingStyle: 'everyday',
          allowGeneration: (await getUserConsent(uid))?.privacy_version === PRIVACY_VERSION,
          context: { quizName: topic?.quiz_name ?? session.session_name, quizDescription: session.session_description, answers: answers.map(({ question, selected, selectedExplanation, selectedAligned, alignedChoices }) => ({ question, selected, selectedExplanation, selectedAligned, alignedChoices })) },
        });
      } catch (error) {
        console.error('history summary failed:', error instanceof Error ? error.message : 'unknown error');
      }
    }
    const feedback = composePersonalFeedback({
      summary: provisional?.summary ?? summary ?? null,
      summaryStatus: provisional?.status ?? (summary ? 'approved' : null),
      latestTopic: answers.length ? { name: session.session_name, score: Math.round(answers.filter((a) => a.selectedAligned).length / answers.length * 100) } : null,
      locale,
    });
    return NextResponse.json({ session, answers, topics, feedback });
  } catch (error) {
    console.error('history failed:', error);
    return NextResponse.json({ error: 'Unable to load history' }, { status: 500 });
  }
}
