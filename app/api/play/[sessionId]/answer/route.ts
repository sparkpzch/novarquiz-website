import { NextRequest, NextResponse } from 'next/server';
import { getEntryQuestion, getNextQuestion, getQuestionById, saveUserAnswer, getOrCreatePlaySession } from '@/lib/db/queries';

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const searchParams = request.nextUrl.searchParams;

  try {
    if (searchParams.get('entry') === 'true') {
      const question = await getEntryQuestion(sessionId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(question);
    }

    const fromQuestionId = searchParams.get('fromQuestionId');
    const choiceLabel = searchParams.get('choiceLabel');
    if (fromQuestionId && choiceLabel) {
      const next = await getNextQuestion(fromQuestionId, choiceLabel);
      if (!next) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(next);
    }

    const questionId = searchParams.get('questionId');
    if (questionId) {
      const question = await getQuestionById(questionId);
      if (!question) return NextResponse.json(null, { status: 404 });
      return NextResponse.json(question);
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
      const playSession = await getOrCreatePlaySession(sessionId, body.user_id);
      return NextResponse.json(playSession);
    }

    // Guests: no per-answer persistence (score stays client-side only).
    if (body.is_guest) return NextResponse.json({ is_guest: true });

    // Save answer
    const points = body.is_correct ? Math.max(100, 1000) : 0;
    const answer = await saveUserAnswer({
      session_id: sessionId,
      user_id: body.user_id,
      question_id: body.question_id,
      chosen_label: body.chosen_label,
      is_correct: body.is_correct,
      time_taken_ms: body.time_taken_ms || 0,
      points_earned: points,
    });

    return NextResponse.json(answer);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
