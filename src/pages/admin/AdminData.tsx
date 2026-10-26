import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { authRequest, NETWORK_FAILURE, onSessionEnded } from '../../lib/authClient';

/**
 * /admin/data - all three personal-data lists in one screen.
 *
 * The table, count, search and export all use the same server-side filters. The
 * browser never receives more than one page except when it asks for the CSV,
 * which the server caps, audits and marks no-store.
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

const TABS: { value: DataType; label: string; search: string }[] = [
  { value: 'registrations', label: 'Event registrations', search: 'Name or email' },
  { value: 'subscriptions', label: 'Email subscriptions', search: 'Email' },
  { value: 'consultations', label: 'Consultation bookings', search: 'Name or email' },
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

function formatDateParts(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: '' };
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
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

  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/data' },
    });
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
  const allRegistrations = useMemo(
    () => events.reduce((sum, item) => sum + item.total, 0),
    [events],
  );
  const activeTab = TABS.find((tab) => tab.value === type) ?? TABS[0];

  return (
    <>
      <SEO title="Data | People Growth Africa" description="Staff data lists and CSV export." />
      <AdminShell
        title="Data"
        subtitle="Newest first, 25 per page. This is personal data, do not share it outside the team."
        actions={
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || loading}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-6 py-2.5 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:opacity-60"
          >
            {exporting ? 'Preparing CSV…' : 'Export CSV'}
          </button>
        }
      >
        <div className="mb-5 flex flex-wrap gap-x-7 gap-y-2 border-b border-charcoal/15">
          {TABS.map((tab) => {
            const active = type === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setType(tab.value);
                  setPage(1);
                  setEventSlug('');
                }}
                className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-0 pb-3 font-[family-name:var(--font-body)] text-[0.92rem] font-semibold transition-colors ${
                  active
                    ? 'border-deep-green text-deep-green'
                    : 'border-transparent text-charcoal/55 hover:text-charcoal'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mb-5 rounded-[16px] border border-charcoal/10 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:p-5">
          <div
            className={`grid gap-4 ${
              type === 'registrations'
                ? 'lg:grid-cols-[1.35fr_0.8fr_0.8fr_1.1fr]'
                : 'lg:grid-cols-[1.5fr_0.8fr_0.8fr]'
            }`}
          >
            <label className={labelClass}>
              Search
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={activeTab.search}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              From
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                placeholder="mm/dd/yyyy"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              To
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                placeholder="mm/dd/yyyy"
                className={inputClass}
              />
            </label>
            {type === 'registrations' && (
              <label className={labelClass}>
                Event
                <select
                  value={eventSlug}
                  onChange={(event) => {
                    setEventSlug(event.target.value);
                    setPage(1);
                  }}
                  className={inputClass}
                >
                  <option value="">All events</option>
                  {events.map((event) => (
                    <option key={event.event_slug} value={event.event_slug}>
                      {event.event_slug}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
          >
            {error}
          </p>
        )}

        <p className="mb-3 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/55">
          {type === 'registrations'
            ? `${total} ${total === 1 ? 'row' : 'rows'} match the current filters${
                allRegistrations > 0 ? ` · ${allRegistrations} registrations across events` : ''
              }.`
            : `${total} ${total === 1 ? 'row' : 'rows'} match the current filters.`}
        </p>

        <div className="overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-charcoal/10 bg-[#FAF8F3] text-[0.66rem] uppercase tracking-[0.12em] text-charcoal/50">
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-3.5 font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-charcoal/50">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-charcoal/50">
                      Nothing matches these filters yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr
                      key={`${row.email ?? 'row'}-${index}`}
                      className="border-b border-charcoal/[0.07] align-top text-[0.88rem] text-charcoal last:border-0"
                    >
                      {columns.map((column) => {
                        if (column.key === 'created_at') {
                          const parts = formatDateParts(row[column.key]);
                          return (
                            <td key={column.key} className="whitespace-nowrap px-4 py-4 text-[0.8rem] text-charcoal/65">
                              {parts ? (
                                <>
                                  <span className="block">{parts.date}</span>
                                  <span className="block text-charcoal/50">{parts.time}</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        }
                        if (column.key === 'event_slug' && row[column.key]) {
                          return (
                            <td key={column.key} className="px-4 py-4">
                              <span className="inline-flex rounded-full bg-mint px-3 py-1 font-[family-name:var(--font-body)] text-[0.75rem] text-deep-green">
                                {row[column.key]}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={column.key}
                            className={`px-4 py-4 ${
                              column.key === 'email' ? 'break-all' : ''
                            } ${
                              column.key === 'notes'
                                ? 'max-w-[240px] whitespace-pre-wrap break-words text-charcoal/65'
                                : ''
                            } ${column.key === 'name' ? 'font-semibold' : ''}`}
                          >
                            {row[column.key] ?? '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-charcoal/10 px-5 py-4 sm:flex-row">
            <p className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/50">
              {total === 0
                ? 'Showing 0 of 0'
                : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className={pagerButton}
              >
                Previous
              </button>
              <span className="px-1 font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/50">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className={pagerButton}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </AdminShell>
    </>
  );
}

const labelClass =
  'flex flex-col gap-1.5 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60';

const inputClass =
  'min-h-[46px] w-full rounded-[10px] border border-charcoal/15 bg-white px-3.5 py-2.5 font-[family-name:var(--font-body)] text-[0.9rem] font-normal text-charcoal placeholder:text-charcoal/35 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20';

const pagerButton =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-[8px] border border-charcoal/15 bg-white px-5 py-1.5 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint disabled:cursor-not-allowed disabled:opacity-40';
