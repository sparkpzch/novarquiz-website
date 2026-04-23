import { NextResponse } from 'next/server';
import pool from '@/lib/db/postgres';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  try {
    const { pin } = await request.json();
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });

    const result = await pool.query(
      `SELECT id FROM question_sessions
       WHERE id = $1 AND pin_code = $2 AND is_published = TRUE`,
      [sessionId, String(pin)],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
