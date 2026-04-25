import { NextResponse } from "next/server";
import { getAllSessions, createSession } from "@/lib/db/queries";

export async function GET(request: Request) {
  try {
    const sessions = await getAllSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Failed to load sessions:", error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { quizId, userId, isPrivate } = body;

    if (!quizId || !userId) {
      return NextResponse.json({ error: "quizId and userId are required" }, { status: 400 });
    }

    const session = await createSession(quizId, userId, isPrivate);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
