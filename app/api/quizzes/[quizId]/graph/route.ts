import { NextRequest, NextResponse } from 'next/server';
import {
  createQuestion,
  upsertChoices,
  getQuestionsByQuiz,
  saveConnections,
  getConnectionsByQuiz,
  deleteQuestionsByQuiz,
  resolveQuizId,
  replaceQuizGraph,
  getQuizById,
} from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

async function requireQuizOwnership(quizId: string) {
  const user = await getSessionUser();
  if (!user) return { error: 'Unauthorized', status: 401 } as const;
  const quiz = await getQuizById(quizId);
  if (!quiz) return { error: 'Not found', status: 404 } as const;
  if (!user.isAdmin && quiz.created_by !== user.uid) return { error: 'Forbidden', status: 403 } as const;
  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    const questions = await getQuestionsByQuiz(realId);
    const connections = await getConnectionsByQuiz(realId);
    return NextResponse.json({ questions, connections });
  } catch (err) {
    console.error(`Failed to load graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    const body = await request.json();
    const question = await createQuestion({ ...body, session_id: realId });
    if (body.choices?.length) {
      await upsertChoices(question.id, body.choices);
    }
    return NextResponse.json(question, { status: 201 });
  } catch (err) {
    console.error(`Failed to create question for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const MEDIA_PATH_RE = /^quiz-media\/[\w.-]+$/;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    let preservePaths = new Set<string>();
    try {
      const body = await request.json();
      if (Array.isArray(body?.preserve_paths)) {
        preservePaths = new Set(
          (body.preserve_paths as unknown[]).filter(
            (p): p is string => typeof p === 'string' && MEDIA_PATH_RE.test(p),
          ),
        );
      }
    } catch { /* body not provided or not JSON */ }
    await deleteQuestionsByQuiz(realId, preservePaths);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to delete questions for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const denied = await requireQuizOwnership(quizId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const realId = await resolveQuizId(quizId);
    const body = await request.json();
    if (Array.isArray(body.questions) && Array.isArray(body.connections)) {
      const result = await replaceQuizGraph(realId, body.questions, body.connections);
      return NextResponse.json({ ok: true, idMap: result.idMap });
    }
    if (body.connections) {
      await saveConnections(realId, body.connections);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to update graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
