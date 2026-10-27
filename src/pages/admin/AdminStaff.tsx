import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, onSessionEnded, roleLabel, type Role } from '../../lib/authClient';

/**
 * /admin/staff - the staff account list.
 *
 * Every administrator can read it; only the super administrator may invite,
 * disable or edit. The server decides that (`requireSuperAdmin`), and it says
 * so in the list response through `canManage`, so this page shows the same rule
 * rather than a second opinion: without the flag the form is not rendered and
 * the action column is left out, and a direct request would still be refused.
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
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('content_manager');

  const [editing, setEditing] = useState<Staff | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<StaffRole>('content_manager');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/staff' },
    });
  }, [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await authRequest<{ staff: Staff[]; canManage?: boolean }>(
      '/api/admin/staff',
      { method: 'GET' },
    );
    if (signal?.aborted) return;
    if (!result.ok) {
      setError(result.failure.error);
      setLoading(false);
      return;
    }
    setStaff(result.data.staff);
    setCanManage(result.data.canManage === true);
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

  function openEdit(account: Staff) {
    setEditing(account);
    setEditName(account.name ?? '');
    setEditEmail(account.email);
    setEditRole(account.role as StaffRole);
    setEditError(null);
    setNotice(null);
    setError(null);
  }

  function closeEdit() {
    setEditing(null);
    setEditError(null);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;

    setSavingEdit(true);
    setEditError(null);
    const result = await authRequest<{ ok: boolean; message: string }>('/api/admin/staff-detail', {
      method: 'PATCH',
      body: { id: editing.id, name: editName, email: editEmail, role: editRole },
    });
    setSavingEdit(false);

    if (!result.ok) {
      setEditError(result.failure.fields?.email ?? result.failure.error);
      return;
    }

    setEditing(null);
    setNotice(result.data.message);
    await load();
    // Editing your own name leaves the shell's copy of the account stale.
    if (editing.id === user?.id) void refresh();
  }

  const isSelf = (account: Staff) => account.id === user?.id;

  return (
    <>
      <SEO title="Staff accounts | People Growth Africa" description="Manage staff accounts." />
      <AdminShell
        title="Staff accounts"
        subtitle={
          canManage
            ? 'New accounts receive a set-password link that expires in 24 hours. Each account holds one role.'
            : 'Who holds an account here. Only the super administrator can invite, disable or edit them.'
        }
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

        {canManage ? (
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
                className="inline-flex w-full min-h-[48px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-6 py-2.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:opacity-60 xl:w-auto"
              >
                {busy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
            <p className="mt-3 font-[family-name:var(--font-body)] text-[0.82rem] text-charcoal/55">
              Content managers can only create events, blog posts and announcements. They sign in on
              their own page and never see this panel.
            </p>
          </form>
        ) : (
          <p className="mb-2 rounded-[12px] border border-charcoal/12 bg-white/70 px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/70">
            You can see who has an account, but only the super administrator can invite, disable or
            edit one. Ask them if something here needs to change.
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-charcoal/10 bg-cream/60 text-[0.67rem] uppercase tracking-[0.12em] text-charcoal/50">
                  <th className="px-5 py-3.5 font-semibold">Name</th>
                  <th className="px-5 py-3.5 font-semibold">Email</th>
                  <th className="px-5 py-3.5 font-semibold">Role</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  {canManage && <th className="px-5 py-3.5 text-right font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={canManage ? 5 : 4}
                      className="px-5 py-10 text-center text-sm text-charcoal/50"
                    >
                      Loading staff…
                    </td>
                  </tr>
                ) : staff.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 5 : 4}
                      className="px-5 py-10 text-center text-sm text-charcoal/50"
                    >
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
                      {canManage && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {account.role === 'manager' ? (
                              // The form offers the four real roles only; a
                              // legacy row has to go through the migration.
                              <span
                                className="text-[0.78rem] text-charcoal/45"
                                title="Legacy manager role: run the role migration before editing"
                              >
                                Migrate first
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openEdit(account)}
                                className="inline-flex min-h-[38px] cursor-pointer items-center rounded-[8px] border border-charcoal/15 bg-white px-4 py-1.5 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-charcoal transition-colors hover:border-brand-green hover:bg-mint disabled:opacity-50"
                              >
                                {isSelf(account) ? 'Edit name' : 'Edit'}
                              </button>
                            )}
                            {isSelf(account) ? (
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
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminShell>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Close"
            onClick={closeEdit}
            className="absolute inset-0 h-full w-full cursor-default bg-charcoal/45"
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-edit-title"
            onSubmit={(event) => void saveEdit(event)}
            className="relative w-full max-w-[520px] rounded-[18px] border border-charcoal/10 bg-white p-6 shadow-elevated"
          >
            <h2
              id="staff-edit-title"
              className="font-[family-name:var(--font-heading)] text-[1.4rem] font-semibold text-charcoal"
            >
              Edit staff account
            </h2>
            <p className="mt-1.5 font-[family-name:var(--font-body)] text-[0.85rem] leading-relaxed text-charcoal/55">
              {isSelf(editing)
                ? 'You can change your own name. Your email and role stay as they are.'
                : 'Changing the email address sends a new set-password link. Any change signs the account out of its open sessions.'}
            </p>

            <div className="mt-5 space-y-4">
              <label className={labelClass}>
                Full name
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={100}
                  placeholder="Full name"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Email
                <input
                  type="email"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  required
                  maxLength={254}
                  disabled={isSelf(editing)}
                  className={`${inputClass} disabled:bg-cream/60 disabled:text-charcoal/55`}
                />
              </label>
              <label className={labelClass}>
                Role
                <select
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value as StaffRole)}
                  disabled={isSelf(editing)}
                  className={`${inputClass} disabled:bg-cream/60 disabled:text-charcoal/55`}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {editError && (
              <p
                role="alert"
                className="mt-4 rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-3.5 py-2.5 text-[0.85rem] text-terracotta"
              >
                {editError}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={closeEdit}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[10px] border border-charcoal/15 bg-white px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-charcoal hover:bg-cream"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[10px] border border-deep-green bg-deep-green px-6 py-2.5 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:opacity-60"
              >
                {savingEdit ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        </div>
      )}
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
  'min-h-[48px] w-full rounded-[10px] border border-charcoal/15 bg-white px-3.5 py-2.5 font-[family-name:var(--font-body)] text-[16px] font-normal text-charcoal placeholder:text-charcoal/35 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 lg:min-h-[44px] lg:text-[0.9rem]';
