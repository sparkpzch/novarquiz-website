import { NextResponse } from "next/server";
import { getAllQuizzes } from "@/lib/db/queries";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const quizzes = await getAllQuizzes();
    const includeDrafts = user.isAdmin && new URL(request.url).searchParams.get("all") === "true";
    const published = includeDrafts ? quizzes : quizzes.filter((q) => q.is_published === true);
    return NextResponse.json(published);
  } catch (error) {
    console.error("Failed to load quizzes:", error);
    return NextResponse.json([], { status: 500 });
  }
}
