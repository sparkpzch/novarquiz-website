import { NextResponse } from 'next/server';
import { getEntryQuestion } from '@/lib/db/queries';
import { getSessionUser } from '@/lib/auth';

export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  try {
    const question = await getEntryQuestion(sessionId);
    return NextResponse.json({
      media_url: question?.media_url ?? null,
      media_type: question?.media_type ?? null,
    });
  } catch {
    return NextResponse.json({ media_url: null, media_type: null });
  }
}
