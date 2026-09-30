'use client';

import { ReactNode } from 'react';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const AUTH_TABS = [
  { label: 'Login', href: '/sign-in' },
  { label: 'Sign Up', href: '/sign-up' },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTabPage = pathname === '/sign-in' || pathname === '/sign-up';

  return (
    <MotionConfig reducedMotion="user">
      {/* One responsive tree keeps form state and layout measurements stable. */}
      <div className="nq-auth-shell flex min-h-dvh flex-col">
        <header className="nq-auth-header relative shrink-0 overflow-hidden">
          <div className="nq-auth-welcome relative z-10 mx-auto w-full max-w-md">
            <p className="font-semibold">Welcome back</p>
            <div className="flex items-baseline gap-1.5">
              <span className="nq-auth-welcome-to font-normal">To</span>
              <span className="nq-auth-brand font-extrabold tracking-tight">NovarQuiz</span>
            </div>
          </div>
        </header>

        <main className="nq-auth-card relative z-10 flex-1">
          <div className="nq-auth-content mx-auto w-full max-w-md">
            {isTabPage && (
              <LayoutGroup id="auth-tabs">
                <nav className="nq-auth-tabs relative mb-5 flex" aria-label="Account access">
                  {AUTH_TABS.map((tab) => {
                    const isActive = pathname === tab.href;
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        aria-current={isActive ? 'page' : undefined}
                        className="nq-auth-tab relative flex-1 text-center"
                      >
                        {isActive && (
                          <motion.span
                            layoutId="auth-tab-pill"
                            className="nq-auth-tab-pill absolute inset-0"
                            aria-hidden="true"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </LayoutGroup>
            )}

            {children}
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
