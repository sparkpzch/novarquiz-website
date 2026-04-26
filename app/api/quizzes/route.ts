import { NextResponse } from "next/server";
import { getAllQuizzes } from "@/lib/db/queries";

export async function GET() {
  try {
    const quizzes = await getAllQuizzes();
    const published = quizzes.filter((q: any) => q.is_published === true);
    return NextResponse.json(published);
  } catch (error) {
    console.error("Failed to load quizzes:", error);
    return NextResponse.json([], { status: 500 });
  }
}
