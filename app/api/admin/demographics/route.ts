import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDemographics } from '@/lib/db/participant-surveys';
import { checkRateLimit } from '@/lib/ratelimit';
import { MIN_CELL } from '@/lib/analytics/lscvd';
import { PROVINCE_CODES } from '@/lib/onboarding/provinces';
export async function GET(request: NextRequest) {
  const user=await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({error:'Unauthorized'},{status:403});
  const limit=await checkRateLimit(`uid:${user.uid}`,'/api/admin');
  if (!limit.allowed) return NextResponse.json({error:'Too many requests'},{status:429});
  const sessionId=request.nextUrl.searchParams.get('session')??undefined;
  const quizId=request.nextUrl.searchParams.get('quiz')??undefined;
  const province=request.nextUrl.searchParams.get('province')??undefined;
  if ([sessionId,quizId].some(id=>id && !/^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({error:'Invalid scope'},{status:400});
  if (province && !(PROVINCE_CODES as string[]).includes(province)) return NextResponse.json({error:'Invalid scope'},{status:400});
  try {
    const report=await getDemographics({sessionId,quizId,province});
    // A province with few consenting people would make individuals recognisable: send counts only.
    if (province && report.consenting<MIN_CELL) return NextResponse.json({total:report.total,completed:report.completed,consenting:report.consenting,suppressed:true},{headers:{'Cache-Control':'private, no-store'}});
    return NextResponse.json(report,{headers:{'Cache-Control':'private, no-store'}});
  }
  catch { return NextResponse.json({error:'Demographics unavailable'},{status:503}); }
}
