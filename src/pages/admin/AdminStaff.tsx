import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, onSessionEnded, roleLabel, type Role } from '../../lib/authClient';

/**
 * /admin/staff - administrators create and disable staff accounts.
 *
 * Content managers are created here too, but they receive a content-desk
 * invitation and a content cookie; they never see this page or the data lists.
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

type StaffRole = 'admin' | 'project_manager' | 'hr_manager' | 'content_manager';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'content_manager', label: 'Content manager' },
  { value: 'project_manager', label: 'Project manager' },
  { value: 'hr_manager', label: 'HR manager' },
  { value: 'admin', label: 'Administrator' },
];

export default function AdminStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('content_manager');

  const { user } = useAuth();
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/staff' },
    });
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
      <SEO title="Staff accounts | People Growth Africa" description="Manage staff accounts." />
      <AdminShell
        title="Staff accounts"
        subtitle="New accounts receive a set-password link that expires in 24 hours. Each account holds one role."
      >
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-[12px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal"
          >
            {notice}
          </p>
        )}

        <form
          onSubmit={(event) => void create(event)}
          className="rounded-[16px] border border-charcoal/10 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:p-6"
        >
          <h2 className="mb-5 font-[family-name:var(--font-heading)] text-[1.45rem] font-semibold text-charcoal">
            Add a staff member
          </h2>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1.35fr_0.9fr_auto] xl:items-end">
            <label className={labelClass}>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                placeholder="Full name"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                placeholder="name@peoplegrowthafrica.com"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Role
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as StaffRole)}
                className={inputClass}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-6 py-2.5 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          <p className="mt-3 font-[family-name:var(--font-body)] text-[0.82rem] text-charcoal/55">
            Content managers can only create events, blog posts and announcements. They sign in on
            their own page and never see this panel.
          </p>
        </form>

        <div className="mt-5 overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-charcoal/10 bg-[#FAF8F3] text-[0.67rem] uppercase tracking-[0.12em] text-charcoal/50">
                  <th className="px-5 py-3.5 font-semibold">Name</th>
                  <th className="px-5 py-3.5 font-semibold">Email</th>
                  <th className="px-5 py-3.5 font-semibold">Role</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-charcoal/50">
                      Loading staff…
                    </td>
                  </tr>
                ) : staff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-charcoal/50">
                      No staff accounts yet.
                    </td>
                  </tr>
                ) : (
                  staff.map((account) => (
                    <tr
                      key={account.id}
                      className="border-b border-charcoal/[0.07] text-[0.9rem] text-charcoal last:border-0"
                    >
                      <td className={`px-5 py-4 ${account.name ? 'font-semibold' : 'text-charcoal/45'}`}>
                        {account.name ?? 'No name set'}
                      </td>
                      <td className="break-all px-5 py-4 text-charcoal/75">{account.email}</td>
                      <td className="px-5 py-4">
                        <RoleBadge role={account.role} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge account={account} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        {account.id === user?.id ? (
                          <span className="text-[0.82rem] text-charcoal/40">You</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setDisabled(account, !account.disabled_at)}
                            className={`inline-flex min-h-[38px] cursor-pointer items-center rounded-[8px] border px-5 py-1.5 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold transition-colors disabled:opacity-50 ${
                              account.disabled_at
                                ? 'border-brand-green/40 bg-white text-deep-green hover:bg-mint'
                                : 'border-red-200 bg-white text-red-600 hover:bg-red-50'
                            }`}
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
      </AdminShell>
    </>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const tone =
    role === 'content_manager'
      ? 'bg-[#F8E7D7] text-[#A3571F]'
      : role === 'project_manager'
        ? 'bg-[#E9EEF6] text-[#46658E]'
        : role === 'hr_manager'
          ? 'bg-[#F1E9DC] text-[#8B6A40]'
          : 'bg-mint text-deep-green';

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.75rem] font-medium ${tone}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function StatusBadge({ account }: { account: Staff }) {
  if (account.disabled_at) {
    return (
      <span className="inline-flex items-center gap-2 text-[0.82rem] text-charcoal/55">
        <span className="h-2 w-2 rounded-full bg-terracotta" aria-hidden="true" />
        Disabled
      </span>
    );
  }
  if (account.must_change_password) {
    return (
      <span className="inline-flex items-center gap-2 text-[0.82rem] text-charcoal/55">
        <span className="h-2 w-2 rounded-full bg-[#D9A441]" aria-hidden="true" />
        Invited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[0.82rem] text-charcoal/80">
      <span className="h-2 w-2 rounded-full bg-[#20A368]" aria-hidden="true" />
      Active
    </span>
  );
}

const labelClass =
  'flex flex-col gap-1.5 font-[family-name:var(--font-body)] text-[0.8rem] font-medium text-charcoal/70';

const inputClass =
  'min-h-[46px] w-full rounded-[10px] border border-charcoal/15 bg-white px-3.5 py-2.5 font-[family-name:var(--font-body)] text-[0.92rem] font-normal text-charcoal placeholder:text-charcoal/35 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20';
