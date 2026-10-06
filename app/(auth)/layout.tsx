'use client';

import { ReactNode, Suspense } from 'react';
import { useAuthReturnPath } from '@/lib/hooks/useAuthReturnPath';
import { authHref } from '@/lib/security/auth-return';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const AUTH_TABS = [
  { label: 'Sign in', href: '/sign-in' },
  { label: 'Create account', href: '/sign-up' },
];

function AuthTabs({ pathname }: { pathname: string }) {
  const returnPath = useAuthReturnPath();
  return <LayoutGroup id="auth-tabs"><nav className="nq-auth-tabs relative mb-5 flex" aria-label="Account access">
    {AUTH_TABS.map(tab => <Link key={tab.href} href={authHref(tab.href, returnPath)} aria-current={pathname === tab.href ? 'page' : undefined} className="nq-auth-tab relative flex-1 text-center">
      {pathname === tab.href && <motion.span layoutId="auth-tab-pill" className="nq-auth-tab-pill absolute inset-0" aria-hidden="true" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <span className="relative z-10">{tab.label}</span>
    </Link>)}
  </nav></LayoutGroup>;
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTabPage = pathname === '/sign-in' || pathname === '/sign-up';

  return (
    <MotionConfig reducedMotion="user">
      {/* One responsive tree keeps form state and layout measurements stable. */}
      <div className="nq-auth-shell flex min-h-dvh flex-col">
        <header className="nq-auth-header relative shrink-0 overflow-hidden">
          <div className="nq-auth-welcome relative z-10 mx-auto w-full max-w-md">
            <p className="font-semibold">Health quizzes</p>
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
