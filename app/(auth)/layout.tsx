'use client';

import { ReactNode } from 'react';
import { motion } from 'motion/react';
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
    <>
      {/* ─── MOBILE LAYOUT ─── */}
      <div className="md:hidden min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#e8f0fe' }}>
        {/* Blue gradient header */}
        <div
          className="relative flex-shrink-0 overflow-hidden"
          style={{
            minHeight: '240px',
            height: '42vh',
            background: 'linear-gradient(135deg, #6ba3f5 0%, #4f82e8 40%, #3b5fd4 100%)',
          }}
        >
          {/* Dot grid pattern */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.45) 1.5px, transparent 1.5px)',
              backgroundSize: '26px 26px',
            }}
          />
          {/* Soft light flare top-right */}
          <div
            className="absolute"
            style={{
              top: '-40px',
              right: '-40px',
              width: '220px',
              height: '220px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 70%)',
            }}
          />
          {/* Welcome text */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute left-6 right-6"
            style={{ bottom: '40px' }}
          >
            <p className="text-white font-semibold" style={{ fontSize: '22px', lineHeight: 1.15, marginBottom: '2px' }}>
              Welcome back
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-white/75 font-normal" style={{ fontSize: '15px' }}>To</span>
              <span className="text-white font-extrabold tracking-tight" style={{ fontSize: '32px' }}>NovarQuiz</span>
            </div>
          </motion.div>
        </div>

        {/* White card */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
          className="relative z-10 flex-1 bg-white overflow-y-auto"
          style={{
            marginTop: '-28px',
            borderRadius: '28px 28px 0 0',
            boxShadow: '0 -6px 32px rgba(0,0,0,0.13)',
          }}
        >
          <div style={{ padding: '28px 22px 40px' }}>
            {/* ── Tab switcher (only for login/signup pages) ── */}
            {isTabPage && (
              <div
                className="flex mb-6 relative"
                style={{
                  background: '#f0f0f0',
                  borderRadius: '12px',
                  padding: '4px',
                }}
              >
                {AUTH_TABS.map((tab) => {
                  const isActive = pathname === tab.href;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="relative flex-1 text-center z-10"
                      style={{
                        borderRadius: '9px',
                        padding: '9px 0',
                        fontSize: '15px',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#111' : '#6b7280',
                        textDecoration: 'none',
                      }}
                    >
                      {/* Sliding pill — only rendered for the active tab */}
                      {isActive && (
                        <motion.div
                          layoutId="auth-tab-pill"
                          className="absolute inset-0"
                          style={{
                            background: '#ffffff',
                            borderRadius: '9px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
                            zIndex: -1,
                          }}
                          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                        />
                      )}
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            )}

            {children}
          </div>
        </motion.div>
      </div>

      {/* ─── DESKTOP LAYOUT ─── */}
      <div
        className="hidden md:flex min-h-screen flex-col overflow-hidden"
        style={{ backgroundColor: '#e8f0fe' }}
      >
        {/* Blue gradient header */}
        <div
          className="relative flex-shrink-0 overflow-hidden flex items-end"
          style={{
            minHeight: '260px',
            height: '38vh',
            background: 'linear-gradient(135deg, #6ba3f5 0%, #4f82e8 40%, #3b5fd4 100%)',
          }}
        >
          {/* Dot grid pattern */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.45) 1.5px, transparent 1.5px)',
              backgroundSize: '26px 26px',
            }}
          />
          {/* Soft light flare top-right */}
          <div
            className="absolute"
            style={{
              top: '-40px',
              right: '-40px',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
            }}
          />
          {/* Welcome text */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-md mx-auto px-8 pb-10"
          >
            <p className="text-white font-semibold" style={{ fontSize: '22px', lineHeight: 1.15, marginBottom: '2px' }}>
              Welcome back
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-white/75 font-normal" style={{ fontSize: '15px' }}>To</span>
              <span className="text-white font-extrabold tracking-tight" style={{ fontSize: '32px' }}>NovarQuiz</span>
            </div>
          </motion.div>
        </div>

        {/* White card */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
          className="relative z-10 flex-1 bg-white overflow-y-auto"
          style={{
            marginTop: '-28px',
            borderRadius: '28px 28px 0 0',
            boxShadow: '0 -6px 32px rgba(0,0,0,0.13)',
          }}
        >
          <div className="w-full max-w-md mx-auto" style={{ padding: '28px 22px 40px' }}>
            {/* ── Tab switcher (only for login/signup pages) ── */}
            {isTabPage && (
              <div
                className="flex mb-6 relative"
                style={{
                  background: '#f0f0f0',
                  borderRadius: '12px',
                  padding: '4px',
                }}
              >
                {AUTH_TABS.map((tab) => {
                  const isActive = pathname === tab.href;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="relative flex-1 text-center z-10"
                      style={{
                        borderRadius: '9px',
                        padding: '9px 0',
                        fontSize: '15px',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#111' : '#6b7280',
                        textDecoration: 'none',
                      }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="auth-tab-pill-desktop"
                          className="absolute inset-0"
                          style={{
                            background: '#ffffff',
                            borderRadius: '9px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
                            zIndex: -1,
                          }}
                          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                        />
                      )}
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            )}

            {children}
          </div>
        </motion.div>
      </div>
    </>
  );
}
