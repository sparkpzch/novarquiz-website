import { NextRequest, NextResponse } from 'next/server';
import { getEntryQuestion, getNextQuestion, getQuestionById, saveUserAnswer, getOrCreateSession } from '@/lib/db/queries';
import { parseJsonBody } from '@/lib/validation/api';
import { answerBodySchema, saveAnswerBodySchema } from '@/lib/validation/play';

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
    const body = await parseJsonBody(request, answerBodySchema);
    if (body instanceof NextResponse) return body;

    if (body.action === 'start') {
      // Guests skip play_session persistence — no analytics trail.
      if (body.is_guest) return NextResponse.json({ is_guest: true });
      if (!body.user_id) {
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
      }
      const playSession = await getOrCreateSession(sessionId, body.user_id);
      return NextResponse.json(playSession);
    }

    // Guests: no per-answer persistence (score stays client-side only).
    if (body.is_guest) return NextResponse.json({ is_guest: true });
    const answerBody = saveAnswerBodySchema.parse(body);

    // Server computes points from the choice's stored value — clients never
    // submit their own score, which would be trivially exploitable.
    const result = await saveUserAnswer({
      session_id: sessionId,
      user_id: answerBody.user_id,
      question_id: answerBody.question_id,
      chosen_label: answerBody.chosen_label,
      time_taken_ms: answerBody.time_taken_ms || 0,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
