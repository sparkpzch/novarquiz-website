'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch {
      setError('Email not found. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{t('auth.reset_sent')}</h2>
        <p className="text-gray-400 text-sm mb-6">Check your email for a link to reset your password.</p>
        <Link href="/sign-in">
          <Button variant="secondary" className="w-full">
            Back to {t('auth.sign_in')}
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h1 className="text-2xl font-bold text-white mb-1">{t('auth.reset_password')}</h1>
        <p className="text-gray-400 text-sm mb-6">{t('auth.reset_description')}</p>
      </motion.div>

      <form onSubmit={handleReset} className="space-y-4">
        <Input
          label={t('auth.email')}
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          {t('auth.reset_password')}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-400 mt-6">
        Remember your password?{' '}
        <Link href="/sign-in" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          {t('auth.sign_in')}
        </Link>
      </p>
    </>
  );
}
