import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSessions, createSession, getQuizById } from "@/lib/db/queries";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sessions = user.isAdmin
      ? await getAllSessions()
      : await getAllSessions(user.uid);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Failed to load sessions:", error);
    return NextResponse.json([], { status: 500 });
  }
}

// The client also sends `userId`; it is stripped here and never trusted.
const SessionCreateSchema = z.object({
  quizId: z.string().uuid(),
  isPrivate: z.boolean().optional(),
  name: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Sessions are created from the admin Quizzes page only; enforce it here too.
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, "/api/sessions/create");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const parsed = SessionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { quizId, isPrivate, name } = parsed.data;
    if (!(await getQuizById(quizId))) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    // user.uid comes from the verified session cookie, never from the request body.
    const session = await createSession(quizId, user.uid, isPrivate, name);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
