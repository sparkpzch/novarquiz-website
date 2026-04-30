import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createMuxVideoUploadRecord } from '@/lib/db/queries';
import { getMuxCorsOrigin, mux } from '@/lib/mux/server';
import { parseJsonBody } from '@/lib/validation/api';
import { muxDirectUploadBodySchema } from '@/lib/validation/media';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    return NextResponse.json({ error: 'Mux credentials are not configured' }, { status: 500 });
  }

  const body = await parseJsonBody(request, muxDirectUploadBodySchema);
  if (body instanceof NextResponse) return body;

  const upload = await mux.video.uploads.create({
    cors_origin: getMuxCorsOrigin(request),
    timeout: 3600,
    new_asset_settings: {
      playback_policies: ['public'],
      video_quality: 'basic',
      passthrough: JSON.stringify({
        app: 'novarquiz',
        questionId: body.questionId,
        quizId: body.quizId ?? null,
      }).slice(0, 255),
    },
  });

  await createMuxVideoUploadRecord({
    upload_id: upload.id,
    question_id: body.questionId,
    quiz_id: body.quizId ?? null,
    file_name: body.fileName ?? null,
  });

  return NextResponse.json({
    uploadId: upload.id,
    uploadUrl: upload.url,
    status: upload.status,
  });
}
