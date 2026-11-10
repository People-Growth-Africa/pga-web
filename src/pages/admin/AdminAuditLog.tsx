import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AdminShell from '../../components/admin/AdminShell';
import SEO from '../../components/SEO';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, NETWORK_FAILURE, onSessionEnded } from '../../lib/authClient';

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type AuditPage = { rows: AuditRow[]; total: number; page: number; pageSize: number };
type Filters = { from: string; to: string; actor: string; role: string; action: string; entityType: string };

const EMPTY_FILTERS: Filters = { from: '', to: '', actor: '', role: '', action: '', entityType: '' };
const inputClass = 'min-h-[42px] w-full rounded-[9px] border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-charcoal/65';

function formatDiff(value: Record<string, unknown> | null): string {
  if (!value) return '—';
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`)
    .join('\n');
}

export default function AdminAuditLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canExport = user?.isSuperAdmin === true;
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(applied)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [applied, page]);

  const endSession = useCallback(
    () => navigate('/admin/login?expired=1', { replace: true }),
    [navigate],
  );
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  useEffect(() => {
    let active = true;
    void authRequest<AuditPage>(`/api/admin/audit-log?${queryString}`, { method: 'GET' }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.failure.error);
        return;
      }
      setData(result.data);
      setError(null);
    });
    return () => {
      active = false;
    };
  }, [queryString]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(applied)) {
        if (value) params.set(key, value);
      }
      const response = await fetch(`/api/admin/audit-log-export?${params}`, { credentials: 'include' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'The audit export could not be prepared.');
        if (response.status === 401) endSession();
        return;
      }
      const url = window.URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      setError(NETWORK_FAILURE.error);
    } finally {
      setExporting(false);
    }
  }

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)));

  return (
    <>
      <SEO title="Audit log | People Growth Africa" description="Staff action audit log." />
      <AdminShell
        title="Audit log"
        subtitle="Staff actions, newest first. Times are shown in Lagos time; hover a timestamp for UTC."
        actions={canExport ? (
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || loading}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-5 py-2 font-[family-name:var(--font-body)] text-sm font-semibold text-white hover:bg-terracotta disabled:opacity-60"
          >
            {exporting ? 'Preparing CSV…' : 'Export CSV'}
          </button>
        ) : null}
      >
        {error && <p role="alert" className="mb-5 rounded-xl border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">{error}</p>}

        <form
          className="mb-5 grid gap-3 rounded-2xl border border-charcoal/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = { ...filters };
            if (page !== 1 || JSON.stringify(applied) !== JSON.stringify(next)) setLoading(true);
            setPage(1);
            setApplied(next);
          }}
        >
          <label className={labelClass}>From<input className={inputClass} type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label className={labelClass}>To<input className={inputClass} type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          <label className={labelClass}>Account email<input className={inputClass} value={filters.actor} onChange={(event) => setFilters({ ...filters, actor: event.target.value })} /></label>
          <label className={labelClass}>Role<select className={inputClass} value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">All roles</option><option value="admin">Administrator</option><option value="project_manager">Project manager</option><option value="hr_manager">HR manager</option><option value="content_manager">Content manager</option><option value="data_admin">Data administrator</option></select></label>
          <label className={labelClass}>Action<input className={inputClass} value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="e.g. content.publish" /></label>
          <label className={labelClass}>Record type<input className={inputClass} value={filters.entityType} onChange={(event) => setFilters({ ...filters, entityType: event.target.value })} placeholder="e.g. post" /></label>
          <button className="min-h-[42px] self-end rounded-[9px] border-0 bg-deep-green px-4 py-2 text-sm font-semibold text-white hover:bg-terracotta sm:col-span-2 lg:col-span-3 lg:justify-self-start" type="submit">Apply filters</button>
        </form>

        <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-cream/70 text-xs uppercase tracking-wide text-charcoal/60">
              <tr><th className="px-4 py-3">Date and time</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {loading ? <tr><td className="px-4 py-8 text-center text-charcoal/50" colSpan={6}>Loading audit log…</td></tr>
                : !data?.rows.length ? <tr><td className="px-4 py-8 text-center text-charcoal/50" colSpan={6}>No audit entries match these filters.</td></tr>
                  : data.rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-charcoal/70"><time dateTime={row.created_at} title={row.created_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(row.created_at))}</time></td>
                      <td className="px-4 py-3">{row.actor_email ?? 'Unknown account'}</td>
                      <td className="px-4 py-3">{row.actor_role ?? '—'}</td>
                      <td className="px-4 py-3 font-medium">{row.action}</td>
                      <td className="px-4 py-3">{row.entity_label ?? row.entity_id ?? row.entity_type}</td>
                      <td className="px-4 py-3"><details><summary className="cursor-pointer font-semibold text-deep-green">Show</summary><div className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><p className="whitespace-pre-wrap"><strong>Before</strong>{'\n'}{formatDiff(row.before)}</p><p className="whitespace-pre-wrap"><strong>After</strong>{'\n'}{formatDiff(row.after)}</p></div></details></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-charcoal/65">
          <span>{data?.total ?? 0} entries · Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="min-h-[40px] rounded-lg border border-charcoal/15 bg-white px-4 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= pages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="min-h-[40px] rounded-lg border border-charcoal/15 bg-white px-4 disabled:opacity-40">Next</button>
          </div>
        </div>
      </AdminShell>
    </>
  );
}
