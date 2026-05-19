import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/auth';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4',
];
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split('.').pop() ?? 'bin';
    const dest = `quiz-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const safeFileName = file.name.replace(/[^\w.-]/g, '_');

    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(dest);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000',
        contentDisposition: `inline; filename="${safeFileName}"`,
      },
    });
    await fileRef.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${dest}`;
    return NextResponse.json({ url, path: dest });
  } catch (err) {
    console.error('Upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
