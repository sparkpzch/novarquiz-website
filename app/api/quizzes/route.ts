import { NextResponse } from "next/server";
import { getAllQuizzes } from "@/lib/db/queries";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const quizzes = await getAllQuizzes();
    const published = quizzes.filter((q: any) => q.is_published === true);
    return NextResponse.json(published);
  } catch (error) {
    console.error("Failed to load quizzes:", error);
    return NextResponse.json([], { status: 500 });
  }
}
