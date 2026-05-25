'use client';

import { useState, Suspense } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TermsModal from '@/components/ui/TermsModal';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';

function SignInForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Holds the pending ID token for new Google OAuth users until they accept ToS
  const [consentPending, setConsentPending] = useState<string | null>(null);

  const safeNextUrl =
    nextUrl && /^\/(?!\/)/.test(nextUrl) ? nextUrl : '/';

  const createSession = async (idToken: string) => {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, rememberMe }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Session creation failed');
    router.push(safeNextUrl);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await credential.user.getIdToken();
      await createSession(idToken);
    } catch (err) {
      console.error('Email sign-in failed:', err);
      const code = (err as { code?: string }).code;
      const msgs: Record<string, string> = {
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
        'auth/user-disabled': 'This account has been suspended.',
        'auth/network-request-failed': 'Connection failed. Check your internet and try again.',
        'auth/invalid-email': 'Please enter a valid email address.',
      };
      setError(msgs[code ?? ''] ?? `Sign in failed${code ? ` (${code})` : ''}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleConsentAccepted = async () => {
    if (!consentPending) return;
    setConsentPending(null);
    setLoading(true);
    try {
      await createSession(consentPending);
      await fetch('/api/auth/consent', { method: 'POST' });
    } catch (err) {
      setError('Sign in failed after consent. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      const idToken = await credential.user.getIdToken();
      // New Google OAuth users must accept ToS + PDPA before session is created
      if (getAdditionalUserInfo(credential)?.isNewUser) {
        setConsentPending(idToken);
        setLoading(false);
        return;
      }
      await createSession(idToken);
    } catch (err) {
      console.error('Google sign-in failed:', err);
      const code = (err as { code?: string }).code;
      const msgs: Record<string, string> = {
        'auth/popup-blocked': 'Popup was blocked — please allow popups for this site.',
        'auth/popup-closed-by-user': 'Sign-in was cancelled.',
        'auth/cancelled-popup-request': 'Sign-in was cancelled.',
        'auth/network-request-failed': 'Connection failed. Check your internet and try again.',
        'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
        'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in. Please contact support.',
        'auth/operation-not-allowed': 'Google sign-in is not enabled. Please contact support.',
        'auth/internal-error': 'Google sign-in had an internal error. Please try again.',
      };
      setError(msgs[code ?? ''] ?? `Google sign-in failed${code ? ` (${code})` : ''}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>


      <form onSubmit={handleSignIn} className="space-y-3">
        <Input
          label={t('auth.email')}
          type="email"
          placeholder="Example@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label={t('auth.password')}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {/* Remember me + Forgot password row */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setRememberMe(!rememberMe)}
              className="flex-shrink-0 flex items-center justify-center cursor-pointer"
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: `2px solid ${rememberMe ? '#3b5fd4' : '#d1d5db'}`,
                background: rememberMe ? '#3b5fd4' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              {rememberMe && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm text-gray-600">Remember me</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium transition-colors"
            style={{ color: '#3b5fd4' }}
          >
            Forgot password ?
          </Link>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-red-50 border border-red-200 p-3"
          >
            <p className="text-sm text-red-500">{error}</p>
          </motion.div>
        )}

        <Button type="submit" loading={loading} className="w-full" style={{ marginTop: '4px' }}>
          Login
        </Button>
      </form>

      {/* Or divider — all screens */}
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="nq-auth-divider-bg px-4 text-gray-400">Or</span>
        </div>
      </div>

      {/* Google sign-in — all screens */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="nq-auth-google-btn w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 transition-all py-2.5 text-sm font-medium text-gray-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ minHeight: '44px' }}
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      {/* Continue as a guest (mobile)
      <div className="md:hidden text-center mt-4">
        <button
          onClick={() => router.push('/')}
          className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700 transition-colors"
        >
          Continue as a guest
        </button>
      </div> */}


      {/* Desktop: sign-up link */}
      <p className="hidden md:block text-center text-sm text-gray-500 mt-6">
        {t('auth.no_account')}{' '}
        <Link href="/sign-up" className="font-medium transition-colors" style={{ color: '#3b5fd4' }}>
          {t('auth.sign_up')}
        </Link>
      </p>

      {/* PDPA consent gate for new Google OAuth users */}
      {consentPending && (
        <TermsModal
          onClose={() => {
            setConsentPending(null);
            setError('You must accept the Terms of Service to continue.');
          }}
          onAccept={handleConsentAccepted}
        />
      )}
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
