import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { authRequest, roleLabel, type Role } from '../../lib/authClient';

type Session = {
  id: string;
  portal: 'public' | 'admin' | 'content';
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  current?: boolean;
};

type LoginEvent = {
  id: string;
  email_attempted: string;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

type SecurityData = {
  sessions: Session[];
  loginEvents: LoginEvent[];
  staff?: { id: string; name: string | null; email: string; role: Role };
};

function localDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });
}

export default function AdminSecurity() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = searchParams.get('userId');
  const managingAccount = location.pathname === '/admin/security' && Boolean(userId);
  const contentPortal = location.pathname.startsWith('/content/');
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const url = managingAccount
      ? `/api/admin/security?userId=${encodeURIComponent(userId ?? '')}`
      : '/api/auth/security';
    const result = await authRequest<SecurityData>(url, { method: 'GET' });
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.failure.error);
    }
  }, [managingAccount, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSessions = useMemo(
    () => (data?.sessions ?? []).filter((item) => !item.revoked_at && Date.parse(item.expires_at) > Date.now()),
    [data],
  );

  async function revoke(sessionId: string) {
    setBusy(true);
    const result = await authRequest('/api/auth/security', {
      method: 'PATCH',
      body: { sessionId },
    });
    setBusy(false);
    if (result.ok) {
      if (data?.sessions.find((item) => item.id === sessionId)?.current) {
        navigate(contentPortal ? '/content/login?expired=1' : '/admin/login?expired=1', { replace: true });
      } else {
        await load();
      }
    }
    else setError(result.failure.error);
  }

  async function signOutEverywhere() {
    setBusy(true);
    const result = await authRequest<{ redirect?: string }>('/api/auth/logout-all', { method: 'POST' });
    setBusy(false);
    if (result.ok) navigate(result.data.redirect ?? '/admin/login', { replace: true });
    else setError(result.failure.error);
  }

  async function forceSignOut() {
    if (!userId) return;
    setBusy(true);
    const result = await authRequest('/api/admin/security', {
      method: 'POST',
      body: { userId },
    });
    setBusy(false);
    if (result.ok) await load();
    else setError(result.failure.error);
  }

  return (
    <>
      <SEO title="My security | People Growth Africa" description="Review active sessions and recent logins." />
      <AdminShell
        portal={contentPortal ? 'content' : 'admin'}
        title={managingAccount ? 'Staff security' : 'My security'}
        subtitle={managingAccount && data?.staff
          ? `${data.staff.email} · ${roleLabel(data.staff.role)}`
          : 'Review your active sessions and recent sign-ins.'}
        actions={managingAccount ? (
          <button type="button" onClick={() => void forceSignOut()} disabled={busy}
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
            Sign out this account everywhere
          </button>
        ) : (
          <button type="button" onClick={() => void signOutEverywhere()} disabled={busy}
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
            Sign out everywhere
          </button>
        )}
      >
        {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {!data && !error ? <p className="py-12 text-center text-charcoal/55">Loading security details…</p> : null}
        {data && (
          <>
            <section className="mb-8 rounded-2xl border border-charcoal/10 bg-white p-5 sm:p-7">
              <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">Active sessions</h2>
              {activeSessions.length ? (
                <ul className="mt-4 divide-y divide-charcoal/10">
                  {activeSessions.map((item) => (
                    <li key={item.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <p className="font-semibold text-charcoal">
                          {item.portal} portal {item.current ? <span className="ml-2 text-xs text-[#0B4B3C]">(current)</span> : null}
                        </p>
                        <p className="mt-1 break-all text-sm text-charcoal/65">{item.user_agent || 'Unknown device'} · IP {item.ip || 'unavailable'}</p>
                        <p className="mt-1 text-xs text-charcoal/50">Last active {localDate(item.last_seen_at)}</p>
                      </div>
                      {!managingAccount && (
                        <button type="button" onClick={() => void revoke(item.id)} disabled={busy}
                          className="self-start rounded-full border border-charcoal/20 px-4 py-2 text-sm font-semibold text-charcoal disabled:opacity-50">
                          Revoke
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-charcoal/60">No active sessions.</p>}
            </section>

            <section className="rounded-2xl border border-charcoal/10 bg-white p-5 sm:p-7">
              <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">Recent login history</h2>
              {data.loginEvents.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead><tr className="border-b border-charcoal/10 text-xs uppercase tracking-wide text-charcoal/55">
                      <th className="py-3 pr-4">Date and time</th><th className="py-3 pr-4">Result</th><th className="py-3 pr-4">IP</th><th className="py-3">Device</th>
                    </tr></thead>
                    <tbody>{data.loginEvents.map((event) => (
                      <tr key={event.id} className="border-b border-charcoal/[0.07] last:border-0">
                        <td className="py-3 pr-4">{localDate(event.created_at)}</td>
                        <td className={`py-3 pr-4 font-semibold ${event.success ? 'text-[#0B4B3C]' : 'text-red-700'}`}>{event.success ? 'Successful' : 'Failed'}</td>
                        <td className="py-3 pr-4">{event.ip || '—'}</td>
                        <td className="py-3">{event.user_agent || 'Unknown'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="mt-4 text-sm text-charcoal/60">No login events recorded yet.</p>}
            </section>
          </>
        )}
      </AdminShell>
    </>
  );
}
