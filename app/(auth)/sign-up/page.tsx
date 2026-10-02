'use client';

import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TermsModal from '@/components/ui/TermsModal';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import SurveyFields, { emptySurvey } from '@/components/onboarding/SurveyFields';
import { SurveySchema } from '@/lib/onboarding/survey';

export default function SignUpPage() {
  const { t, i18n } = useTranslation();
  const [survey, setSurvey] = useState(emptySurvey);
  const [step, setStep] = useState<'survey' | 'account'>('survey');
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showTermsTab, setShowTermsTab] = useState<'terms' | 'privacy'>('terms');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (step === 'survey') {
      if (!SurveySchema.safeParse(survey).success) { setError(i18n.language.startsWith('th') ? 'กรุณาตรวจสอบข้อมูลแบบสอบถาม' : 'Please check your questionnaire answers.'); return; }
      setStep('account');
      return;
    }

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
    if (!SurveySchema.safeParse(survey).success) { setError(i18n.language.startsWith('th') ? 'กรุณาตรวจสอบข้อมูลแบบสอบถาม' : 'Please check your questionnaire answers.'); return; }
    setLoading(true);
    try {
      const account = createdUser ?? (await createUserWithEmailAndPassword(auth, email, password)).user;
      setCreatedUser(account);
      await updateProfile(account, { displayName: `${survey.firstName.trim()} ${survey.lastName.trim()}` });
      await sendEmailVerification(account);
      const idToken = await account.getIdToken(true);
      const saved = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify(survey) });
      if (!saved.ok) throw new Error('survey-save-failed');
      setVerified(true);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (err instanceof Error && err.message === 'survey-save-failed') {
        setError(i18n.language.startsWith('th') ? 'สร้างบัญชีแล้ว แต่ยังบันทึกแบบสอบถามไม่ได้ กดลองอีกครั้งเพื่อบันทึกข้อมูล' : 'Your account was created, but the questionnaire could not save. Submit again to retry.');
      } else if (firebaseError.code === 'auth/email-already-in-use') {
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
        <p className="text-sm font-semibold">{i18n.language.startsWith('th') ? (step === 'survey' ? 'ขั้นตอน 1 จาก 2 · ข้อมูลของคุณ' : 'ขั้นตอน 2 จาก 2 · สร้างบัญชี') : (step === 'survey' ? 'Step 1 of 2 · Profile information' : 'Step 2 of 2 · Create your account')}</p>
        {step === 'survey' ? <SurveyFields value={survey} onChange={setSurvey} th={i18n.language.startsWith('th')} /> : <>
        <Input
          label={t('auth.email')}
          type="email"
          placeholder="Example@gmail.com"
          value={email}
          disabled={!!createdUser}
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

        </>}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          {i18n.language.startsWith('th') ? (step === 'survey' ? 'ไปต่อ' : 'สร้างบัญชี') : (step === 'survey' ? 'Continue' : 'Sign Up')}
        </Button>
        {step === 'account' && <button type="button" className="w-full py-2 text-sm underline underline-offset-4" disabled={loading} onClick={() => { setStep('survey'); setError(''); }}>{i18n.language.startsWith('th') ? 'กลับไปแก้ไขข้อมูล' : 'Back to questionnaire'}</button>}
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
