import { NextRequest, NextResponse } from "next/server";
import { getAllSessions, createSession } from "@/lib/db/queries";
import { getSessionUser } from "@/lib/auth";

export async function GET(_request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sessions = await getAllSessions();
    const visible = user.isAdmin
      ? sessions
      : sessions.filter((s) => !(s as { is_private: boolean }).is_private || (s as { user_id: string }).user_id === user.uid);
    return NextResponse.json(visible);
  } catch (error) {
    console.error("Failed to load sessions:", error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { quizId, isPrivate, name } = body;

    if (!quizId) {
      return NextResponse.json({ error: "quizId is required" }, { status: 400 });
    }

    // user.uid comes from the verified session cookie, never from the request body.
    const session = await createSession(quizId, user.uid, isPrivate, name);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
