import { authorizeUpload, reserveUpload, releaseUpload, reserveVideoRetry, UploadAccessError } from '@/lib/security/upload-access';
import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createVideoJob, dispatchVideoJob, videoJobResult } from '@/lib/video/jobs';
import { adminStorage } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};
const ALLOWED_TYPES = Object.keys(MIME_TO_EXT);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  if (buf.length > 11 && buf.toString('ascii',4,8) === 'ftyp') return buf.toString('ascii',8,12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ROUTE_LIMITS caps this path at 5/min — previously declared but not enforced.
  // Keyed per-uid: authenticated route, prevents storage-cost abuse.
  const { allowed, retryAfter } = await checkRateLimit(`uid:${user.uid}`, '/api/upload');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let reservedId: string | undefined;
  let savedFile = false;
  try {
    // Authorize before reading a potentially large multipart body.
    const scope = await authorizeUpload(user, {quizId:req.headers.get('X-Quiz-Id') || undefined,draftId:req.headers.get('X-Upload-Draft-Id') || undefined});
    const declaredLength = Number(req.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 64 * 1024) return NextResponse.json({error:'File too large'}, {status:413});
    const form = await req.formData();
    const bodyScope = await authorizeUpload(user, {quizId:form.get('quizId') || undefined,draftId:form.get('draftId') || undefined});
    if (bodyScope !== scope) return NextResponse.json({error:'Upload scope does not match'}, {status:400});
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }
    if (!file.size || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const detectedMime = detectMimeFromBytes(buffer);
    if (!detectedMime || detectedMime !== file.type) {
      return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
    }

    // Extension derived from the validated MIME type, not the client-supplied filename.
    const ext = MIME_TO_EXT[file.type];
    const video = file.type.startsWith('video/');
    if (video && !process.env.VIDEO_PROCESSING_JOB) return NextResponse.json({ error: 'Video processing is not configured yet' }, { status: 503 });
    const id = randomUUID();
    await reserveUpload(user.uid,id,scope,file.size,video);
    reservedId = id;
    const dest = video ? `quiz-media/original-${id}.${ext}` : `quiz-media/${id}.${ext}`;

    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(dest);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000',
        contentDisposition: 'inline',
        metadata: {upload_owner:user.uid,upload_scope:scope,expected_size:String(file.size)},
      },
    });
    savedFile = true;
    if (video) {
      const [metadata] = await fileRef.getMetadata();
      await reserveVideoRetry(user.uid);
      const job = await createVideoJob(user.uid, dest, String(metadata.generation), id);
      after(async () => {
        try { await dispatchVideoJob(job.id); }
        catch { console.error('Video job dispatch failed; job retained for retry'); }
      });
      return NextResponse.json({ ...videoJobResult(job), processing: true }, { status: 202 });
    }
    await fileRef.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${dest}`;
    return NextResponse.json({ url, path: dest });
  } catch (err) {
    if (reservedId && !savedFile) await releaseUpload(user.uid,reservedId).catch(() => {});
    if (err instanceof UploadAccessError) return NextResponse.json({error:err.message},{status:err.status});
    console.error('Upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
