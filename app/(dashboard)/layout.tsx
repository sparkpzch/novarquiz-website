'use client';

import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ReadonlyURLSearchParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import SurveyGate from '@/components/onboarding/SurveyGate';
import { useTheme } from '@/lib/hooks/useTheme';
import { useToast } from '@/components/ui/Toast';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

const profileNavItem: NavItem = {
  href: '/profile',
  label: 'nav.profile',
  icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z',
};

const primaryNavItems: NavItem[] = [
  {
    href: '/',
    label: 'nav.home',
    icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    exact: true,
  },
  {
    href: '/quizzes',
    label: 'nav.quizzes',
    icon: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
  },
  {
    href: '/history',
    label: 'nav.history',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  {
    href: '/stats',
    label: 'nav.stats',
    icon: 'M3 3v18h18M7 16v-4m5 4V8m5 8V5',
  },
  profileNavItem,
];

// Keep Home in the centre without changing the desktop navigation order.
const mobileNavItems = [primaryNavItems[1], primaryNavItems[2], primaryNavItems[0], primaryNavItems[3], profileNavItem];

const desktopAdminItems: NavItem[] = [
  { href: '/admin/analytics', label: 'Analytics', icon: 'M3 3v18h18M7 16v-4m5 4V8m5 8V5' },
  {
    href: '/admin',
    exact: true,
    label: 'Quizzes Manager',
    icon: 'M3.75 3h16.5M3.75 7.5h16.5M3.75 12h16.5M3.75 16.5h16.5M3.75 21h16.5',
  },
  {
    href: '/admin/insights',
    label: 'Insight Summaries',
    icon: 'M12 3v1.5m0 15V21m9-9h-1.5m-15 0H3m15.364-6.364-1.06 1.06M6.696 17.304l-1.06 1.06m12.728 0-1.06-1.06M6.696 6.696l-1.06-1.06M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  },
];

function Icon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function matchesNavItem(
  href: string,
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
  exact = false,
) {
  if (href.includes('?')) {
    const [basePath, query] = href.split('?');
    return (
      pathname === basePath &&
      searchParams.get('tab') === new URLSearchParams(query).get('tab')
    );
  }

  return pathname === href || (!exact && href !== '/' && pathname.startsWith(`${href}/`));
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, loading, isAdmin, cachedProfile, logout } = useAuth();
  const { showToast } = useToast();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const avatarName = user?.displayName ?? cachedProfile?.displayName;
  const avatarPhoto = user?.photoURL ?? cachedProfile?.photoURL;
  const isProfileDetail =
    pathname === '/profile/change-password' || pathname === '/profile/language';

  const isActive = useCallback(
    (href: string, exact = false) => matchesNavItem(href, pathname, searchParams, exact),
    [pathname, searchParams],
  );

  useEffect(() => {
    if (!loading && !user) router.replace('/sign-in');
  }, [loading, router, user]);

  useEffect(() => {
    if (!showLogoutConfirm) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSigningOut) setShowLogoutConfirm(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isSigningOut, showLogoutConfirm]);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await logout();
    } catch {
      showToast(t('auth.logout_error'), 'error');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#4f7cff] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className={`nq-dashboard-shell nq-theme-${theme} min-h-dvh`}>
      <SurveyGate />
      <div className="flex min-h-dvh">
        <aside className="nq-dashboard-sidebar sticky top-0 hidden h-dvh w-[264px] shrink-0 overflow-hidden border-r px-4 py-5 lg:flex">
          <div className="nq-sidebar-scroll flex min-h-0 w-full flex-col overflow-y-auto pr-1">
            <Link href="/" className="flex h-10 items-center px-1">
              <Image
                src="/image/icon/novartis-logo-transparent.png"
                alt="Novartis"
                width={150}
                height={36}
                className="nq-dashboard-logo h-[30px] w-auto object-contain brightness-0 invert"
                priority
              />
            </Link>

            <Link
              href="/profile"
              className="nq-sidebar-profile mt-5 flex items-center gap-3 border-b px-1 pb-5 transition hover:opacity-90"
            >
              <ProfileAvatar
                displayName={avatarName}
                photoURL={avatarPhoto}
                size={40}
                ringClassName="ring-1 ring-white/25"
              />
              <div className="min-w-0">
                <p className="nq-sidebar-name truncate text-xs font-semibold text-white">
                  {user.displayName || 'Player'}
                </p>
                <p className="nq-sidebar-muted mt-1 truncate text-[9px]" title={user.email ?? undefined}>
                  {user.email}
                </p>
              </div>
            </Link>

            <nav className="mt-5 space-y-1.5">
              {primaryNavItems.filter((item) => item.href !== '/profile').map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`nq-sidebar-link flex min-h-10 items-center gap-3 rounded-xl px-2 py-1.5 text-xs transition ${
                      active
                        ? 'nq-sidebar-link-active font-semibold text-white'
                        : 'nq-sidebar-muted hover:text-white'
                    }`}
                  >
                    <span className="nq-sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                      <Icon path={item.icon} className="h-3.5 w-3.5" />
                    </span>
                    <span>{t(item.label)}</span>
                  </Link>
                );
              })}
            </nav>

            {isAdmin && (
              <div className="mt-5">
                <p className="nq-sidebar-label px-2 text-[8px] font-semibold uppercase tracking-[0.12em]">
                  Admin
                </p>
                <div className="mt-2 space-y-1.5">
                  {desktopAdminItems.map((item) => {
                    const active = isActive(item.href, item.exact);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`nq-sidebar-link flex min-h-10 items-center gap-3 rounded-xl px-2 py-1.5 text-xs transition ${
                          active ? 'nq-sidebar-link-active font-semibold text-white' : 'nq-sidebar-muted hover:text-white'
                        }`}
                      >
                        <span className="nq-sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                          <Icon path={item.icon} className="h-3.5 w-3.5" />
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="nq-sidebar-label px-2 text-[8px] font-semibold uppercase tracking-[0.12em]">
                Account pages
              </p>
              <div className="mt-2 space-y-1.5">
                <Link
                  href="/profile"
                  aria-current={isActive('/profile') ? 'page' : undefined}
                  className={`nq-sidebar-link flex min-h-10 items-center gap-3 rounded-xl px-2 py-1.5 text-xs transition ${
                    isActive('/profile') ? 'nq-sidebar-link-active font-semibold text-white' : 'nq-sidebar-muted hover:text-white'
                  }`}
                >
                  <span className="nq-sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                    <Icon path={profileNavItem.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span>{t('nav.profile')}</span>
                </Link>
              </div>
            </div>

            <div className="nq-sidebar-footer mt-auto pt-6">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="nq-sidebar-logout flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition"
              >
                <span className="nq-sidebar-logout-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m-3-3h9m0 0-3-3m3 3-3 3" />
                  </svg>
                </span>
                <span>{t('nav.logout')}</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="nq-dashboard-mobile-header sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-white/8 bg-[#080e2d]/92 px-4 backdrop-blur-xl lg:hidden">
            <Link href="/" className="flex items-center">
              <Image
                src="/image/icon/novartis-logo-transparent.png"
                alt="Novartis"
                width={130}
                height={32}
                className="nq-dashboard-logo h-7 w-auto brightness-0 invert"
                priority
              />
            </Link>
            <Link href="/profile" aria-label={t('nav.profile')}>
              <ProfileAvatar
                displayName={avatarName}
                photoURL={avatarPhoto}
                size={38}
                ringClassName="ring-2 ring-[#547cff]/70"
              />
            </Link>
          </header>

          <main
            className={`flex-1 px-4 pt-4 sm:px-5 md:px-7 lg:px-8 lg:pt-7 xl:px-10 ${
              isProfileDetail ? 'pb-8' : 'pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-8'
            }`}
          >
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>

      {!isProfileDetail && (
        <nav aria-label={t('nav.main_navigation', { defaultValue: 'Main navigation' })} className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="nq-dashboard-mobile-nav mx-auto flex h-[80px] max-w-[500px] items-center justify-around gap-1 rounded-[32px] border border-white/10 bg-[#0b1337]/94 px-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {mobileNavItems.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`nq-mobile-nav-link flex h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[24px] text-[10px] font-semibold transition ${item.href === '/' ? 'nq-mobile-nav-home' : ''} ${
                    active ? 'bg-[#17275f] text-white' : 'text-[#7180ad]'
                  }`}
                >
                  <span className="nq-mobile-nav-icon"><Icon path={item.icon} className="h-6 w-6" /></span>
                  <span className="max-w-full truncate">{t(item.label)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b20]/55 p-4 backdrop-blur-md"
            onClick={() => {
              if (!isSigningOut) setShowLogoutConfirm(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-confirm-title"
              aria-describedby="logout-confirm-description"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
              className="nq-card w-full max-w-sm rounded-[30px] p-7 text-center"
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ef6363]/12 text-[#d84d63]">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m-3-3h9m0 0-3-3m3 3-3 3" />
                </svg>
              </span>
              <h2 id="logout-confirm-title" className="mt-4 text-xl font-bold text-[#16324F]">
                {t('auth.logout_confirm_title')}
              </h2>
              <p id="logout-confirm-description" className="mt-2 text-sm leading-6 text-[#5D7EA1]">
                {t('auth.logout_confirm_description')}
              </p>
              <div className="mt-7 flex gap-3">
                <button
                  type="button"
                  autoFocus
                  disabled={isSigningOut}
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-2xl border border-[#92BFFF]/45 bg-white/70 px-4 py-3 text-sm font-semibold text-[#16324F] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('auth.logout_cancel')}
                </button>
                <button
                  type="button"
                  disabled={isSigningOut}
                  onClick={handleSignOut}
                  className="nq-always-dark flex-1 rounded-2xl bg-linear-to-r from-[#D84D63] to-[#BA2F54] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(186,47,84,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-white">
                    {isSigningOut ? t('auth.logging_out') : t('auth.logout_confirm')}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#4f7cff] border-t-transparent" />
        </div>
      }
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
