'use client';

import { ReactNode, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams, ReadonlyURLSearchParams } from 'next/navigation';
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
  const { user, loading, isAdmin } = useAuth();
  const mobileNavContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileNavRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [mobilePillStyle, setMobilePillStyle] = useState<{ x: number; width: number; opacity: number }>({
    x: 0,
    width: 0,
    opacity: 0,
  });
  const isProfileDetail =
    pathname === "/profile/change-password" || pathname === "/profile/language";

  useEffect(() => {
    if (!loading && !user) {
      router.push('/sign-in');
    }
  }, [user, loading, router]);

  const isActive = useCallback(
    (href: string, exact = false) => matchesNavItem(href, pathname, searchParams, exact),
    [pathname, searchParams],
  );

  useLayoutEffect(() => {
    if (loading || !user) {
      return;
    }

    const activeIndex = mobileNavItems.findIndex((item) => isActive(item.href, item.exact));
    const activeEl = activeIndex >= 0 ? mobileNavRefs.current[activeIndex] : null;
    const containerEl = mobileNavContainerRef.current;

    if (!activeEl || !containerEl) {
      setMobilePillStyle((prev) => ({ ...prev, opacity: 0 }));
      return;
    }

    const updatePill = () => {
      const activeRect = activeEl.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();

      setMobilePillStyle({
        x: activeRect.left - containerRect.left,
        width: activeRect.width,
        opacity: 1,
      });
    };

    updatePill();

    const resizeObserver = new ResizeObserver(updatePill);
    resizeObserver.observe(activeEl);
    resizeObserver.observe(containerEl);
    window.addEventListener('resize', updatePill);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePill);
    };
  }, [isActive, loading, user]);

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
    <div className="nq-sky min-h-screen">
      <div className="nq-content flex min-h-screen">
        <aside className="sticky top-0 h-screen hidden w-[310px] shrink-0 p-5 xl:block">
          <div className="nq-card flex h-full flex-col rounded-[32px] p-6 shadow-2xl">
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
            <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {children}
            </motion.div>
          </main>
        </div>
      </div>

      {!isProfileDetail && (
      <nav className="fixed inset-x-0 bottom-0 z-40 block px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 xl:hidden">
        <div ref={mobileNavContainerRef} className="relative mx-auto flex h-[60px] w-[370px] max-w-full items-center rounded-[999px] border border-white/80 bg-white/96 p-2 shadow-[0_18px_40px_rgba(70,112,165,0.2)] backdrop-blur-xl">
          <motion.span
            aria-hidden="true"
            animate={mobilePillStyle}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="absolute inset-y-1.5 left-0 rounded-[999px] border-2 border-[#BFD9FF] bg-[#BFD9FF] shadow-[0_8px_18px_rgba(14,99,216,0.2)]"
          />
          {mobileNavItems.map((item, index) => {
            const active = isActive(item.href, item.exact);
            return (
              <div key={item.href} className="relative z-10 flex h-full flex-1 items-center justify-center">
                <Link
                  href={item.href}
                  ref={(el) => {
                    mobileNavRefs.current[index] = el;
                  }}
                  className={`inline-flex min-w-[98px] flex-col items-center justify-center gap-0.5 rounded-[999px] px-4 py-1 text-[13px] font-semibold leading-none transition-colors ${
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
