'use client';

import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TermsModal from '@/components/ui/TermsModal';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';

export default function SignUpPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeProfiling, setAgreeProfiling] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showTermsTab, setShowTermsTab] = useState<'terms' | 'privacy'>('terms');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setError('You must agree to the Terms of Service.');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: email.split('@')[0] });
      await sendEmailVerification(userCredential.user);
      const idToken = await userCredential.user.getIdToken();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      await fetch('/api/auth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_purposes: {
            platform_account: true,
            analytics_profiling: agreeProfiling,
            hcp_vectors_acknowledged: agreeProfiling,
          },
        }),
      });
      setVerified(true);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError('Sign up failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (verified) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 py-4">
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 md:text-white">Check your email</h1>
        <p className="text-gray-500 md:text-gray-400 text-sm">
          We sent a verification link to <span className="font-medium text-gray-800 md:text-white">{email}</span>. Click it to activate your account, then sign in.
        </p>
        <Button className="w-full mt-2" onClick={() => router.push('/sign-in')}>Go to Login</Button>
      </motion.div>
    );
  }

  return (
    <>


      <form onSubmit={handleSignUp} className="space-y-4">
        <Input
          label={t('auth.email')}
          type="email"
          placeholder="Example@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div>
          <Input
            label={t('auth.password')}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-gray-400" style={{ fontSize: '11px' }}>Must be at least 8 characters.</p>
        </div>

        <Input
          label={t('auth.confirm_password')}
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        {/* Terms of Service checkbox — clicking when unchecked opens modal first */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <div
            role="checkbox"
            aria-checked={agreeTerms}
            tabIndex={0}
            onClick={() => {
              if (agreeTerms) { setAgreeTerms(false); return; }
              setShowTermsTab('terms');
              setShowTerms(true);
            }}
            onKeyDown={(e) => {
              if (e.key !== ' ') return;
              if (agreeTerms) { setAgreeTerms(false); return; }
              setShowTermsTab('terms');
              setShowTerms(true);
            }}
            className="flex-shrink-0 flex items-center justify-center cursor-pointer mt-0.5"
            style={{
              width: '17px',
              height: '17px',
              borderRadius: '4px',
              border: `1.5px solid ${agreeTerms ? '#3b5fd4' : '#d1d5db'}`,
              background: agreeTerms ? '#3b5fd4' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            {agreeTerms && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm text-gray-600 md:text-gray-400">
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowTermsTab('terms'); setShowTerms(true); }}
              className="font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: '#3b5fd4' }}
            >
              Terms of Service
            </button>
            {' '}and{' '}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowTermsTab('privacy'); setShowTerms(true); }}
              className="font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: '#3b5fd4' }}
            >
              Privacy Policy
            </button>
          </span>
        </label>

        {/* Optional, unbundled opt-in for analytics & HCP clinical profiling */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreeProfiling}
            onChange={(e) => setAgreeProfiling(e.target.checked)}
            className="mt-0.5 h-[17px] w-[17px] flex-shrink-0 cursor-pointer accent-[#3b5fd4]"
          />
          <span className="text-sm text-gray-600 md:text-gray-400">
            (Optional) I consent to Analytics &amp; Profiling, including clinical profiling vectors
            calculated from my answers in HCP quizzes. You can change this later in Profile.
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Sign Up
        </Button>
      </form>

      {/* Desktop: sign-in link */}
      <p className="hidden md:block text-center text-sm text-gray-400 mt-6">
        {t('auth.have_account')}{' '}
        <a href="/sign-in" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          {t('auth.sign_in')}
        </a>
      </p>

      {showTerms && (
        <TermsModal
          initialTab={showTermsTab}
          onClose={() => setShowTerms(false)}
          onAccept={() => {
            setAgreeTerms(true);
            setShowTerms(false);
          }}
        />
      )}
    </>
  );
}
