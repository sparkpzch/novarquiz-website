import { NextResponse } from "next/server";
import {
  getAllQuizzes,
  getPublishedQuizzes,
  createQuiz,
} from "@/lib/db/queries";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const quizzes =
      searchParams.get("all") === "true"
        ? await getAllQuizzes()
        : await getPublishedQuizzes();
    return NextResponse.json(quizzes);
  } catch (error) {
    console.error("Failed to load quizzes:", error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const quiz = await createQuiz(body);
    return NextResponse.json(quiz, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
