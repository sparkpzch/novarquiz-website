import { NextRequest, NextResponse } from 'next/server';
import { getSessionAnalytics, resolveSessionToQuizId, getQuizInsightBreakdown, getQuizById } from '@/lib/db/queries';
import pool from '@/lib/db/postgres';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  // 1. Authenticate and authorize admin from server-verified cookie
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // 2. Rate limit
  const { allowed, retryAfter } = await checkRateLimit(
    `uid:${user.uid}`,
    '/api/admin',
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionIdsParam = searchParams.get('sessionIds') || searchParams.get('ids') || '';
  const quizIdParam = searchParams.get('quizId') || '';

  const rawSessionIds = sessionIdsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Validate UUIDs
  const sessionIds = rawSessionIds.filter((id) => UUID_RE.test(id));

  try {
    let quiz = null;
    if (quizIdParam && UUID_RE.test(quizIdParam)) {
      quiz = await getQuizById(quizIdParam);
    }

    // If no explicit quizId provided, derive it from the first valid session
    if (!quiz && sessionIds.length > 0) {
      const derivedQuizId = await resolveSessionToQuizId(sessionIds[0]);
      if (derivedQuizId) {
        quiz = await getQuizById(derivedQuizId);
      }
    }

    // Fetch all available peer sessions for this quiz so the user can easily toggle/add more sessions
    let availableQuizSessions: any[] = [];
    if (quiz?.id) {
      const allSessionsResult = await pool.query(
        'SELECT * FROM sessions WHERE session_id = $1 ORDER BY started_at DESC',
        [quiz.id]
      );
      availableQuizSessions = (allSessionsResult.rows || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        pin_code: s.pin_code,
        status: s.status,
        started_at: s.started_at,
        ended_at: s.ended_at,
        created_at: s.created_at,
        is_private: s.is_private,
      }));
    }

    // Fetch analytics for each requested session in parallel
    const sessionAnalyticsPromises = sessionIds.map(async (sessionId) => {
      try {
        const analytics = await getSessionAnalytics(sessionId);
        if (!analytics) return null;

        const quizId = await resolveSessionToQuizId(sessionId);
        const insightBreakdown = quizId ? await getQuizInsightBreakdown(quizId) : [];

        // Exclude individual player leaderboards from comparison payload for high-level macro focus
        const leaderboard = analytics.leaderboard || [];
        const participantCount = leaderboard.length;
        const totalScoreSum = leaderboard.reduce((acc: number, cur: any) => acc + (Number(cur.total_score) || 0), 0);
        const avgScore = participantCount > 0 ? Math.round(totalScoreSum / participantCount) : 0;
        
        // Calculate average accuracy and response times across the cohort
        const avgAccuracy = participantCount > 0 
          ? Number((leaderboard.reduce((acc: number, cur: any) => acc + (Number(cur.accuracy) || (cur.total_score > 0 ? Math.min(100, Math.round(cur.total_score / 10)) : 0)), 0) / participantCount).toFixed(1))
          : 0;

        const avgTimeSeconds = participantCount > 0
          ? Math.round(leaderboard.reduce((acc: number, cur: any) => acc + (Number(cur.total_time_ms || 0) / 1000), 0) / participantCount)
          : 0;

        return {
          session: {
            id: analytics.session.id,
            name: analytics.session.name,
            pin_code: analytics.session.pin_code,
            status: analytics.session.status,
            started_at: analytics.session.started_at,
            ended_at: analytics.session.ended_at,
            quiz_name: analytics.session.quiz_name,
            quiz_description: analytics.session.quiz_description,
            intended_audience: analytics.session.intended_audience,
            presentation_mode: analytics.session.presentation_mode,
          },
          macroMetrics: {
            participantCount,
            avgScore,
            avgAccuracy,
            avgTimeSeconds,
          },
          questions: (analytics.questions || []).map((q: any) => ({
            id: q.id,
            question_text: q.question_text,
            node_type: q.node_type,
            total_responses: q.total_responses,
            avg_time_ms: q.avg_time_ms,
            node_friction_score: q.node_friction_score,
            choices: (q.choices || []).map((c: any) => ({
              label: c.label,
              text: c.text,
              score_impact: c.score_impact,
              count: c.count,
              clinical_tags: c.clinical_tags || [],
              behavior_meaning: c.behavior_meaning,
            })),
          })),
          insights: analytics.insights,
          insightBreakdownSummary: {
            totalProfiled: insightBreakdown.length,
            topArchetypes: insightBreakdown.reduce((acc: Record<string, number>, item: any) => {
              if (item.archetype_id) {
                acc[item.archetype_id] = (acc[item.archetype_id] || 0) + 1;
              }
              return acc;
            }, {}),
            frequentGaps: insightBreakdown.flatMap((i: any) => i.gap_tags || []).reduce((acc: Record<string, number>, tag: string) => {
              acc[tag] = (acc[tag] || 0) + 1;
              return acc;
            }, {}),
          },
        };
      } catch (err) {
        console.error(`Failed to load analytics for session ${sessionId}:`, err);
        return null;
      }
    });

    const results = (await Promise.all(sessionAnalyticsPromises)).filter(Boolean);

    return NextResponse.json({
      quiz: quiz ? {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        intended_audience: quiz.intended_audience,
        created_at: quiz.created_at,
      } : null,
      comparedSessions: results,
      availableQuizSessions,
    });
  } catch (error) {
    console.error('Failed to generate session comparison:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
