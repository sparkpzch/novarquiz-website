import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getSessionUser } from '@/lib/auth';
import { adminDb } from '@/lib/firebase/admin';
import {
  ANALYTICS_NOTICE_VERSION,
  PRIVACY_VERSION,
  PROFILING_NOTICE_VERSION,
  TOS_VERSION,
} from '@/components/ui/TermsModal';
import { DEFAULT_CONSENT_PURPOSES } from '@/lib/analytics/hcp';

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
  const body = await request.json().catch(() => ({}));
  const consentPurposes = {
    platform_account: body?.consent_purposes?.platform_account !== false,
    analytics_profiling: body?.consent_purposes?.analytics_profiling !== false,
    crm_linkage: body?.consent_purposes?.crm_linkage === true,
    marketing_follow_up: body?.consent_purposes?.marketing_follow_up === true,
  };

  try {
    const consentRef = adminDb.collection('userConsents').doc(user.uid);
    await consentRef.set(
      {
        uid: user.uid,
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
        analytics_notice_version: ANALYTICS_NOTICE_VERSION,
        profiling_notice_version: PROFILING_NOTICE_VERSION,
        pdpa_consent: true,
        consent_purposes: consentPurposes,
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
      analytics_notice_version: data?.analytics_notice_version ?? null,
      profiling_notice_version: data?.profiling_notice_version ?? null,
      consent_purposes:
        data?.consent_purposes && typeof data.consent_purposes === 'object'
          ? {
              ...DEFAULT_CONSENT_PURPOSES,
              ...data.consent_purposes,
            }
          : DEFAULT_CONSENT_PURPOSES,
    });
  } catch (err) {
    console.error('Failed to check consent:', err);
    return NextResponse.json({ consented: false });
  }
}
