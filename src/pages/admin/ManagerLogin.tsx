import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import SEO from '../../components/SEO';
import { useAuth } from '../../hooks/useAuth';
import {
  ADMIN_PORTAL_ROLES,
  authRequest,
  dashboardPath,
  isContentManagerRole,
  type AuthUser,
  type Role,
} from '../../lib/authClient';
import { AUTH_ENABLED } from '../../config/signup-links';

type Portal = 'admin' | 'content';

const PORTAL = {
  admin: {
    endpoint: '/api/admin/login',
    home: '/admin/stats',
    loginPath: '/admin/login',
    passwordPath: '/admin/set-password',
    title: 'Admin sign in',
    kicker: 'Staff',
    description:
      'For administrators, project managers, HR managers and data administrators. Content managers sign in from their own page.',
    emailPlaceholder: 'name@peoplegrowthafrica.com',
  },
  content: {
    endpoint: '/api/content/login',
    home: '/content',
    loginPath: '/content/login',
    passwordPath: '/content/set-password',
    title: 'Content manager sign in',
    kicker: 'Content desk',
    description:
      'Write, publish and update blog posts and events. Administrators use the admin sign-in instead.',
    emailPlaceholder: 'name@peoplegrowthafrica.com',
  },
} as const;

function belongsToPortal(role: Role | undefined, portal: Portal): boolean {
  if (portal === 'content') return isContentManagerRole(role);
  return role !== undefined && ADMIN_PORTAL_ROLES.includes(role);
}

/**
 * The sign-in for one staff portal.
 *
 * `/admin/login` signs administrators and the project/HR team in; `/content/login`
 * signs content managers in. They post to different endpoints, receive different
 * cookies and cannot borrow each other's role. The endpoint is the real check;
 * this page only chooses which door the visitor is standing at.
 */
export default function ManagerLogin({ portal = 'admin' }: { portal?: Portal }) {
  const config = PORTAL[portal];
  const { status, user, setUser, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = new URLSearchParams(location.search).get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Set as soon as a sign-in succeeds, before the context update re-renders
  // this page. Without it, the exiting login screen sees `status === 'signedIn'`
  // during its AnimatePresence exit and redirects to the portal home, overriding
  // the navigation to the page the person was originally trying to open.
  const [justSignedIn, setJustSignedIn] = useState(false);

  const emailId = portal === 'admin' ? 'manager-email' : 'content-email';
  const passwordId = portal === 'admin' ? 'manager-password' : 'content-password';

  const from = (location.state as { from?: string } | null)?.from;
  const allowedFrom =
    from && (portal === 'content' ? from.startsWith('/content') : from.startsWith('/admin/'))
      ? from
      : null;

  useEffect(() => {
    if (expired) void refresh();
  }, [expired, refresh]);

  if (!AUTH_ENABLED) {
    return <Navigate to="/" replace />;
  }

  // Already signed in at the right door: there is nothing to do here. A person
  // who arrived from a guarded page goes back to it rather than to the home.
  if (!justSignedIn && !expired && status === 'signedIn' && belongsToPortal(user?.role, portal)) {
    return (
      <Navigate
        to={user?.mustChangePassword ? config.passwordPath : (allowedFrom ?? config.home)}
        replace
      />
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const result = await authRequest<{ user: AuthUser; redirect?: string }>(config.endpoint, {
      body: { email: email.trim(), password },
    });

    if (!result.ok) {
      setSubmitting(false);
      setFormError(result.failure.error);
      return;
    }

    setJustSignedIn(true);
    setUser(result.data.user);
    navigate(allowedFrom ?? result.data.redirect ?? config.home, { replace: true });
  }

  const wrongDoorHome =
    user && user.role !== 'talent' && user.role !== 'employer'
      ? dashboardPath(user.role)
      : '/';

  return (
    <>
      <SEO title={`${config.title} | People Growth Africa`} description={config.description} />
      <section className="bg-cream min-h-screen relative">
        <div className="absolute inset-x-0 top-0 h-[100px] bg-deep-green" aria-hidden="true" />

        <div className="relative max-w-[520px] mx-auto px-5 md:px-6 pt-[140px] pb-[80px]">
          <div className="rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-6 py-8 md:px-9 md:py-9">
            <p className="font-[family-name:var(--font-body)] text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-brand-green mb-2">
              People Growth Africa · {config.kicker}
            </p>
            <h1 className="font-[family-name:var(--font-heading)] text-[1.7rem] md:text-[2rem] font-semibold text-charcoal leading-[1.2] mb-2">
              {config.title}
            </h1>
            <p className="font-[family-name:var(--font-body)] text-sm text-charcoal/65 leading-relaxed mb-7">
              {config.description}
            </p>

            {expired && !formError && (
              <p
                role="status"
                className="mb-5 rounded-xl border border-charcoal/15 bg-cream px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal/75"
              >
                Your session ended. The panel signs out after 30 minutes with no activity, and after 8
                hours at most. Sign in again to carry on.
              </p>
            )}

            {formError && (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal"
              >
                {formError}
              </p>
            )}

            {user && !belongsToPortal(user.role, portal) && (
              <p
                role="status"
                className="mb-5 rounded-xl border border-charcoal/15 bg-cream px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal/75"
              >
                Signed in as {user.email}, which uses the other staff door.{' '}
                {wrongDoorHome !== '/' && (
                  <Link to={wrongDoorHome} className="font-semibold text-deep-green underline">
                    Open it
                  </Link>
                )}{' '}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="font-semibold text-deep-green underline decoration-brand-green/60 underline-offset-2 cursor-pointer"
                >
                  Sign out
                </button>
              </p>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label
                  htmlFor={emailId}
                  className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1.5"
                >
                  Email
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={config.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-charcoal/20 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-base text-charcoal placeholder:text-charcoal/40 transition-colors motion-reduce:transition-none focus:border-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-1"
                />
              </div>

              <div className="mb-5">
                <label
                  htmlFor={passwordId}
                  className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1.5"
                >
                  Password
                </label>
                <input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-charcoal/20 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-base text-charcoal placeholder:text-charcoal/40 transition-colors motion-reduce:transition-none focus:border-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-1"
                />
                <p className="mt-2 font-[family-name:var(--font-body)] text-xs text-charcoal/60">
                  <Link
                    to="/forgot-password"
                    className="font-semibold text-deep-green underline decoration-brand-green/60 underline-offset-2"
                  >
                    Forgot your password?
                  </Link>
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-deep-green px-6 py-3.5 font-[family-name:var(--font-body)] text-sm font-semibold text-white transition-colors hover:bg-brand-green disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
              >
                {submitting ? 'Signing in…' : 'Log in'}
              </button>
            </form>

            <p className="mt-6 font-[family-name:var(--font-body)] text-xs text-charcoal/50">
              {portal === 'admin' ? (
                <>
                  Content manager?{' '}
                  <Link to="/content/login" className="font-semibold text-deep-green underline underline-offset-2">
                    Use the content desk
                  </Link>
                </>
              ) : (
                <>
                  Administrator?{' '}
                  <Link to="/admin/login" className="font-semibold text-deep-green underline underline-offset-2">
                    Use the admin sign-in
                  </Link>
                </>
              )}
              {' · '}
              <Link to="/" className="font-semibold text-deep-green underline underline-offset-2">
                Back to the site
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
