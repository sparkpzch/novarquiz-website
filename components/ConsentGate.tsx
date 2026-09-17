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

/**
 * Blocks signed-in users who have never consented, or who consented to an
 * older Terms/Privacy version, until they accept the current documents.
 * Declining signs them out. Optional purposes keep their stored values.
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
    if (!uid || exempt || checkedUid === uid) return;
    let cancelled = false;
    fetch('/api/auth/consent')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: UserConsentProfile | null) => {
        if (cancelled || !data) return;
        setCheckedUid(uid);
        const upToDate =
          data.consented &&
          data.tos_version === TOS_VERSION &&
          data.privacy_version === PRIVACY_VERSION;
        setPending(upToDate ? null : data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, exempt, checkedUid]);

  if (!uid || exempt || !pending) return null;

  // GET merges defaults into consent_purposes, so only trust optional
  // purposes from an existing consent record, and profiling only when both
  // opt-ins are set.
  const stored = pending.consented ? pending.consent_purposes : undefined;
  const profiling = stored?.analytics_profiling === true && stored?.hcp_vectors_acknowledged === true;

  const handleAccept = async () => {
    try {
      const response = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_purposes: {
            platform_account: true,
            analytics_profiling: profiling,
            hcp_vectors_acknowledged: profiling,
            marketing_follow_up: stored?.marketing_follow_up === true,
          },
        }),
      });
      if (!response.ok) throw new Error('Consent update failed');
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
