import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import SEO from '../../components/SEO';
import { useAuth } from '../../hooks/useAuth';
import { authRequest } from '../../lib/authClient';

type Portal = 'admin' | 'content';

/**
 * /admin/set-password and /content/set-password
 *
 * Two entrances, one form: an invitation link carries a one-time token, and a
 * seeded or newly assigned account arrives signed in with `mustChangePassword`
 * set. The server decides whether the token or the current password is the
 * credential.
 */
export default function AdminSetPassword({ portal = 'admin' }: { portal?: Portal }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const inviteMode = token !== '';

  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const config =
    portal === 'content'
      ? {
          label: 'Content desk',
          login: '/content/login',
          home: '/content',
          description: 'Your content desk password is required before you can publish.',
        }
      : {
          label: 'Staff admin',
          login: '/admin/login',
          home: '/admin/stats',
          description: 'Your temporary password must be replaced before you can open the admin.',
        };

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }

    setBusy(true);
    const result = inviteMode
      ? await authRequest<{ ok: boolean }>('/api/auth/set-password', {
          body: { token, password },
        })
      : await authRequest<{ ok: boolean }>('/api/auth/change-password', {
          body: { currentPassword, password },
        });
    setBusy(false);

    if (!result.ok) {
      setError(result.failure.error);
      return;
    }

    setDone(true);
    if (!inviteMode) {
      await refresh();
      navigate(config.home, { replace: true });
    }
  }

  return (
    <>
      <SEO title="Set Password | People Growth Africa" description="Set your staff password." />
      <section className="min-h-screen bg-cream/50 pt-[130px] pb-20">
        <div className="mx-auto max-w-[520px] px-6">
          <div className="rounded-2xl border border-charcoal/10 bg-white p-6 sm:p-8">
            <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-brand-green">
              {config.label}
            </p>
            <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-charcoal">
              {inviteMode ? 'Choose your password' : 'Set a new password'}
            </h1>
            <p className="mt-2 text-sm text-charcoal/60">
              {inviteMode
                ? 'This invitation works once and expires 24 hours after it was sent.'
                : config.description}
            </p>

            {done ? (
              <div className="mt-6 rounded-xl border border-brand-green/30 bg-mint/50 p-4 text-sm text-charcoal">
                <p className="font-semibold">Your password is set.</p>
                <Link to={config.login} className="mt-2 inline-block font-semibold text-deep-green underline">
                  Sign in to {portal === 'content' ? 'the content desk' : 'the admin'}
                </Link>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                {!inviteMode && (
                  <label className="block text-sm font-semibold text-charcoal">
                    Current password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                      className="mt-1 w-full rounded-[10px] border border-charcoal/20 px-3 py-2.5 font-normal focus:border-brand-green focus:outline-none"
                    />
                  </label>
                )}
                <label className="block text-sm font-semibold text-charcoal">
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    maxLength={128}
                    required
                    className="mt-1 w-full rounded-[10px] border border-charcoal/20 px-3 py-2.5 font-normal focus:border-brand-green focus:outline-none"
                  />
                  <span className="mt-1 block text-xs font-normal text-charcoal/50">
                    At least 8 characters.
                  </span>
                </label>
                <label className="block text-sm font-semibold text-charcoal">
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                    className="mt-1 w-full rounded-[10px] border border-charcoal/20 px-3 py-2.5 font-normal focus:border-brand-green focus:outline-none"
                  />
                </label>

                {error && (
                  <p role="alert" className="rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-3 py-2 text-sm text-terracotta">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[44px] w-full rounded-full bg-deep-green px-6 py-3 text-sm font-semibold text-white hover:bg-terracotta disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Save password'}
                </button>
                {!inviteMode && user && (
                  <Link to={config.login} className="block text-center text-xs text-charcoal/50 underline">
                    Sign in as someone else
                  </Link>
                )}
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
