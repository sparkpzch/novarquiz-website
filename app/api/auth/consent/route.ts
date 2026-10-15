import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, getVerifiedFirebaseIdentity } from '@/lib/auth';
import { surveyIdentity } from '@/lib/onboarding/identity';
import { getUserConsent, upsertUserConsent } from '@/lib/db/queries';
import { checkRateLimit } from '@/lib/ratelimit';
import { PRIVACY_VERSION, TOS_VERSION } from '@/lib/privacy/versions';
import { DEFAULT_CONSENT_PURPOSES } from '@/lib/analytics/quiz-metadata';

// ---------------------------------------------------------------------------
// Zod schema — enforces unbundled opt-ins (PDPA Phase A requirement).
//
// Rules:
//  • platform_account MUST be true — required to use the platform at all.
//  • marketing_follow_up is optional and defaults to false (strict opt-in).
//
// M2 FIX: consent_purposes is REQUIRED — callers must send it explicitly.
// An absent body is rejected with 400 so consent cannot be silently recorded
// on the user's behalf without an affirmative client action (PDPA requirement).
// ---------------------------------------------------------------------------
const ConsentPurposesSchema = z.object({
  platform_account: z.literal(true, {
    error: 'platform_account must be accepted to use the platform',
  }),
  marketing_follow_up: z.boolean().optional().default(false),
});

const ConsentBodySchema = z.object({
  consent_purposes: ConsentPurposesSchema,
});

export async function POST(request: NextRequest) {
  // Sign-up records consent with the new account's ID token, before any
  // session cookie exists; everyone else uses the session cookie.
  const uid = await surveyIdentity(request.headers.get('authorization'), {
    session: getSessionUser,
    verify: getVerifiedFirebaseIdentity,
  });
  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // L1 FIX: Rate-limit consent changes keyed on uid — consent writes are
  // low-frequency by design; 10/min matches the session endpoint limit.
  const { allowed, retryAfter } = await checkRateLimit(
    `uid:${uid}`,
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
    console.error('Consent schema validation failed for uid:', uid, parsed.error.issues);
    return NextResponse.json({ error: 'Invalid consent payload' }, { status: 400 });
  }

  const { consent_purposes: purposes } = parsed.data;

  const consentPurposes = {
    platform_account: purposes.platform_account,
    // Strict opt-in: marketing is never enabled by default.
    marketing_follow_up: purposes.marketing_follow_up,
  };

  try {
    await upsertUserConsent({
      uid,
      tos_version: TOS_VERSION,
      privacy_version: PRIVACY_VERSION,
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
      consent_purposes: { ...DEFAULT_CONSENT_PURPOSES, ...data.consent_purposes },
    });
  } catch (err) {
    // Report failure as an error, not as "not consented", so a storage outage
    // doesn't lock every user behind the consent prompt.
    console.error('Failed to check consent:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Failed to check consent' }, { status: 500 });
  }
}
