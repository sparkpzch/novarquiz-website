import { randomUUID } from 'node:crypto';
import pool, { type IDbClient } from '../db/postgres';
import { adminStorage } from '../firebase/admin';
export type VideoJob = { id: string; owner_uid: string; source_path: string; source_generation: string; status: 'queued'|'processing'|'ready'|'failed'; output_path: string|null; duration_seconds: number|null; error: string|null; updated_at: string };
export async function createVideoJob(owner: string, path: string, generation: string, id: string = randomUUID()) {
  const result = await pool.query<VideoJob>(`INSERT INTO video_processing_jobs(id,owner_uid,source_path,source_generation) VALUES ($1,$2,$3,$4)
    ON CONFLICT(source_path,source_generation) DO UPDATE SET source_path=EXCLUDED.source_path RETURNING *`,[id,owner,path,generation]);
  return result.rows[0];
}
export async function getVideoJob(id: string) {
  const result=await pool.query<VideoJob>('SELECT * FROM video_processing_jobs WHERE id=$1',[id]);
  return result.rows[0]??null;
}
export async function dispatchVideoJob(id: string) {
  const job = process.env.VIDEO_PROCESSING_JOB;
  if (!job || !/^projects\/[^/]+\/locations\/[^/]+\/jobs\/[^/]+$/.test(job)) throw new Error('Video processing is not configured');
  const token=await adminStorage.app.options.credential!.getAccessToken();
  const response=await fetch(`https://run.googleapis.com/v2/${job}:run`,{method:'POST',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({overrides:{containerOverrides:[{env:[{name:'VIDEO_JOB_ID',value:id}]}]}}),signal:AbortSignal.timeout(20_000)});
  if(!response.ok) throw new Error('Could not start video processing');
}
export function videoJobResult(job: VideoJob) {
  const prefix=job.output_path?.replace(/master\.m3u8$/,'');
  const bucket=process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const url=(path:string)=>`https://storage.googleapis.com/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return {id:job.id,status:job.status,error:job.status==='failed'?'Video could not be prepared. Please retry.':null,
    path:job.output_path??job.source_path,url:job.output_path?url(job.output_path)+(job.duration_seconds ? `#duration=${job.duration_seconds}` : ''):null,
    mp4_url:prefix?url(prefix+'fallback.mp4'):null,poster_url:prefix?url(prefix+'poster.jpg'):null};
}

/** Resolve stale editor source paths before saving. Call inside the graph transaction. */
export class UnpreparedVideoError extends Error { constructor() { super('Save as a draft and wait until all videos are ready before publishing.'); } }
export async function resolveProcessedVideos<T extends { media_type?: string | null; media_path?: string | null; media_url?: string | null }>(questions: T[], client: Pick<IDbClient, 'query'> = pool, requireReady = false): Promise<T[]> {
  const paths = questions.filter(q => q.media_type === 'video' && q.media_path).map(q => q.media_path!);
  if (!paths.length) return questions;
  const { rows } = await client.query<VideoJob>('SELECT * FROM video_processing_jobs WHERE source_path=ANY($1::text[]) FOR SHARE', [paths]);
  const jobs = new Map(rows.map(job => [job.source_path, job]));
  if (requireReady && rows.some(job => job.status !== 'ready')) throw new UnpreparedVideoError();
  return questions.map(question => {
    const job = jobs.get(question.media_path ?? '');
    if (question.media_type !== 'video' || job?.status !== 'ready') return question;
    const output = videoJobResult(job);
    return { ...question, media_path: output.path, media_url: output.url };
  });
}
export async function hasUnpreparedVideos(quizId: string) {
  const result = await pool.query(`SELECT 1 FROM questions q JOIN video_processing_jobs j ON j.source_path=q.media_path
    WHERE q.session_id=$1 AND q.media_type='video' AND j.status<>'ready' LIMIT 1`, [quizId]);
  return !!result.rowCount;
}
