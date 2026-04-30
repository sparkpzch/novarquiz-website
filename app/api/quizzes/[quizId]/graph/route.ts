import { NextResponse } from 'next/server';
import {
  createQuestion,
  upsertChoices,
  getQuestionsByQuiz,
  saveConnections,
  getConnectionsByQuiz,
  deleteQuestionsByQuiz,
  resolveQuizId,
  replaceQuizGraph,
} from '@/lib/db/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const realId = await resolveQuizId(quizId);
    const questions = await getQuestionsByQuiz(realId);
    const connections = await getConnectionsByQuiz(realId);
    return NextResponse.json({ questions, connections });
  } catch (err) {
    console.error(`Failed to load graph for quiz ${quizId}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const realId = await resolveQuizId(quizId);
    const body = await request.json();
    const question = await createQuestion({ ...body, session_id: realId });
    if (body.choices?.length) {
      await upsertChoices(question.id, body.choices);
    }
    return NextResponse.json(question, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  try {
    const realId = await resolveQuizId(quizId);
    let preservePaths = new Set<string>();
    try {
      const body = await request.json();
      if (Array.isArray(body?.preserve_paths)) {
        preservePaths = new Set(body.preserve_paths.filter(Boolean));
      }
    } catch { /* body not provided or not JSON */ }
    await deleteQuestionsByQuiz(realId, preservePaths);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
