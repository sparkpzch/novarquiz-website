import { NextResponse } from 'next/server';
import { duplicateQuiz } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { quizId } = await params;
    const body = await request.json();
    const { isQuizDuplicate } = body;

    const newQuiz = await duplicateQuiz(quizId, user.uid, !!isQuizDuplicate);
    return NextResponse.json(newQuiz, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
