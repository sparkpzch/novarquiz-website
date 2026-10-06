import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { adminStorage } from '@/lib/firebase/admin';
import { checkRateLimit } from '@/lib/ratelimit';
import { createVideoJob, dispatchVideoJob, getVideoJob, videoJobResult } from '@/lib/video/jobs';

const Start = z.object({ action: z.literal('init'), size: z.number().int().positive().max(50 * 1024 * 1024), type: z.enum(['video/mp4', 'video/quicktime']) });
const Finish = z.object({ action: z.literal('finish'), id: z.string().uuid(), ext: z.enum(['mp4', 'mov']) });

/** Upload bytes directly to a private GCS session, avoiding the web server's request-size limit. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = await checkRateLimit(`uid:${user.uid}`, '/api/upload');
  if (!limit.allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
  if (!process.env.VIDEO_PROCESSING_JOB) return NextResponse.json({ error: 'Video processing is unavailable' }, { status: 503 });
  const raw = await request.json().catch(() => null);
  const start = Start.safeParse(raw);
  const finish = Finish.safeParse(raw);
  if (!start.success && !finish.success) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  try {
    const bucket = adminStorage.bucket();
    if (start.success) {
      const id = randomUUID();
      const ext = start.data.type === 'video/quicktime' ? 'mov' : 'mp4';
      const file = bucket.file(`quiz-media/original-${id}.${ext}`);
      const [uploadUrl] = await file.createResumableUpload({ origin: process.env.APP_ORIGIN ?? new URL(request.url).origin,
        metadata: { contentType: start.data.type, contentLength: start.data.size, metadata: { upload_owner: user.uid, expected_size: String(start.data.size) } } });
      return NextResponse.json({ id, ext, uploadUrl }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const { id, ext } = finish.data!;
    const existing = await getVideoJob(id);
    if (existing) return existing.owner_uid === user.uid
      ? NextResponse.json({ ...videoJobResult(existing), processing: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
    const path = `quiz-media/original-${id}.${ext}`;
    const file = bucket.file(path);
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.upload_owner !== user.uid) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const size = Number(metadata.size);
    const [header] = await file.download({ start: 0, end: 31 });
    const type = header.toString('ascii', 4, 8) === 'ftyp' ? (header.toString('ascii', 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4') : null;
    if (!size || size > 50 * 1024 * 1024 || size !== Number(metadata.metadata?.expected_size) || type !== metadata.contentType) {
      await file.delete();
      return NextResponse.json({ error: 'Use an MP4 or MOV video up to 50 MB' }, { status: 400 });
    }
    const job = await createVideoJob(user.uid, path, String(metadata.generation), id);
    after(async () => { try { await dispatchVideoJob(job.id); } catch { console.error('Video job retained for retry'); } });
    return NextResponse.json({ ...videoJobResult(job), processing: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Could not complete upload. Please retry.' }, { status: 503 });
  }
}
