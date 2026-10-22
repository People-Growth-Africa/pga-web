import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, type AuthUser } from '../../lib/authClient';
import { AUTH_ENABLED } from '../../config/signup-links';

/**
 * The sign-in page for the content admin, at /admin/login.
 *
 * It exists because the public site deliberately keeps its account screens
 * closed: `accountScreensOpen` answers false for peoplegrowthafrica.com, so
 * `/auth` shows the coming soon page there and a manager had no way in from the
 * live site. This page is the narrow door - one email field, one password field,
 * no signup - and it never appears in the public navigation.
 *
 * It decides nothing on its own. The password is checked by /api/auth/login, the
 * manager role is checked again by RequireAuth on /admin/content, and every
 * admin endpoint repeats that check server-side. A talent or employer account
 * that signs in here is signed straight back out rather than left holding a
 * session on a page it cannot use.
 */
export default function ManagerLogin() {
  const { status, user, setUser, signOut } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!AUTH_ENABLED) {
    return <Navigate to="/" replace />;
  }

  // Already signed in as a manager: there is nothing to do on this page.
  if (status === 'signedIn' && user?.role === 'manager') {
    return <Navigate to="/admin/content" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const result = await authRequest<{ user: AuthUser; redirect?: string }>('/api/auth/login', {
      body: { email: email.trim(), password },
    });

    if (!result.ok) {
      setSubmitting(false);
      setFormError(result.failure.error);
      return;
    }

    if (result.data.user.role !== 'manager') {
      // A valid account, just not this one. Clear the cookie so the visitor is
      // not left signed in as somebody who cannot reach the panel.
      await signOut();
      setSubmitting(false);
      setFormError('That account is not a manager account, so it cannot open the content admin.');
      return;
    }

    setUser(result.data.user);
    navigate(result.data.redirect ?? '/admin/content', { replace: true });
  }

  return (
    <section className="bg-cream min-h-screen relative">
      <div className="absolute inset-x-0 top-0 h-[100px] bg-deep-green" aria-hidden="true" />

      <div className="relative max-w-[520px] mx-auto px-5 md:px-6 pt-[140px] pb-[80px]">
        <div className="rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-6 py-8 md:px-9 md:py-9">
          <p className="font-[family-name:var(--font-body)] text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-brand-green mb-2">
            People Growth Africa
          </p>
          <h1 className="font-[family-name:var(--font-heading)] text-[1.7rem] md:text-[2rem] font-semibold text-charcoal leading-[1.2] mb-2">
            Content admin
          </h1>
          <p className="font-[family-name:var(--font-body)] text-sm text-charcoal/65 leading-relaxed mb-7">
            For the People Growth Africa team. Sign in with your manager account to write, publish and
            unpublish posts and events.
          </p>

          {formError && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal"
            >
              {formError}
            </p>
          )}

          {user && user.role !== 'manager' && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-charcoal/15 bg-cream px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal/75"
            >
              Signed in as {user.email}, which is not a manager account.{' '}
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
                htmlFor="manager-email"
                className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1.5"
              >
                Email
              </label>
              <input
                id="manager-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@peoplegrowthafrica.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-xl border border-charcoal/20 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-base text-charcoal placeholder:text-charcoal/40 transition-colors motion-reduce:transition-none focus:border-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-1"
              />
            </div>

            <div className="mb-5">
              <label
                htmlFor="manager-password"
                className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1.5"
              >
                Password
              </label>
              <input
                id="manager-password"
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
            Not on the team?{' '}
            <Link to="/" className="font-semibold text-deep-green underline underline-offset-2">
              Back to the site
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
