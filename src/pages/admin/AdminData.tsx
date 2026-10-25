import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, isAdminRole, NETWORK_FAILURE, onSessionEnded } from '../../lib/authClient';

/**
 * /admin/data - all three data lists in one page, because a staff member
 * checking today's signups should not have to open three screens.
 *
 * The table, the count, the search and the export all use the same server side
 * filters. The browser never receives more than one page except when it asks for
 * the CSV, which the server caps and audits.
 */

type DataType = 'registrations' | 'subscriptions' | 'consultations';
type Row = Record<string, string | null>;
type DataResponse = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  events?: { event_slug: string; total: number }[];
};

const TABS: { value: DataType; label: string }[] = [
  { value: 'registrations', label: 'Event registrations' },
  { value: 'subscriptions', label: 'Email subscriptions' },
  { value: 'consultations', label: 'Consultation bookings' },
];

const COLUMNS: Record<DataType, { key: string; label: string }[]> = {
  registrations: [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'organization', label: 'Organization' },
    { key: 'notes', label: 'Notes' },
    { key: 'event_slug', label: 'Event' },
    { key: 'created_at', label: 'Registered' },
  ],
  subscriptions: [
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
    { key: 'source', label: 'Source' },
    { key: 'created_at', label: 'Subscribed' },
  ],
  consultations: [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'organisation', label: 'Organisation' },
    { key: 'service', label: 'Service' },
    { key: 'meeting_format', label: 'Format' },
    { key: 'preferred_date', label: 'Preferred date' },
    { key: 'preferred_slot', label: 'Slot' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Booked' },
  ],
};

const PAGE_SIZE = 25;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminData() {
  const [type, setType] = useState<DataType>('registrations');
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<{ event_slug: string; total: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', { replace: true });
  }, [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      params.set('type', type);
      params.set('page', String(extra.page ?? page));
      if (search) params.set('search', search);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (type === 'registrations' && eventSlug) params.set('event', eventSlug);
      return params;
    },
    [type, page, search, from, to, eventSlug],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await authRequest<DataResponse>(`/api/admin/data?${query().toString()}`, {
        method: 'GET',
      });
      if (signal?.aborted) return;
      if (!result.ok) {
        setError(result.failure.error);
        setLoading(false);
        return;
      }
      setRows(result.data.rows);
      setTotal(result.data.total);
      setEvents(result.data.events ?? []);
      setError(null);
      setLoading(false);
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/data-export?${query().toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'The export could not be prepared. Try again.');
        if (response.status === 401) endSession();
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      setError(NETWORK_FAILURE.error);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const columns = COLUMNS[type];

  return (
    <>
      <SEO title="Data | People Growth Africa" description="Staff data lists and CSV export." />
      <section className="min-h-screen bg-cream/50 pt-[130px] pb-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-charcoal/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[0.82rem] text-charcoal/70">
              Signed in as <span className="font-semibold text-charcoal break-all">{user?.email}</span>
              <span className="mt-0.5 block text-[0.72rem] text-charcoal/45">
                This is personal data. Do not share these lists outside the team.
              </span>
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link to="/admin/stats" className="min-h-[40px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-cream">
                ← Dashboard
              </Link>
              {isAdminRole(user?.role) && (
                <Link to="/admin/content" className="min-h-[40px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-cream">
                  Content
                </Link>
              )}
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-wider text-brand-green">Staff</p>
              <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-charcoal sm:text-4xl">Data</h1>
              <p className="mt-2 text-charcoal/60">Newest first, 25 per page.</p>
            </div>
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={exporting || loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-deep-green px-6 py-3 text-sm font-semibold text-white hover:bg-terracotta disabled:opacity-60"
            >
              {exporting ? 'Preparing CSV…' : 'Export CSV'}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-charcoal/15 bg-white p-1">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setType(tab.value);
                  setPage(1);
                  setEventSlug('');
                }}
                className={`min-h-[38px] rounded-full px-3 py-2 text-xs font-semibold sm:text-sm ${
                  type === tab.value ? 'bg-deep-green text-white' : 'text-charcoal/70 hover:bg-cream'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-5 grid gap-3 rounded-2xl border border-charcoal/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
              Search
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search…"
                className="w-full rounded-[10px] border border-charcoal/20 px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
              From
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-[10px] border border-charcoal/20 px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
              To
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-[10px] border border-charcoal/20 px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
              />
            </label>
            {type === 'registrations' ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-charcoal/70">
                Event
                <select
                  value={eventSlug}
                  onChange={(event) => {
                    setEventSlug(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-[10px] border border-charcoal/20 bg-white px-3 py-2 text-sm font-normal focus:border-brand-green focus:outline-none"
                >
                  <option value="">All events</option>
                  {events.map((event) => (
                    <option key={event.event_slug} value={event.event_slug}>
                      {event.event_slug} ({event.total})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="hidden lg:block" />
            )}
          </div>

          {error && (
            <p role="alert" className="mb-5 rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
              {error}
            </p>
          )}

          <p className="mb-3 text-xs font-semibold text-charcoal/60">
            {total} {total === 1 ? 'row' : 'rows'} match the current filters.
          </p>

          <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-charcoal/10 bg-cream/60 text-[0.72rem] uppercase tracking-wider text-charcoal/60">
                    {columns.map((column) => (
                      <th key={column.key} className="px-4 py-3 font-semibold">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-charcoal/50">Loading…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-charcoal/50">Nothing matches these filters yet.</td></tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr key={`${row.email ?? 'row'}-${index}`} className="border-b border-charcoal/5 align-top text-sm text-charcoal last:border-0">
                        {columns.map((column) => (
                          <td key={column.key} className={`px-4 py-3 ${column.key === 'email' ? 'break-all' : ''} ${column.key === 'notes' ? 'max-w-[260px] whitespace-pre-wrap break-words text-charcoal/70' : ''}`}>
                            {column.key === 'created_at'
                              ? formatDate(row[column.key])
                              : row[column.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-charcoal/55">
              {total === 0 ? 'No rows' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="min-h-[38px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold hover:bg-cream disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-charcoal/60">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className="min-h-[38px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold hover:bg-cream disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
