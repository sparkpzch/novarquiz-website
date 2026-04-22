'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';

export default function SignInPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const createSession = async (idToken: string) => {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Session creation failed');
    router.push(data.isAdmin ? '/admin' : '/');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();
      await createSession(idToken);
    } catch (err) {
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
      setError(msgs[code ?? ''] ?? 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      const idToken = await credential.user.getIdToken();
      await createSession(idToken);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const msgs: Record<string, string> = {
        'auth/popup-blocked': 'Popup was blocked — please allow popups for this site.',
        'auth/popup-closed-by-user': 'Sign-in was cancelled.',
        'auth/cancelled-popup-request': 'Sign-in was cancelled.',
        'auth/network-request-failed': 'Connection failed. Check your internet and try again.',
        'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
      };
      setError(msgs[code ?? ''] ?? 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h1 className="text-2xl font-bold text-white mb-1">{t('auth.sign_in')}</h1>
        <p className="text-gray-400 text-sm mb-6">Welcome back! Please enter your details.</p>
      </motion.div>

      <form onSubmit={handleSignIn} className="space-y-4">
        <Input
          label={t('auth.email')}
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
            </svg>
          }
        />

        <Input
          label={t('auth.password')}
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            {t('auth.forgot_password')}
          </Link>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-red-500/10 border border-red-500/20 p-3"
          >
            <p className="text-sm text-red-400">{error}</p>
          </motion.div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          {t('auth.sign_in')}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-transparent px-4 text-gray-500">{t('auth.or_continue')}</span>
        </div>
      </div>

      <Button variant="secondary" onClick={handleGoogleSignIn} className="w-full" icon={
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      }>
        {t('auth.google')}
      </Button>

      <p className="text-center text-sm text-gray-400 mt-6">
        {t('auth.no_account')}{' '}
        <Link href="/sign-up" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          {t('auth.sign_up')}
        </Link>
      </p>
    </>
  );
}
