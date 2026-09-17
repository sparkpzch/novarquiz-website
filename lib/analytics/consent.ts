import { adminDb } from '@/lib/firebase/admin';

// Server-only. Clinical profiling vectors are computed only for users who have
// explicitly opted in to both Analytics & Profiling and the HCP vectors.
// Reads the stored record directly (no defaults), so a missing or failed read
// means no consent.
export async function hasProfilingConsent(uid: string): Promise<boolean> {
  try {
    const doc = await adminDb.collection('userConsents').doc(uid).get();
    const purposes = doc.data()?.consent_purposes;
    return purposes?.analytics_profiling === true && purposes?.hcp_vectors_acknowledged === true;
  } catch (err) {
    console.error('Failed to read profiling consent:', err instanceof Error ? err.message : 'unknown');
    return false;
  }
}
