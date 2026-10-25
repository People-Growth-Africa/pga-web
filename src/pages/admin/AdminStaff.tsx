import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, onSessionEnded, type Role } from '../../lib/authClient';

/**
 * /admin/staff - administrators create and disable staff accounts.
 *
 * The page is reachable only from an admin session, and `/api/admin/staff`
 * enforces the same rule again. A new account gets a one-time link; no password
 * is ever chosen or shown here.
 */

type Staff = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  disabled_at: string | null;
  must_change_password: boolean;
  created_at: string;
};

const ROLE_OPTIONS: { value: 'admin' | 'project_manager' | 'hr_manager'; label: string }[] = [
  { value: 'project_manager', label: 'Project manager' },
  { value: 'hr_manager', label: 'HR manager' },
  { value: 'admin', label: 'Administrator' },
];

function roleLabel(role: Role): string {
  if (role === 'admin' || role === 'manager') return 'Administrator';
  if (role === 'project_manager') return 'Project manager';
  if (role === 'hr_manager') return 'HR manager';
  return role;
}

export default function AdminStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'project_manager' | 'hr_manager'>('project_manager');

  const { user } = useAuth();
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', { replace: true });
  }, [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await authRequest<{ staff: Staff[] }>('/api/admin/staff', { method: 'GET' });
    if (signal?.aborted) return;
    if (!result.ok) {
      setError(result.failure.error);
      setLoading(false);
      return;
    }
    setStaff(result.data.staff);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await authRequest<{ ok: boolean; emailSent: boolean; message: string }>(
      '/api/admin/staff',
      { body: { name, email, role } },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setNotice(result.data.message);
    setName('');
    setEmail('');
    await load();
  }

  async function setDisabled(account: Staff, disabled: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await authRequest<{ ok: boolean }>('/api/admin/staff', {
      method: 'PATCH',
      body: { id: account.id, disabled },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    await load();
  }

  return (
    <>
      <SEO title="Staff | People Growth Africa" description="Manage staff accounts." />
      <section className="min-h-screen bg-cream/50 pt-[130px] pb-20">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-charcoal/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[0.82rem] text-charcoal/70">
              Signed in as <span className="font-semibold text-charcoal break-all">{user?.email}</span>
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link to="/admin/stats" className="min-h-[40px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-cream">
                ← Dashboard
              </Link>
              <Link to="/admin/data" className="min-h-[40px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-cream">
                Data
              </Link>
            </div>
          </div>

          <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-wider text-brand-green">Administrator</p>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-charcoal sm:text-4xl">Staff accounts</h1>
          <p className="mt-2 text-charcoal/60">
            New accounts receive a set-password link that expires in 24 hours.
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">{error}</p>
          )}
          {notice && (
            <p role="status" className="mt-5 rounded-[10px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal">{notice}</p>
          )}

          <form onSubmit={(event) => void create(event)} className="mt-6 grid gap-3 rounded-2xl border border-charcoal/10 bg-white p-4 sm:grid-cols-4 sm:items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                className="rounded-[10px] border border-charcoal/20 px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                className="rounded-[10px] border border-charcoal/20 px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
              Role
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
                className="rounded-[10px] border border-charcoal/20 bg-white px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[40px] rounded-full bg-deep-green px-5 py-2 text-sm font-semibold text-white hover:bg-terracotta disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-charcoal/10 bg-cream/60 text-[0.72rem] uppercase tracking-wider text-charcoal/60">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-charcoal/50">Loading staff…</td></tr>
                  ) : (
                    staff.map((account) => (
                      <tr key={account.id} className="border-b border-charcoal/5 text-sm text-charcoal last:border-0">
                        <td className="px-4 py-3 font-semibold">{account.name ?? '—'}</td>
                        <td className="px-4 py-3 break-all">{account.email}</td>
                        <td className="px-4 py-3">{roleLabel(account.role)}</td>
                        <td className="px-4 py-3">
                          {account.disabled_at ? (
                            <span className="text-terracotta">Disabled</span>
                          ) : account.must_change_password ? (
                            <span className="text-charcoal/60">Invited, password not set</span>
                          ) : (
                            <span className="text-deep-green">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {account.id === user?.id ? (
                            <span className="text-xs text-charcoal/40">You</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setDisabled(account, !account.disabled_at)}
                              className="rounded-full border border-charcoal/20 px-3 py-1.5 text-xs font-semibold hover:bg-cream disabled:opacity-50"
                            >
                              {account.disabled_at ? 'Enable' : 'Disable'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
