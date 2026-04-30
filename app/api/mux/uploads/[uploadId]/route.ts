import { NextResponse } from 'next/server';
import { getMuxVideoUpload } from '@/lib/db/queries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const { uploadId } = await params;
  const upload = await getMuxVideoUpload(uploadId);

  if (!upload) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(upload);
}
