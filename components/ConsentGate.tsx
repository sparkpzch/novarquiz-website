'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/lib/hooks/useAuth';
import TermsModal, { PRIVACY_VERSION, TOS_VERSION } from '@/components/ui/TermsModal';
import { useToast } from '@/components/ui/Toast';
import type { UserConsentProfile } from '@/lib/types';

// Pages a signed-in user can still reach without re-accepting.
const EXEMPT_PATHS = ['/sign-in', '/sign-up', '/privacy', '/terms'];

// Remembers that this uid already accepted the current documents, so a page
// refresh doesn't re-check and re-open the modal.
const ACCEPTED_VALUE = `${TOS_VERSION}|${PRIVACY_VERSION}`;
const acceptedKey = (uid: string) => `nq_consent_${uid}`;

function hasAcceptedLocally(uid: string) {
  try {
    return localStorage.getItem(acceptedKey(uid)) === ACCEPTED_VALUE;
  } catch {
    return false;
  }
}

function markAcceptedLocally(uid: string) {
  try {
    localStorage.setItem(acceptedKey(uid), ACCEPTED_VALUE);
  } catch {}
}

/**
 * Blocks signed-in users who have never consented, or who consented to an
 * older Terms/Privacy version, until they accept the current documents.
 * Declining signs them out.
 */
export default function ConsentGate() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { showToast } = useToast();
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  const [pending, setPending] = useState<UserConsentProfile | null>(null);

  const exempt = EXEMPT_PATHS.some((path) => pathname?.startsWith(path));
  const uid = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!uid || exempt || checkedUid === uid || hasAcceptedLocally(uid)) return;
    let cancelled = false;
    fetch('/api/auth/consent', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: UserConsentProfile | null) => {
        if (cancelled || !data) return;
        setCheckedUid(uid);
        const upToDate =
          data.consented &&
          data.tos_version === TOS_VERSION &&
          data.privacy_version === PRIVACY_VERSION;
        if (upToDate) markAcceptedLocally(uid);
        setPending(upToDate ? null : data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, exempt, checkedUid]);

  if (!uid || exempt || !pending) return null;

  // Preserve a previously saved marketing choice when re-accepting documents.
  const stored = pending.consented ? pending.consent_purposes : undefined;

  const handleAccept = async () => {
    try {
      const response = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_purposes: {
            platform_account: true,
            marketing_follow_up: stored?.marketing_follow_up === true,
          },
        }),
      });
      if (!response.ok) throw new Error('Consent update failed');
      markAcceptedLocally(uid);
      setPending(null);
    } catch {
      showToast('Failed to save consent. Please try again.', 'error');
    }
  };

  const handleDecline = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    await signOut(auth).catch(() => {});
    window.location.href = '/sign-in';
  };

  return <TermsModal onClose={handleDecline} onAccept={handleAccept} />;
}
