'use client';

import { ReactNode, Suspense, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ReadonlyURLSearchParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { signOut } from 'firebase/auth';
import { motion } from 'motion/react';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

const primaryNavItems: NavItem[] = [
  {
    href: '/',
    label: 'nav.home',
    icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    exact: true,
  },
  {
    href: '/stats',
    label: 'nav.stats',
    icon: 'M3 3v18h18M9 17V9m4 8v-4m4 4V5',
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
    href: '/profile',
    label: 'nav.profile',
    icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  },
];

const desktopAdminItems: NavItem[] = [
  {
    href: '/admin?tab=dashboard',
    label: 'Dashboard',
    icon: 'M5 12h5V5H5v7Zm0 7h5v-5H5v5Zm7 0h7V12h-7v7Zm0-14v5h7V5h-7Z',
  },
  {
    href: '/admin?tab=quizzes-manager',
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

  return pathname === href || (!exact && href !== '/' && pathname.startsWith(href));
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading, isAdmin, cachedProfile } = useAuth();
  const avatarName = user?.displayName ?? cachedProfile?.displayName;
  const avatarPhoto = user?.photoURL ?? cachedProfile?.photoURL;
  const isProfileDetail =
    pathname === '/profile/change-password' || pathname === '/profile/language';

  const isActive = useCallback(
    (href: string, exact = false) => matchesNavItem(href, pathname, searchParams, exact),
    [pathname, searchParams],
  );

  useEffect(() => {
    if (!loading && !user) router.push('/sign-in');
  }, [loading, router, user]);

  const handleSignOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await signOut(auth);
    router.push('/sign-in');
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
    <div className="nq-dashboard-shell min-h-dvh">
      <div className="flex min-h-dvh">
        <aside className="nq-dashboard-sidebar sticky top-0 hidden h-dvh w-[252px] shrink-0 border-r border-white/8 bg-[#080e2d]/95 px-5 py-7 lg:flex xl:w-[276px]">
          <div className="flex min-h-0 w-full flex-col">
            <Link href="/" className="flex h-12 items-center px-1">
              <Image
                src="/image/icon/novartis-logo-transparent.png"
                alt="Novartis"
                width={150}
                height={36}
                className="nq-dashboard-logo h-8 w-auto object-contain brightness-0 invert"
                priority
              />
            </Link>

            <Link
              href="/profile"
              className="mt-7 flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.035] p-3 transition hover:border-[#4f7cff]/35 hover:bg-white/[0.06]"
            >
              <ProfileAvatar
                displayName={avatarName}
                photoURL={avatarPhoto}
                size={42}
                ringClassName="ring-1 ring-white/20"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.displayName || 'Player'}</p>
                <p className="truncate text-[11px] text-[#8a97c1]">{user.email}</p>
              </div>
            </Link>

            <p className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#65739f]">
              Main
            </p>
            <nav className="mt-2 space-y-1">
              {primaryNavItems.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      active
                        ? 'bg-[#18255d] font-semibold text-white shadow-[inset_3px_0_0_#557cff]'
                        : 'text-[#8a97c1] hover:bg-white/[0.045] hover:text-white'
                    }`}
                  >
                    <Icon path={item.icon} className="h-[18px] w-[18px]" />
                    <span>{t(item.label)}</span>
                  </Link>
                );
              })}
            </nav>

            {isAdmin && (
              <div className="mt-7">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#65739f]">
                  Admin
                </p>
                <div className="mt-2 space-y-1">
                  {desktopAdminItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition ${
                          active ? 'bg-[#18255d] text-white' : 'text-[#7886af] hover:bg-white/[0.045] hover:text-white'
                        }`}
                      >
                        <Icon path={item.icon} className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#d5677d] transition hover:bg-[#d5677d]/10 hover:text-[#ff8da3]"
            >
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m-3-3h9m0 0-3-3m3 3-3 3" />
              </svg>
              {t('nav.logout')}
            </button>
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
              isProfileDetail ? 'pb-8' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-8'
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
        <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="nq-dashboard-mobile-nav mx-auto flex h-[62px] max-w-[440px] items-center justify-around rounded-2xl border border-white/10 bg-[#0b1337]/94 px-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {primaryNavItems.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-semibold transition ${
                    active ? 'bg-[#17275f] text-white' : 'text-[#7180ad]'
                  }`}
                >
                  <Icon path={item.icon} className="h-[18px] w-[18px]" />
                  <span className="max-w-full truncate px-1">{t(item.label)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
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
