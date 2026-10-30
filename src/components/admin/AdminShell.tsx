import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import {
  ADMIN_PORTAL_ROLES,
  isAdminPortalRole,
  isContentManagerRole,
  roleLabel,
  type Role,
} from '../../lib/authClient';

const DEFAULT_SUPER_ADMIN_EMAIL = 'admin@peoplegrowthafrica.com';
const configuredSuperAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
function isSuperAdmin(email: string | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === configuredSuperAdminEmail);
}

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
      label: 'Content oversight',
      to: '/admin/oversight',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/oversight') || pathname.startsWith('/admin/content'),
    },
    {
      label: 'Email templates',
      to: '/admin/email-templates',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/email-templates'),
    },
    {
      label: 'Staff accounts',
      to: '/admin/staff',
      roles: ['admin'],
      match: (pathname) => pathname.startsWith('/admin/staff'),
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const items = navItems(portal).filter(
    (item) => user?.role !== undefined && item.roles.includes(user.role) &&
      (item.to !== '/admin/staff' || isSuperAdmin(user.email)),
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
    <div className="flex h-full flex-col bg-[#0B4B3C] px-6 pb-7 pt-8 text-white">
      <Link
        to="/"
        className="font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold leading-[1.08] tracking-[-0.01em] text-white no-underline"
      >
        People Growth
        <br />
        Africa
      </Link>

      <p className="mt-11 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/45">
        {section}
      </p>
      <nav aria-label={`${section} navigation`} className="mt-3 flex flex-col gap-1">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[10px] px-4 py-[0.72rem] font-[family-name:var(--font-body)] text-[0.98rem] font-medium no-underline transition-colors motion-reduce:transition-none ${
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

      <div className="mt-auto border-t border-white/15 pt-5">
        <p className="truncate font-[family-name:var(--font-body)] text-[0.82rem] text-white/80" title={user?.email}>
          {user?.email}
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-body)] text-[0.78rem] text-white/50">
          {roleLabel(user?.role)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            to="/"
            className="font-[family-name:var(--font-body)] text-[0.78rem] font-semibold text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white"
          >
            View site
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="cursor-pointer border-0 bg-transparent p-0 font-[family-name:var(--font-body)] text-[0.78rem] font-semibold text-white/80 underline decoration-white/40 underline-offset-2 hover:text-white disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F0E7]">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-[260px] lg:block">{sidebar}</div>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#0B4B3C] px-5 py-4 text-white lg:hidden">
        <Link
          to="/"
          className="font-[family-name:var(--font-heading)] text-xl font-semibold leading-[1.1] no-underline"
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
          className="rounded-full border border-white/25 px-4 py-2 font-[family-name:var(--font-body)] text-sm font-semibold text-white"
        >
          Menu
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Staff menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-charcoal/45"
          />
          <div id="staff-mobile-menu" className="relative h-full w-[min(84vw,300px)] shadow-elevated">
            {sidebar}
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-[260px]">
        <main className="mx-auto w-full max-w-[1280px] px-5 py-9 sm:px-8 lg:px-12 lg:py-14 xl:px-16">
          <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              {firstName && (
                <p className="mb-2 font-[family-name:var(--font-body)] text-[0.92rem] text-charcoal/55">
                  Welcome back, {firstName}.
                </p>
              )}
              <h1 className="font-[family-name:var(--font-heading)] text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.02em] text-charcoal sm:text-[2.65rem]">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 max-w-[62ch] font-[family-name:var(--font-body)] text-[0.95rem] leading-relaxed text-charcoal/60">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2.5 xl:w-auto">{actions}</div>}
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
