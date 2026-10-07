import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getVerifiedFirebaseIdentity } from '@/lib/auth';
import { adminAuth } from '@/lib/firebase/admin';
import { checkRateLimit } from '@/lib/ratelimit';
import { getParticipantSurvey, saveParticipantSurvey } from '@/lib/db/participant-surveys';
import { surveyIdentity } from '@/lib/onboarding/identity';
import { SurveySchema, SURVEY_VERSION } from '@/lib/onboarding/survey';

async function identity(request: NextRequest) {
  return surveyIdentity(request.headers.get('authorization'), {
    session: getSessionUser,
    verify: getVerifiedFirebaseIdentity,
  });
}
export async function GET(request: NextRequest) {
  const uid = await identity(request);
  if (!uid) return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const survey=await getParticipantSurvey(uid);
    return NextResponse.json({survey,required:survey?.version!==SURVEY_VERSION},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'Survey unavailable'},{status:503}); }
}
export async function POST(request: NextRequest) {
  const uid=await identity(request);
  if (!uid) return NextResponse.json({error:'Unauthorized'},{status:401});
  const limit=await checkRateLimit(`uid:${uid}`,'/api/auth/consent');
  if (!limit.allowed) return NextResponse.json({error:'Too many requests'},{status:429});
  const parsed=SurveySchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:'Please check the survey fields'},{status:400});
  try {
    await adminAuth.updateUser(uid,{displayName:`${parsed.data.firstName} ${parsed.data.lastName}`});
    await saveParticipantSurvey(uid,parsed.data);
    return NextResponse.json({success:true});
  } catch { return NextResponse.json({error:'Could not save your profile. Please try again.'},{status:503}); }
}
