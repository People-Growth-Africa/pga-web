import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import NotificationBell from './NotificationBell';
import { TopProgressBar } from '../Loader';
import { beginLoading, endLoading } from '../../lib/loading';
import {
  ADMIN_PORTAL_ROLES,
  isAdminPortalRole,
  isContentManagerRole,
  roleLabel,
  type Role,
} from '../../lib/authClient';

type Portal = 'admin' | 'content';

type NavItem = {
  label: string;
  to: string;
  roles: Role[];
  match: (pathname: string) => boolean;
};

function navItems(portal: Portal): NavItem[] {
  if (portal === 'content') {
    return [
      {
        label: 'Content',
        to: '/content',
        roles: ['content_manager'],
        match: (pathname) => pathname === '/content' || pathname.startsWith('/content/'),
      },
      {
        label: 'My security',
        to: '/content/my-security',
        roles: ['content_manager'],
        match: (pathname) => pathname.startsWith('/content/my-security'),
      },
    ];
  }

  return [
    {
      label: 'Dashboard',
      to: '/admin/stats',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname === '/admin' || pathname.startsWith('/admin/stats'),
    },
    {
      label: 'Data',
      to: '/admin/data',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname.startsWith('/admin/data') || pathname.startsWith('/admin/registrations'),
    },
    {
      label: 'My access',
      to: '/admin/my-access',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname.startsWith('/admin/my-access'),
    },
    {
      label: 'My security',
      to: '/admin/my-security',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname.startsWith('/admin/my-security') || pathname.startsWith('/admin/security'),
    },
    {
      label: 'Notifications',
      to: '/admin/notifications',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname.startsWith('/admin/notifications'),
    },
    {
      label: 'Audit Log',
      to: '/admin/audit-log',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/audit-log'),
    },
    {
      label: 'Content oversight',
      to: '/admin/oversight',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname.startsWith('/admin/oversight') || pathname.startsWith('/admin/content'),
    },
    {
      label: 'Email templates',
      to: '/admin/email-templates',
      roles: ADMIN_PORTAL_ROLES,
      match: (pathname) => pathname.startsWith('/admin/email-templates'),
    },
    {
      label: 'Staff accounts',
      to: '/admin/staff',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/staff'),
    },
    {
      label: 'Access',
      to: '/admin/access',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/access'),
    },
    {
      label: 'Data retention',
      to: '/admin/retention',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/retention'),
    },
  ];
}

export default function AdminShell({
  portal = 'admin',
  title,
  subtitle,
  actions,
  children,
}: {
  portal?: Portal;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // A route change is a short request-like wait for the thin bar. `settled`
  // makes the timer and the unmount cleanup agree, so the channel is balanced.
  useEffect(() => {
    beginLoading('request');
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      endLoading('request');
    };
    const timer = window.setTimeout(finish, 320);
    return () => {
      window.clearTimeout(timer);
      finish();
    };
  }, [pathname]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const items = navItems(portal).filter(
    (item) => user?.role !== undefined && item.roles.includes(user.role) &&
      (item.to !== '/admin/staff' || user.isSuperAdmin) &&
      (item.to !== '/admin/access' || user.isSuperAdmin) &&
      (item.to !== '/admin/retention' || user.isSuperAdmin),
  );
  const section = portal === 'content' ? 'Content desk' : 'Staff';
  // Only the accounts that carry a name are greeted by it: a seeded or legacy
  // row has none, and "Welcome back, null" is worse than nothing at all.
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? '';
  const loginPath = portal === 'content' ? '/content/login' : '/admin/login';

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate(loginPath, { replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-[#0B4B3C] px-5 pb-6 pt-7 text-white sm:px-6 sm:pb-7 sm:pt-8">
      <Link
        to="/"
        className="font-[family-name:var(--font-heading)] text-[1.4rem] font-semibold leading-[1.08] tracking-[-0.01em] text-white no-underline sm:text-[1.55rem]"
      >
        People Growth
        <br />
        Africa
      </Link>

      <p className="mt-8 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-white/45 sm:mt-11 sm:text-[0.65rem]">
        {section}
      </p>
      <nav aria-label={`${section} navigation`} className="mt-3 flex flex-col gap-0.5 overflow-y-auto sm:gap-1">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[10px] px-3.5 py-[0.65rem] font-[family-name:var(--font-body)] text-[0.92rem] font-medium no-underline transition-colors motion-reduce:transition-none sm:px-4 sm:py-[0.72rem] sm:text-[0.98rem] ${
                active
                  ? 'bg-white/[0.14] text-white'
                  : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/15 pt-4 sm:pt-5">
        <p className="truncate font-[family-name:var(--font-body)] text-[0.78rem] text-white/80 sm:text-[0.82rem]" title={user?.email}>
          {user?.email}
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-body)] text-[0.74rem] text-white/50 sm:text-[0.78rem]">
          {roleLabel(user?.role)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
          <Link
            to="/"
            className="font-[family-name:var(--font-body)] text-[0.75rem] font-semibold text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white sm:text-[0.78rem]"
          >
            View site
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="cursor-pointer border-0 bg-transparent p-0 font-[family-name:var(--font-body)] text-[0.75rem] font-semibold text-white/80 underline decoration-white/40 underline-offset-2 hover:text-white disabled:opacity-60 sm:text-[0.78rem]"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F5F0E7]">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-30 hidden w-[240px] lg:block xl:w-[260px]">{sidebar}</div>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#0B4B3C] px-4 py-3.5 text-white sm:px-5 sm:py-4 lg:hidden">
        <Link
          to="/"
          className="font-[family-name:var(--font-heading)] text-lg font-semibold leading-[1.1] no-underline sm:text-xl"
        >
          People Growth
          <br />
          Africa
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="staff-mobile-menu"
          className="rounded-full border border-white/25 px-3.5 py-1.5 font-[family-name:var(--font-body)] text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:px-4 sm:py-2"
        >
          Menu
        </button>
      </header>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Staff menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-charcoal/50 backdrop-blur-sm"
          />
          <div id="staff-mobile-menu" className="relative h-full w-[min(85vw,320px)] shadow-[0_0_50px_rgba(0,0,0,0.3)]">
            {sidebar}
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/10 sm:right-4 sm:top-4"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="overflow-x-hidden lg:pl-[240px] xl:pl-[260px]">
        <main className="mx-auto w-full max-w-[1280px] overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-12 xl:px-16 xl:py-14">
          <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:gap-5 lg:mb-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              {firstName && (
                <p className="mb-2 font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/55 sm:text-[0.92rem]">
                  Welcome back, {firstName}.
                </p>
              )}
              <h1 className="font-[family-name:var(--font-heading)] text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.02em] text-charcoal sm:text-[2.1rem] md:text-[2.4rem] lg:text-[2.65rem]">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 max-w-[62ch] font-[family-name:var(--font-body)] text-[0.88rem] leading-relaxed text-charcoal/60 sm:text-[0.92rem] md:text-[0.95rem]">
                  {subtitle}
                </p>
              )}
            </div>
            {(actions || portal === 'admin') && (
              <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:gap-2.5 xl:w-auto">
                {portal === 'admin' && <NotificationBell />}
                {actions}
              </div>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function portalHome(role: Role | undefined): string {
  if (isContentManagerRole(role)) return '/content';
  if (isAdminPortalRole(role)) return '/admin/stats';
  return '/';
}
