'use client';

import { ReactNode, Suspense, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion } from 'motion/react';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

const mobileNavItems: NavItem[] = [
  {
    href: '/',
    label: 'nav.home',
    icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    exact: true,
  },
  {
    href: '/history',
    label: 'nav.history',
    icon: 'M12 6v6l4 2m5-2a9 9 0 1 1-9-9',
  },
  {
    href: '/profile',
    label: 'nav.profile',
    icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-7 10h6c2.761 0 5 2.239 5 5H4c0-2.761 2.239-5 5-5Z',
  },
];

const desktopAdminItems: NavItem[] = [
  {
    href: '/admin?tab=dashboard',
    label: 'Dashboard',
    icon: 'M5 12h5V5H5v7Zm0 7h5v-5H5v5Zm7 0h7V12h-7v7Zm0-14v5h7V5h-7Z',
  },
  {
    href: '/admin?tab=session-manager',
    label: 'Session Manager',
    icon: 'M12 4a8 8 0 1 0 8 8h-8V4Zm1 0v7h7',
  },
  {
    href: '/admin?tab=question-manager',
    label: 'Question Manager',
    icon: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 4h6m-6 4h6m-6 4h3',
  },
];

function Icon({ path, active = false }: { path: string; active?: boolean }) {
  return (
    <svg
      className={`relative z-10 h-5 w-5 ${active ? 'text-current' : 'text-current'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const isProfileDetail =
    pathname === "/profile/change-password" || pathname === "/profile/language";

  useEffect(() => {
    if (!loading && !user) {
      router.push('/sign-in');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await signOut(auth);
    router.push('/sign-in');
  };

  const isActive = (href: string, exact = false) => {
    if (href.includes('?')) {
      const [basePath, query] = href.split('?');
      const targetTab = new URLSearchParams(query).get('tab');
      return pathname === basePath && searchParams.get('tab') === targetTab;
    }
    return pathname === href || (!exact && href !== '/' && pathname.startsWith(href));
  };

  return (
    <div className="nq-sky min-h-screen">
      <div className="nq-content flex min-h-screen">
        <aside className="hidden w-[292px] shrink-0 p-6 xl:block">
          <div className="nq-card flex h-full flex-col rounded-[32px] p-6">
            <Link href="/" className="flex justify-center rounded-3xl px-2 py-1">
              <Image
                src="/image/icon/novartis-logo-transparent.png"
                alt="Novartis logo"
                width={160}
                height={64}
                className="h-16 w-auto object-contain"
                priority
              />
            </Link>

            <Link
              href="/profile"
              className="mt-7 block rounded-[28px] bg-white/55 p-4 transition hover:bg-white/70"
            >
              <div className="flex items-center gap-4">
                <ProfileAvatar
                  displayName={user.displayName}
                  photoURL={user.photoURL}
                  size={56}
                  ringClassName="ring-4 ring-white/80 shadow-md shadow-[#0460A9]/20"
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#16324F]">{user.displayName || 'Player'}</p>
                  <p className="truncate text-sm text-[#5D7EA1]">{user.email}</p>
                </div>
              </div>
            </Link>

            <nav className="mt-8 space-y-2">
              {mobileNavItems.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                      active
                        ? 'bg-[#0460A9] text-[#F8FBFF] shadow-lg shadow-[#0460A9]/20'
                        : 'text-[#4D6F93] hover:bg-white/60 hover:text-[#16324F]'
                    }`}
                  >
                    <Icon path={item.icon} active={active} />
                    <span className="font-medium">{t(item.label)}</span>
                  </Link>
                );
              })}
            </nav>

            {isAdmin && (
              <div className="mt-8">
                <div className="mb-3 px-4 text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">
                  Admin
                </div>
                <div className="space-y-2">
                  {desktopAdminItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                          active
                            ? 'bg-[#0460A9] text-[#F8FBFF] shadow-lg shadow-[#0460A9]/20'
                            : 'bg-white/45 text-[#4D6F93] hover:bg-white/70 hover:text-[#16324F]'
                        }`}
                      >
                        <Icon path={item.icon} active={active} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-auto space-y-3 pt-8">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#0460A9]/10 bg-white/70 px-4 py-3 text-sm font-semibold text-[#16324F] transition hover:bg-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m-3-3h9m0 0-3-3m3 3-3 3" />
                </svg>
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {!isProfileDetail && (
            <header className="px-4 pb-4 pt-5 md:px-6 xl:px-8">
              <div className="nq-card flex items-center justify-between rounded-[28px] px-4 py-3 md:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#5D7EA1]">NovarQuiz</p>
                  <p className="text-lg font-semibold text-[#16324F]">
                    {pathname === '/' ? 'Dashboard' : pathname.replace('/', '').replace(/-/g, ' ')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <span className="hidden rounded-full bg-[#70A2F9] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white md:inline-flex">
                      Admin
                    </span>
                  )}
                  <Link href="/profile" className="rounded-full">
                    <ProfileAvatar
                      displayName={user.displayName}
                      photoURL={user.photoURL}
                      size={42}
                      ringClassName="ring-4 ring-white/80 shadow-sm shadow-[#0460A9]/15"
                    />
                  </Link>
                </div>
              </div>
            </header>
          )}

          <main className={`${isProfileDetail ? "px-4 pb-8 pt-8 md:px-6 xl:px-8" : "nq-bottom-safe px-4 pb-8 md:px-6 xl:px-8"} flex-1`}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {children}
            </motion.div>
          </main>
        </div>
      </div>

      {!isProfileDetail && (
      <nav className="fixed inset-x-0 bottom-0 z-40 block px-4 pb-[calc(0.95rem+env(safe-area-inset-bottom))] pt-3 xl:hidden">
        <div className="mx-auto flex h-[60px] w-full max-w-[370px] items-center justify-between gap-1.5 rounded-[93px] border border-[#0460A9]/12 bg-white/88 px-2 py-1.5 shadow-[0_18px_45px_rgba(17,87,145,0.18)] backdrop-blur-xl">
          {mobileNavItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[93px] px-2 py-2 text-[11px] font-semibold leading-none transition-all ${
                  active ? 'text-white' : 'text-[#5D7EA1]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-nav-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-[93px] border border-[#70A2F9]/15 bg-[#70A2F9] shadow-[0_12px_24px_rgba(17,87,145,0.24)]"
                  />
                )}
                <Icon path={item.icon} active={active} />
                <span className="relative z-10">{t(item.label)}</span>
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
        <div className="nq-sky min-h-screen">
          <div className="nq-content flex min-h-screen items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
          </div>
        </div>
      }
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
