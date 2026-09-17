import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { getUserConsent, upsertUserConsent } from '@/lib/db/queries';
import { checkRateLimit } from '@/lib/ratelimit';
import {
  ANALYTICS_NOTICE_VERSION,
  PRIVACY_VERSION,
  PROFILING_NOTICE_VERSION,
  TOS_VERSION,
} from '@/components/ui/TermsModal';
import { DEFAULT_CONSENT_PURPOSES } from '@/lib/analytics/hcp';

// ---------------------------------------------------------------------------
// Zod schema — enforces unbundled opt-ins (PDPA Phase A requirement).
//
// Rules:
//  • platform_account MUST be true — required to use the platform at all.
//  • analytics_profiling is optional and defaults to false.
//  • marketing_follow_up is optional and defaults to false (strict opt-in).
//  • hcp_vectors_acknowledged is optional; must be true when submitting HCP
//    session consent that covers clinical profiling vectors:
//      Guideline Adherence, Innovation Adoption, Patient Centricity,
//      Diagnostic Proactivity, Therapy Escalation, Evidence Depth.
//
// M2 FIX: consent_purposes is REQUIRED — callers must send it explicitly.
// An absent body is rejected with 400 so consent cannot be silently recorded
// on the user's behalf without an affirmative client action (PDPA requirement).
// ---------------------------------------------------------------------------
const ConsentPurposesSchema = z.object({
  platform_account: z.literal(true, {
    error: 'platform_account must be accepted to use the platform',
  }),
  analytics_profiling: z.boolean().optional().default(false),
  marketing_follow_up: z.boolean().optional().default(false),
  hcp_vectors_acknowledged: z.boolean().optional().default(false),
});

const ConsentBodySchema = z.object({
  consent_purposes: ConsentPurposesSchema,
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // L1 FIX: Rate-limit consent changes keyed on uid — consent writes are
  // low-frequency by design; 10/min matches the session endpoint limit.
  const { allowed, retryAfter } = await checkRateLimit(
    `uid:${user.uid}`,
    '/api/auth/consent',
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // IP is personal data under PDPA but required for legal proof of consent.
  // Stored only in this consent record, not propagated elsewhere.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  const rawBody = await request.json().catch(() => ({}));
  const parsed = ConsentBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    // M1 FIX: Log validation detail server-side only — do not echo Zod issue
    // objects to the client (they contain field paths and received values).
    console.error('Consent schema validation failed for uid:', user.uid, parsed.error.issues);
    return NextResponse.json({ error: 'Invalid consent payload' }, { status: 400 });
  }

  const { consent_purposes: purposes } = parsed.data;

  const consentPurposes = {
    platform_account: purposes.platform_account,
    analytics_profiling: purposes.analytics_profiling,
    // Strict opt-in: marketing is never enabled by default.
    marketing_follow_up: purposes.marketing_follow_up,
    // HCP clinical vector acknowledgement — stored even if false so the
    // absence is auditable.
    hcp_vectors_acknowledged: purposes.hcp_vectors_acknowledged,
  };

  try {
    await upsertUserConsent({
      uid: user.uid,
      tos_version: TOS_VERSION,
      privacy_version: PRIVACY_VERSION,
      analytics_notice_version: ANALYTICS_NOTICE_VERSION,
      profiling_notice_version: PROFILING_NOTICE_VERSION,
      consent_purposes: consentPurposes,
      ip_address: ip,
      user_agent: userAgent,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to record consent:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ consented: false });
  }

  try {
    const data = await getUserConsent(user.uid);
    if (!data) return NextResponse.json({ consented: false });

    return NextResponse.json({
      consented: true,
      tos_version: data.tos_version,
      privacy_version: data.privacy_version,
      analytics_notice_version: data.analytics_notice_version,
      profiling_notice_version: data.profiling_notice_version,
      consent_purposes: { ...DEFAULT_CONSENT_PURPOSES, ...data.consent_purposes },
    });
  } catch (err) {
    // Report failure as an error, not as "not consented", so a storage outage
    // doesn't lock every user behind the consent prompt.
    console.error('Failed to check consent:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Failed to check consent' }, { status: 500 });
  }
}
