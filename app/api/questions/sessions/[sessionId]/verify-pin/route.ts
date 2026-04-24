import { NextResponse } from 'next/server';

// PIN verification via database is removed. Private sessions now use
// Firebase RTDB team rooms (joinTeamRoom) which handle PIN checks.
export async function POST() {
  return NextResponse.json({ error: 'PIN verification is no longer supported via this endpoint' }, { status: 410 });
}
