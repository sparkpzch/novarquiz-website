'use client';

import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams, ReadonlyURLSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { motion, useReducedMotion } from 'motion/react';
import ProfileAvatar from '@/components/ui/ProfileAvatar';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

// Regular nav items (Home, Stats, History, Profile)
const mobileNavItems: NavItem[] = [
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

// Special featured Quizzes nav item
const quizzesNavItem: NavItem = {
  href: '/quizzes',
  label: 'nav.quizzes',
  icon: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
};

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

function matchesNavItem(
  href: string,
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
  exact = false,
) {
  if (href.includes('?')) {
    const [basePath, query] = href.split('?');
    const targetTab = new URLSearchParams(query).get('tab');
    return pathname === basePath && searchParams.get('tab') === targetTab;
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
  const reduceMotion = useReducedMotion();
  
  const isProfileDetail =
    pathname === "/profile/change-password" || pathname === "/profile/language";

  const isActive = useCallback(
    (href: string, exact = false) => matchesNavItem(href, pathname, searchParams, exact),
    [pathname, searchParams],
  );

  const [slotIndex, setSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/sign-in');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const idx = mobileNavItems.findIndex((item) => isActive(item.href, item.exact));
    if (idx !== -1) {
      setSlotIndex(idx >= 2 ? idx + 1 : idx);
    } else if (isActive(quizzesNavItem.href)) {
      setSlotIndex(null);
    }
  }, [isActive]);

  const handleSignOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await signOut(auth);
    router.push('/sign-in');
  };

  if (loading || !user) {
    return (
      <div className="nq-sky min-h-screen">
        <div className="nq-content flex min-h-screen items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#0460A9] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="nq-sky min-h-dvh">
        <div className="nq-content flex min-h-dvh">
          <aside className="sticky top-0 h-screen hidden w-[310px] shrink-0 p-5 lg:block">
            <div className="nq-card flex h-full flex-col rounded-[32px] p-6 shadow-2xl">
              <Link href="/" className="flex justify-center rounded-3xl px-2 py-1">
                <Image
                  src="/image/icon/novartis-logo-transparent.png"
                  alt="Novartis logo"
                  width={160}
                  height={64}
                  className="h-16 w-auto object-contain"
                  style={{ width: 'auto' }}
                  priority
                />
              </Link>

              <Link
                href="/profile"
                className="mt-7 block rounded-[28px] bg-white/55 p-4 transition hover:bg-white/70"
              >
                <div className="flex items-center gap-4">
                  <ProfileAvatar
                    displayName={avatarName}
                    photoURL={avatarPhoto}
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
                {/* Home + Stats first */}
                {mobileNavItems.slice(0, 2).map((item) => {
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

                {/* Quizzes */}
                {(() => {
                  const active = isActive(quizzesNavItem.href);
                  return (
                    <Link
                      href={quizzesNavItem.href}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                        active
                          ? 'bg-[#0460A9] text-[#F8FBFF] shadow-lg shadow-[#0460A9]/20'
                          : 'text-[#4D6F93] hover:bg-white/60 hover:text-[#16324F]'
                      }`}
                    >
                      <Icon path={quizzesNavItem.icon} active={active} />
                      <span className="font-medium">{t(quizzesNavItem.label)}</span>
                    </Link>
                  );
                })()}

                {/* History + Profile */}
                {mobileNavItems.slice(2).map((item) => {
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
            <main className={`${isProfileDetail ? "px-4 pb-8 pt-8 md:px-6 lg:px-8" : "nq-bottom-safe px-4 pt-5 lg:pb-8! md:px-6 lg:px-8"} flex-1`}>
              <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {children}
              </motion.div>
            </main>
          </div>
        </div>
      </div>

      {!isProfileDetail && (
      <>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[20px] bg-[linear-gradient(180deg,rgba(196,222,255,0.24)_0%,rgba(196,222,255,0.72)_100%)] backdrop-blur-md lg:hidden"
        />
        {/* Mobile bottom nav — 4 regular items + 1 special Quizzes center FAB */}
        <nav 
          className="fixed inset-x-0 bottom-0 z-40 block px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 lg:hidden"
          style={{ transform: 'translateZ(0)', touchAction: 'none' }}
        >
          <div className="relative mx-auto flex max-w-[430px] items-end justify-around">

            {/* Animated pill background (for 4 regular items only) */}
            <div className="absolute inset-x-0 bottom-0 h-[60px] overflow-hidden rounded-[999px] border border-white/50 bg-white/50 shadow-[0_18px_40px_rgba(70,112,165,0.2)] backdrop-blur-xl">
              <div className="relative h-full w-full">
                {slotIndex !== null && (
                  <motion.div
                    aria-hidden="true"
                    animate={{ x: `${slotIndex * 100}%` }}
                    initial={false}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-y-0 left-0 flex w-1/5 items-center justify-center p-1.5"
                  >
                    <div className="h-full w-full rounded-[999px] border-2 border-[#92BFFF] bg-[#92BFFF] shadow-[0_8px_18px_rgba(14,99,216,0.22)]" />
                  </motion.div>
                )}
              </div>
            </div>

            {/* Left 2 items: Home, Stats */}
            {mobileNavItems.slice(0, 2).map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <div key={item.href} className="relative z-10 flex h-[60px] flex-1 items-center justify-center">
                  <Link
                    href={item.href}
                    className={`flex w-full flex-col items-center justify-center gap-0.5 rounded-[999px] px-2 text-[11px] font-semibold leading-none transition-colors ${
                      active ? 'text-[#234C8F]' : 'text-[#8B8B8B]'
                    }`}
                  >
                    <Icon path={item.icon} active={active} />
                    <span>{t(item.label)}</span>
                  </Link>
                </div>
              );
            })}

            {/* Center: Special Quizzes FAB-style circle button */}
            {(() => {
              const active = isActive(quizzesNavItem.href);
              return (
                <div className="relative z-20 flex flex-1 items-center justify-center">
                  <motion.div
                    className="flex flex-col items-center"
                    style={{ marginBottom: '10px' }}
                    whileTap={reduceMotion ? undefined : { scale: 0.94, y: 2 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  >
                    <Link
                      href={quizzesNavItem.href}
                      className="flex flex-col items-center gap-1"
                    >
                      <motion.div
                        className={`flex h-[64px] w-[64px] flex-col items-center justify-center gap-1 rounded-full shadow-lg transition-all ${
                          active
                            ? 'bg-gradient-to-br from-[#0460A9] to-[#92BFFF] shadow-[0_10px_28px_rgba(4,96,169,0.45)] scale-105'
                            : 'bg-gradient-to-br from-[#0460A9] to-[#55A0FF] shadow-[0_8px_22px_rgba(4,96,169,0.32)] hover:scale-105'
                        }`}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      >
                        {/* Inner decorative ring */}
                        <div className="absolute h-[64px] w-[64px] rounded-full border-2 border-white/25" />
                        <motion.svg
                          className="h-5 w-5 text-[#ffffff]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          whileTap={reduceMotion ? undefined : { scale: 0.88, rotate: -12 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={quizzesNavItem.icon} />
                        </motion.svg>
                        <span className="text-[10px] font-bold leading-none text-[#ffffff]" style={{ textShadow: '0 1px 2px rgba(4,96,169,0.6)' }}>
                          {t(quizzesNavItem.label)}
                        </span>
                      </motion.div>
                    </Link>
                  </motion.div>
                </div>
              );
            })()}

            {/* Right 2 items: History, Profile */}
            {mobileNavItems.slice(2).map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <div key={item.href} className="relative z-10 flex h-[60px] flex-1 items-center justify-center">
                  <Link
                    href={item.href}
                    className={`flex w-full flex-col items-center justify-center gap-0.5 rounded-[999px] px-2 text-[11px] font-semibold leading-none transition-colors ${
                      active ? 'text-[#234C8F]' : 'text-[#8B8B8B]'
                    }`}
                  >
                    <Icon path={item.icon} active={active} />
                    <span>{t(item.label)}</span>
                  </Link>
                </div>
              );
            })}

          </div>
        </nav>
      </>
      )}
    </>
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
