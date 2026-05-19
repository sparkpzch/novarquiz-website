import { NextResponse } from 'next/server';
import { duplicateQuiz, getQuizById } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { quizId } = await params;

    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Non-admins can only duplicate their own quizzes or published ones
    if (!user.isAdmin && quiz.created_by !== user.uid && !quiz.is_published) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const newQuiz = await duplicateQuiz(quizId, user.uid, !!body.isQuizDuplicate);
    return NextResponse.json(newQuiz, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
