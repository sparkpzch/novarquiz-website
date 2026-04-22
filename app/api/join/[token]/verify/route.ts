import { NextResponse } from 'next/server';
import pool from '@/lib/db/postgres';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const { pin } = await request.json();
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });

    const result = await pool.query(
      `SELECT id FROM question_sessions
       WHERE share_token = $1 AND pin_code = $2 AND is_published = TRUE`,
      [token, String(pin)],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }
    return NextResponse.json({ sessionId: result.rows[0].id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
