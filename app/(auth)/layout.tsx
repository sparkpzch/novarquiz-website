'use client';

import { ReactNode, Suspense } from 'react';
import { useAuthReturnPath } from '@/lib/hooks/useAuthReturnPath';
import { authHref } from '@/lib/security/auth-return';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthTranslation } from '@/lib/hooks/useAuthTranslation';
import { useTheme } from '@/lib/hooks/useTheme';
import '@/lib/i18n';

const AUTH_TABS = [
  { label: 'auth.sign_in', href: '/sign-in' },
  { label: 'auth.sign_up', href: '/sign-up' },
];

function AuthTabs({ pathname }: { pathname: string }) {
  const returnPath = useAuthReturnPath();
  const { t } = useAuthTranslation();
  return <LayoutGroup id="auth-tabs"><nav className="nq-auth-tabs relative mb-5 flex" aria-label={t('auth.account_access')}>
    {AUTH_TABS.map(tab => <Link key={tab.href} href={authHref(tab.href, returnPath)} aria-current={pathname === tab.href ? 'page' : undefined} className="nq-auth-tab relative flex-1 text-center">
      {pathname === tab.href && <motion.span layoutId="auth-tab-pill" className="nq-auth-tab-pill absolute inset-0" aria-hidden="true" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <span className="relative z-10">{t(tab.label)}</span>
    </Link>)}
  </nav></LayoutGroup>;
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t, i18n, language } = useAuthTranslation();
  const { theme, toggleTheme } = useTheme();
  const isThai = language.startsWith('th');
  const selectLanguage = async (language: 'th' | 'en') => {
    await i18n.changeLanguage(language);
    try { localStorage.setItem('novarquiz-language', language); } catch {}
  };
  const isTabPage = pathname === '/sign-in' || pathname === '/sign-up';

  return (
    <MotionConfig reducedMotion="user">
      {/* One responsive tree keeps form state and layout measurements stable. */}
      <div className="nq-auth-shell flex min-h-dvh flex-col">
        <header className="nq-auth-header relative shrink-0 overflow-hidden">
          <div className="nq-auth-controls absolute right-5 top-5 z-10 flex items-center gap-2">
            <div className="nq-auth-language flex" role="group" aria-label={t('profile.language')}>
              {(['th', 'en'] as const).map(language => (
                <button key={language} type="button" lang={language}
                  aria-label={t(language === 'th' ? 'language.thai' : 'language.english')}
                  aria-pressed={language === 'th' ? isThai : !isThai}
                  onClick={() => void selectLanguage(language)}>
                  {language.toUpperCase()}
                </button>
              ))}
            </div>
            <button type="button" className="nq-auth-theme" onClick={toggleTheme}
              aria-label={t(theme === 'dark' ? 'profile.light_mode' : 'profile.dark_mode')}
              title={t(theme === 'dark' ? 'profile.light_mode' : 'profile.dark_mode')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></> : <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z" />}
              </svg>
            </button>
          </div>
          <div className="nq-auth-welcome relative z-10 mx-auto w-full max-w-md">
            <p className="font-semibold">{t('auth.health_quizzes')}</p>
            <div className="flex items-baseline gap-1.5">

              <span className="nq-auth-brand font-extrabold tracking-tight">NovarQuiz</span>
            </div>
          </div>
        </header>

        <main className="nq-auth-card relative z-10 flex-1">
          <div className="nq-auth-content mx-auto w-full max-w-md">
            {isTabPage && (
              <Suspense><AuthTabs pathname={pathname} /></Suspense>
            )}

            {children}
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
