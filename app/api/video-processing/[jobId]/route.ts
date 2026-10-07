import { authorizeUpload, reserveVideoRetry, settleVideoStorage, UploadAccessError } from '@/lib/security/upload-access';
import { adminRtdb, adminStorage } from '@/lib/firebase/admin';
import { checkRateLimit } from '@/lib/ratelimit';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import pool from '@/lib/db/postgres';
import { dispatchVideoJob, getVideoJob, videoJobResult } from '@/lib/video/jobs';
async function authorize(jobId:string) {
  const user=await getSessionUser();
  if(!user)return null;
  if(!z.string().uuid().safeParse(jobId).success)return null;
  const job=await getVideoJob(jobId);
  if (!job) return null;
  const reservation = (await adminRtdb.ref(`uploadReservations/${job.id}`).get()).val();
  if (reservation && (reservation.uid !== job.owner_uid || reservation.status === 'released')) return null;
  const scope = reservation?.scope;
  // Legacy jobs remain admin-only; new jobs must still belong to an editable quiz.
  if (typeof scope !== 'string' || !scope) return user.isAdmin ? {...job,requesterUid:user.uid} : null;
  const [kind,id] = scope.split(':');
  if (kind==='draft' && job.owner_uid!==user.uid && !user.isAdmin) return null;
  try { await authorizeUpload(user, kind==='quiz'?{quizId:id}:{draftId:id}); }
  catch { return null; }
  return {...job,requesterUid:user.uid};
}
export async function GET(_request:Request,{params}:{params:Promise<{jobId:string}>}) {
  const job=await authorize((await params).jobId);
  if (job?.status==='ready' && job.output_path) {
    try {
      const reservation=(await adminRtdb.ref(`uploadReservations/${job.id}`).get()).val();
      if (reservation?.status==='settled') await settleVideoStorage(job.owner_uid,job.id);
      else if (reservation) {
        const prefix=job.output_path.slice(0,job.output_path.lastIndexOf('/')+1);
        const [files]=await adminStorage.bucket().getFiles({prefix});
        const bytes=files.reduce((total,file)=>total+Number(file.metadata.size),0);
        await settleVideoStorage(job.owner_uid,job.id,bytes);
      }
    } catch { /* Keep conservative reservations if metadata is temporarily unavailable. */ }
  }
  return job?NextResponse.json(videoJobResult(job),{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'Not found'},{status:404});
}
export async function POST(_request:Request,{params}:{params:Promise<{jobId:string}>}) {
  const job=await authorize((await params).jobId);
  if(!job)return NextResponse.json({error:'Not found'},{status:404});
  const limit=await checkRateLimit(`uid:${job.requesterUid}`,'/api/upload');
  if(!limit.allowed)return NextResponse.json({error:'Too many processing attempts'},{status:429});
  // The per-job SQL claim makes concurrent retries idempotent. The daily budget
  // is also shared with fresh video uploads and enforced across all instances.
  const claimed=await pool.query(`UPDATE video_processing_jobs SET status='queued',error=NULL,updated_at=NOW()
    WHERE id=$1 AND (status='failed' OR (status='queued' AND updated_at<NOW()-INTERVAL '1 minute') OR (status='processing' AND updated_at<NOW()-INTERVAL '30 minutes')) RETURNING id`,[job.id]);
  if(!claimed.rowCount)return NextResponse.json({error:'Job is already running'},{status:409});
  try {await reserveVideoRetry(job.requesterUid);await dispatchVideoJob(job.id);return NextResponse.json({status:'queued'});}
  catch (error) {
    await pool.query("UPDATE video_processing_jobs SET status='failed',updated_at=NOW() WHERE id=$1 AND status='queued'",[job.id]);
    return NextResponse.json({error:error instanceof UploadAccessError?error.message:'Could not start processing; retry later'}, {status:error instanceof UploadAccessError?error.status:503});
  }
}
