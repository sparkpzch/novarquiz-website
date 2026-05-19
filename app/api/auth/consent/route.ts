import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getSessionUser } from '@/lib/auth';
import { adminDb } from '@/lib/firebase/admin';
import { TOS_VERSION, PRIVACY_VERSION } from '@/components/ui/TermsModal';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // IP is personal data under PDPA but required for legal proof of consent.
  // Stored only in this consent record, not propagated elsewhere.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  try {
    const consentRef = adminDb.collection('userConsents').doc(user.uid);
    await consentRef.set(
      {
        uid: user.uid,
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
        pdpa_consent: true,
        consented_at: FieldValue.serverTimestamp(),
        ip_address: ip,
        user_agent: userAgent,
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to record consent:', err);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ consented: false });
  }

  try {
    const doc = await adminDb.collection('userConsents').doc(user.uid).get();
    if (!doc.exists) return NextResponse.json({ consented: false });

    const data = doc.data();
    return NextResponse.json({
      consented: data?.pdpa_consent === true,
      tos_version: data?.tos_version ?? null,
      privacy_version: data?.privacy_version ?? null,
    });
  } catch (err) {
    console.error('Failed to check consent:', err);
    return NextResponse.json({ consented: false });
  }
}
