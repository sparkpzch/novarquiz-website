'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const handleSendCode = async () => {
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setSendingCode(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setCodeSent(true);
    } catch {
      setError('Email not found. Please check and try again.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!codeSent) {
      setError('Please send the code to your email first.');
      return;
    }
    setLoading(true);
    // Simulate verification — in production integrate OTP/code verification
    setTimeout(() => {
      setSent(true);
      setLoading(false);
    }, 800);
  };

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 md:text-white mb-2">Email sent</h2>
        <p className="text-gray-500 md:text-gray-400 text-sm mb-6">Check your email for a link to reset your password.</p>
        <Link href="/sign-in">
          <Button className="w-full">Back to Login</Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <>
      {/* Mobile: back button */}
      <div className="md:hidden flex items-center mb-5">
        <Link
          href="/sign-in"
          className="flex items-center justify-center"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#f0f0f0',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h1 className="font-extrabold text-gray-900 md:text-white mb-2" style={{ fontSize: '26px', lineHeight: 1.2 }}>
          Reset Password
        </h1>
        <p className="text-gray-500 md:text-gray-400 text-sm mb-6" style={{ lineHeight: 1.55 }}>
          Enter the email associated with your account and we&apos;ll send an email with instruction to reset your password.
        </p>
      </motion.div>

      <form onSubmit={handleReset} className="space-y-4">
        {/* Email + Send Code inline */}
        <div>
          <label className="block text-sm font-medium text-gray-700 md:text-gray-300 mb-1.5">
            {t('auth.email')}
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 rounded-xl px-4 py-3 text-sm text-gray-900 md:text-white placeholder-gray-400 md:placeholder-gray-500 border border-gray-200 md:border-white/10 bg-gray-50 md:bg-white/5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || codeSent}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all"
              style={{
                background: codeSent ? '#6b7280' : 'var(--nq-primary)',
                minWidth: '78px',
                opacity: sendingCode ? 0.7 : 1,
              }}
            >
              {sendingCode ? '...' : codeSent ? 'Sent ✓' : 'Send Code'}
            </button>
          </div>
        </div>

        {/* Code field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 md:text-gray-300 mb-1.5">
            Code
          </label>
          <input
            type="text"
            placeholder="1234-567-3123"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm text-gray-900 md:text-white placeholder-gray-400 md:placeholder-gray-500 border border-gray-200 md:border-white/10 bg-gray-50 md:bg-white/5 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Reset Password
        </Button>
      </form>

      {/* Back to Login link */}
      <div className="text-center mt-5">
        <Link
          href="/sign-in"
          className="text-sm font-medium transition-colors"
          style={{ color: '#3b5fd4' }}
        >
          Back to Login
        </Link>
      </div>
    </>
  );
}
