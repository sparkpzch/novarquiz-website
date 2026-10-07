import { z } from 'zod';
import { getQuizById } from '@/lib/db/queries';
import { adminRtdb } from '@/lib/firebase/admin';
import type { SessionUser } from '@/lib/auth';
import { chargeUpload, chargeVideoRetry, UPLOAD_LIMITS, type UploadUsage } from './upload-policy';

const Scope = z.object({ quizId: z.string().uuid().optional(), draftId: z.string().uuid().optional() })
  .refine(value => !!value.quizId !== !!value.draftId);

export class UploadAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

export async function authorizeUpload(user: SessionUser, raw: unknown): Promise<string> {
  const parsed = Scope.safeParse(raw);
  if (!parsed.success) throw new UploadAccessError('Choose the quiz this upload belongs to.', 400);
  if (parsed.data.draftId) {
    if (!user.isAdmin) throw new UploadAccessError('Only admins can upload media for a new draft.');
    return `draft:${parsed.data.draftId}`;
  }
  const quiz = await getQuizById(parsed.data.quizId!);
  if (!quiz || (!user.isAdmin && quiz.created_by !== user.uid)) throw new UploadAccessError('You cannot upload media for this quiz.');
  return `quiz:${quiz.id}`;
}

const quotaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());

export async function reserveUpload(uid: string, id: string, scope: string, size: number, video: boolean) {
  const charged = await adminRtdb.ref(`uploadQuotas/${uid}`).transaction(current => chargeUpload(current, quotaDay(), size, video) ?? undefined);
  if (!charged.committed) throw new UploadAccessError('Upload quota reached. Ask an admin to review your storage allowance.', 429);
  await adminRtdb.ref(`uploadReservations/${id}`).set({uid,scope,size,video,
    storageCharge:size+(video?UPLOAD_LIMITS.videoOutputBytes:0),createdAt:Date.now(),status:'reserved'});
}

export async function readUploadReservation(uid: string, id: string, scope: string) {
  const reservation = (await adminRtdb.ref(`uploadReservations/${id}`).get()).val();
  if (!reservation || reservation.uid !== uid || reservation.scope !== scope || reservation.status === 'released') throw new UploadAccessError('Upload not found. Start the upload again.', 404);
  return reservation as {uid:string;scope:string;size:number;video:boolean;storageCharge:number;status:string};
}

export async function releaseUpload(uid: string, id: string) {
  let refund = 0;
  const released = await adminRtdb.ref(`uploadReservations/${id}`).transaction(current => {
    if (!current) return current;
    if (current.uid !== uid || current.status === 'released') return;
    refund = current.storageCharge;
    return {...current,status:'released'};
  });
  if (released.committed && refund) await adminRtdb.ref(`uploadQuotas/${uid}`).transaction((current:UploadUsage|null) =>
    current ? {...current,storageBytes:Math.max(0,current.storageBytes-refund)} : current);
}

export async function reserveVideoRetry(uid: string) {
  const result = await adminRtdb.ref(`uploadQuotas/${uid}`).transaction(current => chargeVideoRetry(current,quotaDay()) ?? undefined);
  if (!result.committed) throw new UploadAccessError('Daily video processing quota reached.',429);
}

// Reserve the worst-case output before upload, then credit unused capacity
// once processing finishes. A quota-side receipt makes concurrent polls and
// retries after a crash safe; daily reset retains these receipts.
export async function settleVideoStorage(uid: string, id: string, outputBytes?: number) {
  const settled = await adminRtdb.ref(`uploadReservations/${id}`).transaction(current => {
    if (!current) return current;
    if (current.uid !== uid || !current.video || current.status === 'released') return;
    if (current.status === 'settled') return current;
    if (!Number.isSafeInteger(outputBytes) || outputBytes! < 0 || outputBytes! > UPLOAD_LIMITS.videoOutputBytes) return;
    const storageCharge = current.size + outputBytes!;
    return {...current,status:'settled',storageCharge,settlementCredit:Math.max(0,current.storageCharge-storageCharge)};
  });
  const reservation = settled.snapshot.val();
  if (!settled.committed || reservation?.status !== 'settled') return;
  await adminRtdb.ref(`uploadQuotas/${uid}`).transaction((current:UploadUsage|null) => {
    if (!current) return current;
    if (current.settled?.[id]) return;
    return {...current,storageBytes:Math.max(0,current.storageBytes-reservation.settlementCredit),settled:{...current.settled,[id]:true}};
  });
}
