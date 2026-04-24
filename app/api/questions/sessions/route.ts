import { NextResponse } from "next/server";
import {
  getAllSessions,
  getPublishedSessions,
  createSession,
} from "@/lib/db/queries";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessions =
      searchParams.get("all") === "true"
        ? await getAllSessions()
        : await getPublishedSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Failed to load question sessions:", error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = await createSession(body);
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
