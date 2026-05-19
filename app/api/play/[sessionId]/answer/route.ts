import { NextRequest, NextResponse } from 'next/server';
import { getEntryQuestion, getNextQuestion, getQuestionById, saveUserAnswer, getOrCreateSession } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

// Strip score_impact and explanation from choices so the answer key is never
// exposed to clients. The server computes scores in saveUserAnswer using the
// DB value; clients never need to see score_impact.
function sanitizeQuestion(question: Record<string, unknown> | null) {
  if (!question) return question;
  const choices = Array.isArray(question.choices)
    ? question.choices.map(({ score_impact: _, explanation: __, ...rest }: Record<string, unknown>) => rest)
    : question.choices;
  return { ...question, choices };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const searchParams = request.nextUrl.searchParams;

  try {
    if (searchParams.get('entry') === 'true') {
      const question = await getEntryQuestion(sessionId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(question));
    }

    const fromQuestionId = searchParams.get('fromQuestionId');
    const choiceLabel = searchParams.get('choiceLabel');
    if (fromQuestionId && choiceLabel) {
      const next = await getNextQuestion(fromQuestionId, choiceLabel);
      if (!next) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(next));
    }

    const questionId = searchParams.get('questionId');
    if (questionId) {
      const question = await getQuestionById(questionId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(sanitizeQuestion(question));
    }

    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const body = await request.json();

    if (body.action === 'start') {
      // Guests skip play_session persistence — no analytics trail.
      if (body.is_guest) return NextResponse.json({ is_guest: true });
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const playSession = await getOrCreateSession(sessionId, user.uid);
      return NextResponse.json(playSession);
    }

    // Guests: no per-answer persistence (score stays client-side only).
    if (body.is_guest) return NextResponse.json({ is_guest: true });

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Server computes points from the choice's stored value — clients never
    // submit their own score, which would be trivially exploitable.
    // user_id always comes from the verified session, never from the request body.
    const result = await saveUserAnswer({
      session_id: sessionId,
      user_id: user.uid,
      question_id: body.question_id,
      chosen_label: body.chosen_label,
      time_taken_ms: body.time_taken_ms || 0,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
