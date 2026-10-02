import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDemographics } from '@/lib/db/participant-surveys';
import { checkRateLimit } from '@/lib/ratelimit';
export async function GET(request: NextRequest) {
  const user=await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({error:'Unauthorized'},{status:403});
  const limit=await checkRateLimit(`uid:${user.uid}`,'/api/admin');
  if (!limit.allowed) return NextResponse.json({error:'Too many requests'},{status:429});
  const sessionId=request.nextUrl.searchParams.get('session')??undefined;
  const quizId=request.nextUrl.searchParams.get('quiz')??undefined;
  if ([sessionId,quizId].some(id=>id && !/^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({error:'Invalid scope'},{status:400});
  try { return NextResponse.json(await getDemographics({sessionId,quizId}),{headers:{'Cache-Control':'private, no-store'}}); }
  catch { return NextResponse.json({error:'Demographics unavailable'},{status:503}); }
}
