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
  return job&&(job.owner_uid===user.uid||user.isAdmin)?job:null;
}
export async function GET(_request:Request,{params}:{params:Promise<{jobId:string}>}) {
  const job=await authorize((await params).jobId);
  return job?NextResponse.json(videoJobResult(job),{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'Not found'},{status:404});
}
export async function POST(_request:Request,{params}:{params:Promise<{jobId:string}>}) {
  const job=await authorize((await params).jobId);
  if(!job)return NextResponse.json({error:'Not found'},{status:404});
  const claimed=await pool.query(`UPDATE video_processing_jobs SET status='queued',error=NULL,updated_at=NOW()
    WHERE id=$1 AND (status='failed' OR (status='queued' AND updated_at<NOW()-INTERVAL '1 minute') OR (status='processing' AND updated_at<NOW()-INTERVAL '30 minutes')) RETURNING id`,[job.id]);
  if(!claimed.rowCount)return NextResponse.json({error:'Job is already running'},{status:409});
  try {await dispatchVideoJob(job.id);return NextResponse.json({status:'queued'});}
  catch {return NextResponse.json({error:'Could not start processing; retry later'},{status:503});}
}
