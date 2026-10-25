import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, NETWORK_FAILURE, onSessionEnded } from '../../lib/authClient';

/**
 * /admin/registrations - the manager's list of everyone who registered for an
 * event, with the CSV export that replaces the old spreadsheet.
 *
 * The page is only shown to managers, but that is a courtesy: every request it
 * makes goes to /api/admin/registrations, which checks the signed session and
 * answers 401/403 before reading a row. The list is personal data, so nothing
 * here is cached.
 */

type Registration = {
  id: string;
  event_slug: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  notes: string;
  created_at: string;
};

type EventCount = { event_slug: string; total: number };

type RegistrationList = {
  registrations: Registration[];
  total: number;
  page: number;
  pageSize: number;
  events: EventCount[];
};

const PAGE_SIZE = 25;

function formatDate(value: string): string {
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

export default function AdminRegistrations() {
  const [rows, setRows] = useState<Registration[]>([]);
  const [events, setEvents] = useState<EventCount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [eventSlug, setEventSlug] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();
  const searchRef = useRef(search);

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', { replace: true });
  }, [navigate]);

  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  // Type a letter, wait, then filter. The search runs on the server, so it
  // still finds people on a page the browser is not holding.
  useEffect(() => {
    searchRef.current = searchInput;
    const timer = window.setTimeout(() => {
      setSearch(searchRef.current);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const query = new URLSearchParams();
      if (eventSlug) query.set('event', eventSlug);
      if (search) query.set('search', search);
      query.set('page', String(page));

      const result = await authRequest<RegistrationList>(
        `/api/admin/registrations?${query.toString()}`,
        { method: 'GET' },
      );

      if (signal?.aborted) return;
      if (!result.ok) {
        setError(result.failure.error);
        setLoading(false);
        return;
      }

      setRows(result.data.registrations);
      setEvents(result.data.events);
      setTotal(result.data.total);
      setError(null);
      setLoading(false);
    },
    [eventSlug, search, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allRegistrations = useMemo(
    () => events.reduce((sum, item) => sum + item.total, 0),
    [events],
  );

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (eventSlug) query.set('event', eventSlug);
      if (search) query.set('search', search);

      const response = await fetch(
        `/api/admin/registrations-export?${query.toString()}`,
        { credentials: 'include' },
      );

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
      link.download = `registrations-${eventSlug || 'all-events'}.csv`;
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

  return (
    <>
      <SEO
        title="Event Registrations | People Growth Africa"
        description="View and export event registrants."
      />

      <section className="min-h-screen bg-cream/50 pt-[130px] pb-20">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-charcoal/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-[0.82rem] text-charcoal/70">
                Signed in as <span className="font-semibold text-charcoal break-all">{user?.email}</span>
              </p>
              <p className="mt-0.5 text-[0.72rem] text-charcoal/45">
                Registrations are personal data. Do not share this page or the export outside the team.
              </p>
            </div>
            <Link
              to="/admin/stats"
              className="inline-flex min-h-[40px] items-center rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal transition-colors hover:bg-cream"
            >
              ← Dashboard
            </Link>
          </div>

          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-wider text-brand-green">
                Manager
              </p>
              <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-charcoal sm:text-4xl">
                Event registrations
              </h1>
              <p className="mt-2 text-charcoal/60">
                Everyone who registered through the site, newest first.
                {events.length > 0 && (
                  <> {allRegistrations} registration{allRegistrations === 1 ? '' : 's'} across{' '}
                  {events.length} event{events.length === 1 ? '' : 's'}.</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={exporting || loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-deep-green px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-terracotta disabled:opacity-60"
            >
              {exporting ? 'Preparing CSV…' : 'Export CSV'}
            </button>
          </div>

          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-charcoal/10 bg-white p-4 sm:flex-row sm:items-center">
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-charcoal/70">
              Event
              <select
                value={eventSlug}
                onChange={(e) => {
                  setEventSlug(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-[10px] border border-charcoal/20 bg-white px-3 py-2.5 text-sm font-normal text-charcoal focus:border-brand-green focus:outline-none"
              >
                <option value="">All events ({allRegistrations})</option>
                {events.map((item) => (
                  <option key={item.event_slug} value={item.event_slug}>
                    {item.event_slug} ({item.total})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-charcoal/70">
              Search name or email
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search registrants…"
                className="w-full rounded-[10px] border border-charcoal/20 bg-white px-3 py-2.5 text-sm font-normal text-charcoal focus:border-brand-green focus:outline-none"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="mb-5 rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
              {error}
            </p>
          )}

          <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-charcoal/10 bg-cream/60 text-[0.72rem] uppercase tracking-wider text-charcoal/60">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Organisation</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-charcoal/50">
                        Loading registrations…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-charcoal/50">
                        No registrations match this filter yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-charcoal/5 align-top text-sm text-charcoal last:border-0">
                        <td className="px-4 py-3 font-semibold">{row.name}</td>
                        <td className="px-4 py-3 break-all">{row.email}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{row.phone}</td>
                        <td className="px-4 py-3">{row.organization ?? '—'}</td>
                        <td className="max-w-[260px] px-4 py-3 text-charcoal/70">
                          <span className="line-clamp-3 whitespace-pre-wrap break-words">{row.notes}</span>
                        </td>
                        <td className="px-4 py-3 text-charcoal/70">{row.event_slug}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-charcoal/70">
                          {formatDate(row.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-charcoal/55">
              {total === 0
                ? 'No registrants'
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="min-h-[38px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-cream disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-charcoal/60">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className="min-h-[38px] rounded-full border border-charcoal/15 px-4 py-2 text-sm font-semibold text-charcoal hover:bg-cream disabled:opacity-50"
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
