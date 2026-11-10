import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { useAuth } from '../../hooks/useAuth';
import { authRequest, NETWORK_FAILURE, onSessionEnded } from '../../lib/authClient';
import AccessRequestDialog from './AccessRequestDialog';
import {
  listAccess,
  requestAccess,
  type AccessDuration,
  type AccessOverview,
} from './AccessClient';

/**
 * /admin/data - all four personal-data lists in one screen.
 *
 * Registrations render as a compact list: desktop rows open a detail panel
 * docked beside the list, phone taps open the same detail full screen. The
 * selected row stays in the `id` query parameter so a refresh restores it.
 * The other tabs keep the wide table. Search, filters, export and the CSV all
 * use the same server-side filters; the browser never receives more than one
 * page except when it asks for the CSV.
 *
 * User accounts are read-only here: no role, password or disable control is
 * offered, because those stay with the super administrator's staff screen.
 */

type DataType = 'registrations' | 'subscriptions' | 'consultations' | 'users';
type Answer = { questionId: string; label: string; value: unknown; skipped?: boolean };
type Row = Record<string, string | null> & { answers?: Answer[]; event_slug?: string | null };
type DataResponse = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  events?: { event_slug: string; total: number }[];
  assignableStaff?: { id: string; name: string | null; email: string }[];
};

const TABS: { value: DataType; label: string; search: string }[] = [
  { value: 'registrations', label: 'Event registrations', search: 'Name or email' },
  { value: 'subscriptions', label: 'Email subscriptions', search: 'Email' },
  { value: 'consultations', label: 'Consultation bookings', search: 'Name or email' },
  { value: 'users', label: 'User accounts', search: 'Name, email or company' },
];

const TABLE_COLUMNS: Record<Exclude<DataType, 'registrations'>, { key: string; label: string }[]> = {
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
    { key: 'assigned_to', label: 'Assigned to' },
    { key: 'internal_notes', label: 'Internal notes' },
    { key: 'created_at', label: 'Booked' },
  ],
  users: [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Account' },
    { key: 'company', label: 'Company' },
    { key: 'field', label: 'Field' },
    { key: 'country', label: 'Country' },
    { key: 'created_at', label: 'Joined' },
  ],
};

const PAGE_SIZE = 25;

/** Questions already shown as Contact, Notes or Event in the detail panel. */
const REPEATED_LABELS: RegExp[] = [
  /^full name$/i,
  /^first name$/i,
  /^last name$/i,
  /^name$/i,
  /^email/i,
  /^(phone|whatsapp|mobile|tel)/i,
  /^organiz/i,
  /^organis/i,
  /^notes?$/i,
];

function answersOf(row: Row): Answer[] {
  return Array.isArray(row.answers) ? row.answers : [];
}

function answerText(answer: Answer): string {
  if (answer.skipped) return '';
  if (Array.isArray(answer.value)) return answer.value.filter(Boolean).join(', ');
  return String(answer.value ?? '').trim();
}

/** The chip answer: the question about their primary area of interest. */
function interestOf(row: Row): string | null {
  const found = answersOf(row).find((answer) => !answer.skipped && /interest/i.test(answer.label));
  return found ? answerText(found) : null;
}

/** Only the questions the detail panel does not already show as fields. */
function extraAnswers(row: Row): Answer[] {
  return answersOf(row).filter((answer) => {
    if (answer.skipped) return false;
    return !REPEATED_LABELS.some((pattern) => pattern.test(answer.label.trim()));
  });
}

function initialsOf(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '##';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

const AVATAR_PALETTES = [
  'bg-mint text-deep-green',
  'bg-amber-100 text-amber-900',
  'bg-sky-100 text-sky-900',
  'bg-rose-100 text-rose-900',
];

function avatarPalette(name: string | null): string {
  const source = name ?? '?';
  const sum = [...source].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_PALETTES[sum % AVATAR_PALETTES.length];
}

type DateParts = { date: string; time: string; shortDate: string; compactDate: string };

function formatDateParts(value: string | null): DateParts | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: '', shortDate: value, compactDate: value };
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    compactDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

function digitsOnly(value: string | null): string {
  return (value ?? '').replace(/[^0-9]/g, '');
}

function formatAccessDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

/** Published event titles for chips and the filter dropdown, slug as fallback. */
async function loadEventTitles(): Promise<Record<string, string>> {
  try {
    const response = await fetch('/api/posts', { credentials: 'omit' });
    if (!response.ok) return {};
    const payload = (await response.json()) as { posts?: unknown };
    if (!Array.isArray(payload.posts)) return {};
    const titles: Record<string, string> = {};
    for (const post of payload.posts as { type?: unknown; slug?: unknown; title?: unknown }[]) {
      if (post.type === 'event' && typeof post.slug === 'string' && typeof post.title === 'string') {
        titles[post.slug] = post.title;
      }
    }
    return titles;
  } catch {
    return {};
  }
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 fill-none stroke-charcoal/40 stroke-2 stroke-linecap-round stroke-linejoin-round"
    >
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? 'h-4 w-4 shrink-0 fill-none stroke-charcoal/45 stroke-2 stroke-linecap-round stroke-linejoin-round'}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? 'h-4 w-4 shrink-0 fill-none stroke-charcoal/45 stroke-2 stroke-linecap-round stroke-linejoin-round'}
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 fill-none stroke-brand-green stroke-2 stroke-linecap-round stroke-linejoin-round">
      <circle cx="12" cy="11" r="7.5" />
      <path d="M7.5 17.5L6 21.5l4-1.4" />
      <path d="M9.5 10.4a2.4 2.4 0 0 1 4.6 1c0 1.6-2.3 2.8-2.3 2.8s-.2-1.6-1-2.4c-.7-.7-1.3-1.4-1.3-1.4z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 fill-none stroke-brand-green stroke-2 stroke-linecap-round stroke-linejoin-round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export default function AdminData() {
  const { user } = useAuth();
  const [type, setType] = useState<DataType>('registrations');
  const [showDeleted, setShowDeleted] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<{ event_slug: string; total: number }[]>([]);
  const [eventTitles, setEventTitles] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [accountRole, setAccountRole] = useState('');
  const [consultationStatus, setConsultationStatus] = useState('');
  const [consultationOwner, setConsultationOwner] = useState('');
  const [assignableStaff, setAssignableStaff] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessOverview | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = type === 'registrations' ? (searchParams.get('id') ?? '') : '';
  const selected = useMemo(
    () => (selectedId ? rows.find((row) => row.email === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/data' },
    });
  }, [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const loadAccess = useCallback(async (): Promise<AccessOverview | null> => {
    const result = await listAccess();
    setCheckingAccess(false);
    if (!result.ok) {
      setAccessError(result.failure.error);
      setAccess(null);
      return null;
    }
    setAccess(result.data);
    setAccessError(null);
    return result.data;
  }, []);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  const latestExportRequest = useMemo(
    () =>
      [...(access?.requests ?? [])]
        .filter((request) => request.permission === 'export.data')
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null,
    [access?.requests],
  );
  const canExport = access?.effectivePermissions.includes('export.data') ?? false;

  async function submitExportAccessRequest(reason: string, requestedDuration: AccessDuration) {
    const result = await requestAccess({
      permission: 'export.data',
      reason,
      requestedDuration,
    });
    if (result.ok) {
      setAccessNotice('Your export-access request was sent for review.');
      await loadAccess();
    }
    return result;
  }

  useEffect(() => {
    void loadEventTitles().then(setEventTitles);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    params.set('type', type);
    params.set('page', String(page));
    if (search) params.set('search', search);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (type === 'registrations' && eventSlug) params.set('event', eventSlug);
    if (type === 'users' && accountRole) params.set('role', accountRole);
    if (type === 'consultations' && consultationStatus) params.set('status', consultationStatus);
    if (type === 'consultations' && consultationOwner) params.set('owner', consultationOwner);
    if (showDeleted) params.set('deleted', 'true');
    return params;
  }, [type, page, search, from, to, eventSlug, accountRole, consultationStatus, consultationOwner, showDeleted]);

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
      setAssignableStaff(result.data.assignableStaff ?? []);
      setError(null);
      setLoading(false);
    },
    [query],
  );

  const mutateRecord = useCallback(async (row: Row, action: 'delete' | 'restore' | 'purge') => {
    if (!row.id) return;
    const result = await authRequest<{ ok: boolean }>('/api/admin/data', {
      method: 'POST',
      body: JSON.stringify({ action, type, id: row.id }),
    });
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setError(null);
    await load();
  }, [type, load]);

  const mutateConsultation = useCallback(async (
    row: Row,
    change: { action: 'consultation_status'; status: string }
      | { action: 'consultation_assign'; assignedTo: string | null }
      | { action: 'consultation_note'; internalNotes: string },
  ) => {
    if (!row.id) return;
    const result = await authRequest<{ ok: boolean }>('/api/admin/data', {
      method: 'POST',
      body: { id: row.id, ...change },
    });
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    await load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Focus moves into the detail panel when it opens, back to the row on close. */
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selectedId) detailHeadingRef.current?.focus();
  }, [selectedId]);

  const closeDetail = useCallback(() => {
    const trigger = rowRefs.current.get(selectedId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('id');
      return next;
    });
    trigger?.focus();
  }, [selectedId, setSearchParams]);

  const openDetail = useCallback(
    (email: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('id', email);
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, closeDetail]);

  const exportCsv = async () => {
    if (!canExport) {
      if (access && latestExportRequest?.status !== 'pending') setRequestDialogOpen(true);
      return;
    }
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
        if (response.status === 403) {
          const currentAccess = await loadAccess();
          const currentRequest = currentAccess?.requests
            .filter((request) => request.permission === 'export.data')
            .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];
          if (currentAccess && currentRequest?.status !== 'pending') setRequestDialogOpen(true);
        }
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
  const activeTab = TABS.find((tab) => tab.value === type) ?? TABS[0];
  /** A tag under the date only when the list mixes several events. */
  const showEventTag = type === 'registrations' && !eventSlug && events.length > 1;

  const details = selected && (
    <>
      <DetailAside
        registration={selected}
        eventTitle={selected.event_slug ? eventTitles[selected.event_slug] ?? selected.event_slug : ''}
        onClose={closeDetail}
        headingRef={detailHeadingRef}
     />
      {/* Mobile: the same content as a full-screen page, not a side panel. */}
      <div className="lg:hidden">
        <FullScreenDetail
          registration={selected}
          eventTitle={selected.event_slug ? eventTitles[selected.event_slug] ?? selected.event_slug : ''}
          onClose={closeDetail}
          headingRef={detailHeadingRef}
        />
      </div>
    </>
  );

  return (
    <>
      <SEO title="Data | People Growth Africa" description="Staff data lists and CSV export." />
      <AdminShell
        title="Data"
        subtitle="Newest first. Personal data, do not share it outside the team."
        actions={
          canExport ? (
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={exporting || loading}
              className="inline-flex w-full min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-deep-green bg-deep-green px-6 py-2.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:opacity-60 xl:w-auto"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                <path d="M5 21h14" />
              </svg>
              {exporting ? 'Preparing CSV…' : 'Export CSV'}
            </button>
          ) : access ? (
            latestExportRequest?.status === 'pending' ? (
              <span className="inline-flex min-h-[48px] items-center justify-center rounded-[10px] bg-[#F7E9D7] px-5 text-sm font-semibold text-[#754A21]">
                Export access pending
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setRequestDialogOpen(true)}
                className="inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-white px-5 font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green transition-colors hover:bg-mint"
              >
                Request export access
              </button>
            )
          ) : (
            <button
              type="button"
              disabled
              title={accessError ?? undefined}
              className="inline-flex min-h-[48px] items-center justify-center rounded-[10px] border border-charcoal/15 bg-white px-5 font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal/50"
            >
              {checkingAccess ? 'Checking export access…' : 'Export access unavailable'}
            </button>
          )
        }
      >
        {/* Tabs scroll sideways in their own container on narrow screens. */}
        <div className="mb-5 max-w-full overflow-x-auto rounded-full bg-cream/70 p-1.5">
          <div role="tablist" aria-label="Data lists" className="flex w-max items-center gap-1 px-0.5">
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
                    setShowDeleted(false);
                    setEventSlug('');
                    setAccountRole('');
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.delete('id');
                      return next;
                    });
                  }}
                  className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-5 py-2 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green ${
                    active
                      ? 'bg-white text-deep-green shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-charcoal/55 hover:text-charcoal'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {type !== 'users' && (
          <div className="mb-5 flex gap-2" role="tablist" aria-label="Record status">
            {[
              { label: 'Active', deleted: false },
              { label: 'Deleted', deleted: true },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={showDeleted === item.deleted}
                onClick={() => {
                  setShowDeleted(item.deleted);
                  setPage(1);
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.delete('id');
                    return next;
                  });
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  showDeleted === item.deleted ? 'bg-deep-green text-white' : 'bg-cream text-charcoal/70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* 48px tall, 16px text on phone so iOS does not zoom; stacked there. */}
        <div className={`mb-5 grid gap-3 ${type === 'registrations' || type === 'users' ? 'lg:grid-cols-[1.4fr_0.8fr_0.8fr_1.1fr]' : 'lg:grid-cols-[1.5fr_0.8fr_0.8fr]'}`}>
          <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
            <span className="mb-1.5 block">Search</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={`Search ${activeTab.search.toLowerCase()}`}
              aria-label={`Search ${activeTab.search.toLowerCase()}`}
              className={inputClass}
            />
          </label>
          <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
            <span className="mb-1.5 block">From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
          <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
            <span className="mb-1.5 block">To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
          {type === 'users' && (
            <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
              <span className="mb-1.5 block">Account</span>
              <select
                value={accountRole}
                onChange={(event) => {
                  setAccountRole(event.target.value);
                  setPage(1);
                }}
                className={inputClass}
              >
                <option value="">All accounts</option>
                <option value="talent">Talent</option>
                <option value="employer">Employer</option>
              </select>
            </label>
          )}
          {type === 'registrations' && (
            <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
              <span className="mb-1.5 block">Event</span>
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
                    {eventTitles[event.event_slug] ?? event.event_slug}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === 'consultations' && (
            <>
              <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
                <span className="mb-1.5 block">Status</span>
                <select value={consultationStatus} onChange={(event) => {
                  setConsultationStatus(event.target.value);
                  setPage(1);
                }} className={inputClass}>
                  <option value="">All statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="done">Done</option>
                </select>
              </label>
              <label className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/60">
                <span className="mb-1.5 block">Owner</span>
                <select value={consultationOwner} onChange={(event) => {
                  setConsultationOwner(event.target.value);
                  setPage(1);
                }} className={inputClass}>
                  <option value="">All owners</option>
                  <option value="unassigned">Unassigned</option>
                  {assignableStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name || staff.email}</option>)}
                </select>
              </label>
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
          >
            {error}
          </p>
        )}
        {accessError && (
          <p
            role="alert"
            className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
          >
            Export permission could not be verified: {accessError}
          </p>
        )}
        {accessNotice && (
          <p
            role="status"
            className="mb-5 rounded-[12px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal"
          >
            {accessNotice}
          </p>
        )}
        {access && !canExport && latestExportRequest?.status === 'declined' && (
          <p className="mb-5 rounded-[12px] border border-terracotta/25 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
            Export access was declined: {latestExportRequest.decision_note || 'No note was provided.'}
          </p>
        )}
        {access && !canExport && latestExportRequest?.status === 'approved' && (
          <p className="mb-5 rounded-[12px] border border-charcoal/10 bg-white px-4 py-3 text-sm text-charcoal/60">
            Your previous export request was approved
            {latestExportRequest.grant_expires_at
              ? ` until ${formatAccessDate(latestExportRequest.grant_expires_at)}`
              : ' permanently'}
            ; that access is no longer active.
          </p>
        )}

        <p className="mb-3 font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/55">
          {type === 'registrations'
            ? `${total} ${total === 1 ? 'registration' : 'registrations'}.`
            : type === 'users'
              ? `${total} ${total === 1 ? 'account' : 'accounts'} match the current filters.`
              : `${total} ${total === 1 ? 'row' : 'rows'} match the current filters.`}
        </p>

        {showDeleted ? (
          <DeletedRecordsPanel
            rows={rows}
            loading={loading}
            isSuperAdmin={user?.isSuperAdmin === true}
            onRestore={(row) => void mutateRecord(row, 'restore')}
            onPurge={(row) => void mutateRecord(row, 'purge')}
          />
        ) : type === 'registrations' ? (
          <>
            <div className={`gap-6 lg:grid ${selected ? 'lg:grid-cols-[minmax(0,1fr)_400px]' : 'lg:grid-cols-[minmax(0,1fr)]'}`}>
              <RegistrationList
                rows={rows}
                loading={loading}
                selectedId={selectedId}
                eventTitles={eventTitles}
                showEventTag={showEventTag}
                rowRefs={rowRefs}
                onOpen={openDetail}
                onDelete={(row) => void mutateRecord(row, 'delete')}
              />
              {details}
            </div>
          </>
        ) : (
          <WideTable
            type={type}
            rows={rows}
            loading={loading}
            onDelete={type === 'users' ? undefined : (row) => void mutateRecord(row, 'delete')}
            consultationStaff={assignableStaff}
            canUpdateConsultations={access?.effectivePermissions.includes('consultation.update') ?? false}
            onConsultationChange={(row, change) => void mutateConsultation(row, change)}
          />
        )}

        <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-charcoal/10 pt-4 sm:flex-row">
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
      </AdminShell>
      {requestDialogOpen && access && !canExport && (
        <AccessRequestDialog
          permission="export.data"
          currentStatus={latestExportRequest?.status ?? null}
          onSubmit={submitExportAccessRequest}
          onCancel={() => setRequestDialogOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The registrations list: desktop rows inside one card, phone cards stacked.
 * Both open the same detail, nothing here needs horizontal scrolling.
 */
function RegistrationList({
  rows,
  loading,
  selectedId,
  eventTitles,
  showEventTag,
  rowRefs,
  onOpen,
  onDelete,
}: {
  rows: Row[];
  loading: boolean;
  selectedId: string;
  eventTitles: Record<string, string>;
  showEventTag: boolean;
  rowRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  onOpen: (email: string) => void;
  onDelete: (row: Row) => void;
}) {
  if (loading) {
    return (
      <p className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-14 text-center text-sm text-charcoal/50">
        Loading…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-14 text-center text-sm text-charcoal/50">
        Nothing matches these filters yet.
      </p>
    );
  }

  const desktopRowGrid =
    'grid grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.9fr)_minmax(0,1fr)_1.25rem] items-center gap-4 px-4 py-3.5 text-left';

  return (
    <div className="overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
      <div
        aria-hidden="true"
        className={`${desktopRowGrid} hidden border-b border-charcoal/10 bg-cream/60 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-charcoal/50 lg:grid`}
      >
        <span>Registrant</span>
        <span>Phone</span>
        <span>Interest</span>
        <span>Registered</span>
        <span />
      </div>

      {rows.map((row, index) => {
        const key = row.email ?? `row-${index}`;
        const dateParts = formatDateParts(row.created_at);
        const interest = interestOf(row);
        const isSelected = key !== '' && selectedId === key;

        return (
          <div key={key} className="flex items-stretch border-b border-charcoal/[0.07] last:border-0">
          <button
            type="button"
            ref={(element) => {
              if (element) rowRefs.current?.set(key, element);
              else rowRefs.current?.delete(key);
            }}
            onClick={() => onOpen(key)}
            aria-haspopup="dialog"
            aria-expanded={isSelected}
            className={`block min-w-0 flex-1 cursor-pointer text-left focus-visible:bg-mint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-green ${
              isSelected ? 'bg-mint/70' : 'bg-white hover:bg-cream/50'
            }`}
          >
            {/* Phone card */}
            <span className="block p-4 lg:hidden">
              <span className="flex items-start gap-3">
                <Avatar name={row.name} sizeClass="h-11 w-11 text-[0.9rem]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-charcoal">{row.name ?? 'Unknown name'}</span>
                      <span className="block text-[0.82rem] text-charcoal/55">
                        {dateParts ? `${dateParts.shortDate}, ${dateParts.time}` : ''}
                      </span>
                    </span>
                    <Chevron />
                  </span>
                  <span className="mt-1.5 truncate text-[0.85rem] text-charcoal/80">{row.email}</span>
                </span>
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[0.85rem] text-charcoal/80">
                  <PhoneIcon />
                  <span className="truncate">{row.phone ?? '—'}</span>
                </span>
              </span>
              {interest && (
                <span className="mt-3 block">
                  <InterestChip label={interest} />
                </span>
              )}
            </span>

            {/* Desktop row, around 64px tall */}
            <span className={`${desktopRowGrid} hidden lg:grid`}>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={row.name} sizeClass="h-10 w-10 text-[0.85rem]" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-charcoal">{row.name ?? 'Unknown name'}</span>
                  <span className="block truncate text-[0.8rem] text-charcoal/55">{row.email}</span>
                </span>
              </span>
              <span className="min-w-0 truncate text-[0.88rem] text-charcoal/75">{row.phone ?? '—'}</span>
              <span className="min-w-0">
                {interest ? <InterestChip label={interest} /> : <span className="text-charcoal/35">—</span>}
              </span>
              <span className="min-w-0">
                {dateParts && (
                  <>
                    <span className="block whitespace-nowrap text-[0.82rem] text-charcoal/70">{dateParts.compactDate}</span>
                    <span className="block whitespace-nowrap text-[0.75rem] text-charcoal/45">{dateParts.time}</span>
                    {showEventTag && row.event_slug && (
                      <span className="mt-0.5 inline-block max-w-full truncate rounded-md bg-cream px-1.5 py-0.5 text-[0.68rem] font-semibold text-charcoal/60">
                        {eventTitles[row.event_slug] ?? row.event_slug}
                      </span>
                    )}
                  </>
                )}
              </span>
              <Chevron />
            </span>
          </button>
          <button type="button" onClick={() => onDelete(row)} className="shrink-0 px-3 text-xs font-semibold text-terracotta hover:bg-terracotta/10">
            Delete
          </button>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ name, sizeClass }: { name: string | null; sizeClass: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-[family-name:var(--font-body)] font-bold ${sizeClass} ${avatarPalette(name)}`}
    >
      {initialsOf(name)}
    </span>
  );
}

function InterestChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-green/20 bg-mint px-3 py-1 text-[0.75rem] font-semibold text-deep-green">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-deep-green" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function DetailActions({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false);
  const waDigits = digitsOnly(row.phone);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(row.email ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const buttonClass =
    'flex h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-brand-green/25 bg-white font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-brand-green transition-colors hover:bg-mint/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green';

  return (
    <div className="grid grid-cols-3 gap-3 px-5 sm:px-6">
      <a href={`mailto:${row.email ?? ''}`} className={buttonClass}>
        <MailIcon className="h-4 w-4 shrink-0 fill-none stroke-brand-green stroke-2 stroke-linecap-round stroke-linejoin-round" />
        Email
      </a>
      {waDigits ? (
        <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          <WhatsappIcon />
          WhatsApp
        </a>
      ) : (
        <span className={`${buttonClass} cursor-not-allowed opacity-40`} aria-disabled="true">
          <WhatsappIcon />
          WhatsApp
        </span>
      )}
      <button type="button" onClick={() => void copyEmail()} className={`cursor-pointer ${buttonClass}`}>
        <CopyIcon />
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

function DetailBody({ row }: { row: Row }) {
  const extras = extraAnswers(row);

  return (
    <div className="space-y-6 pt-5 pb-10">
      <DetailActions row={row} />

      <section className="px-5 sm:px-6">
        <h3 className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-deep-green">Contact</h3>
        <dl>
          {(
            [
              { label: 'Email', value: row.email },
              { label: 'Phone / WhatsApp', value: row.phone },
              { label: 'Organization', value: row.organization },
            ] as const
          ).map((entry) => (
            <div
              key={entry.label}
              className="flex items-center justify-between gap-4 border-b border-charcoal/10 py-3 last:border-0"
            >
              <dt className="shrink-0 text-[0.9rem] text-charcoal/55">{entry.label}</dt>
              <dd className="min-w-0 break-words text-right font-bold text-charcoal">{entry.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {row.notes && (
        <section className="px-5 sm:px-6">
          <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-deep-green">Notes</h3>
          <p className="whitespace-pre-wrap border-l-2 border-mint pl-3 text-[0.95rem] leading-relaxed text-charcoal">
            {row.notes}
          </p>
        </section>
      )}

      {extras.length > 0 && (
        <section className="px-5 sm:px-6">
          <h3 className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-deep-green">
            Registration answers
          </h3>
          <ul className="space-y-3">
            {extras.map((answer) => (
              <li key={answer.questionId} className="rounded-xl border border-charcoal/10 bg-cream/50 px-4 py-3">
                <p className="text-[0.85rem] leading-snug text-charcoal/55">{answer.label}</p>
                <p className="mt-1 break-words font-bold text-charcoal">{answerText(answer)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Headline: avatar, name, registered date and the event title chip. */
function DetailHeading({
  row,
  eventTitle,
  onClose,
  headingRef,
}: {
  row: Row;
  eventTitle: string;
  onClose?: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const dateParts = formatDateParts(row.created_at);
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#14603F] to-[#0B2E22] px-5 pb-5 pt-6 text-white sm:px-6">
      <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/[0.09]" />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      )}
      <div className="flex items-center gap-4 pr-8">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full border-2 border-white/60 bg-white font-[family-name:var(--font-body)] text-[1.05rem] font-bold text-deep-green"
        >
          {initialsOf(row.name)}
        </span>
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="truncate font-[family-name:var(--font-heading)] text-[1.7rem] font-bold leading-tight text-white focus-visible:outline-none"
          >
            {row.name ?? 'Unknown name'}
          </h2>
          <p className="mt-0.5 text-[0.85rem] text-white/80">
            {dateParts ? `Registered ${dateParts.date}, ${dateParts.time}` : 'Registered'}
          </p>
        </div>
      </div>
      {eventTitle && (
        <p className="relative mt-3 inline-block max-w-full truncate rounded-full border border-white/35 bg-white/10 px-4 py-1.5 text-[0.85rem] font-semibold text-white">
          {eventTitle}
        </p>
      )}
    </div>
  );
}

/** Desktop: the detail docked beside the list. */
function DetailAside({
  registration,
  eventTitle,
  onClose,
  headingRef,
}: {
  registration: Row;
  eventTitle: string;
  onClose: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <aside
      role="dialog"
      aria-label="Registration details"
      className="hidden overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
    >
      <DetailHeading row={registration} eventTitle={eventTitle} onClose={onClose} headingRef={headingRef} />
      <DetailBody row={registration} />
    </aside>
  );
}

/** Phone: the same detail full screen with a back button. */
function FullScreenDetail({
  registration,
  eventTitle,
  onClose,
  headingRef,
}: {
  registration: Row;
  eventTitle: string;
  onClose: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div role="dialog" aria-label="Registration details" className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center gap-2 bg-[#0B2E22] px-2 text-white">
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 shrink-0 cursor-pointer items-center justify-center rounded-full px-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
            <path d="M12 5l-5 5 5 5" />
          </svg>
          <span className="font-[family-name:var(--font-heading)] text-[1.2rem] font-bold">Registrations</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <DetailHeading row={registration} eventTitle={eventTitle} onClose={undefined} headingRef={headingRef} />
        <DetailBody row={registration} />
      </div>
    </div>
  );
}

/** The two tabs that keep the wide table. */
function WideTable({
  type,
  rows,
  loading,
  onDelete,
  consultationStaff,
  canUpdateConsultations,
  onConsultationChange,
}: {
  type: Exclude<DataType, 'registrations'>;
  rows: Row[];
  loading: boolean;
  onDelete?: (row: Row) => void;
  consultationStaff: { id: string; name: string | null; email: string }[];
  canUpdateConsultations: boolean;
  onConsultationChange: (
    row: Row,
    change: { action: 'consultation_status'; status: string }
      | { action: 'consultation_assign'; assignedTo: string | null }
      | { action: 'consultation_note'; internalNotes: string },
  ) => void;
}) {
  const columns = TABLE_COLUMNS[type];
  return (
    <div className="overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-charcoal/10 bg-cream/60 text-[0.66rem] uppercase tracking-[0.12em] text-charcoal/50">
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3.5 font-semibold">
                  {column.label}
                </th>
              ))}
              {onDelete && <th className="px-4 py-3.5 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + Number(Boolean(onDelete))} className="px-4 py-10 text-center text-sm text-charcoal/50">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + Number(Boolean(onDelete))} className="px-4 py-10 text-center text-sm text-charcoal/50">
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
                    if (column.key === 'role') {
                      const accountRole = row.role;
                      return (
                        <td key={column.key} className="whitespace-nowrap px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-[0.75rem] font-medium ${
                              accountRole === 'talent'
                                ? 'bg-mint text-deep-green'
                                : 'bg-[#F1E9DC] text-[#8B6A40]'
                            }`}
                          >
                            {accountRole === 'talent' ? 'Talent' : 'Employer'}
                          </span>
                        </td>
                      );
                    }

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
                    if (type === 'consultations' && column.key === 'status') {
                      return (
                        <td key={column.key} className="whitespace-nowrap px-4 py-4">
                          <select aria-label={`Status for ${row.name ?? row.email ?? 'consultation'}`}
                            value={row.status ?? 'new'} disabled={!canUpdateConsultations}
                            onChange={(event) => onConsultationChange(row, {
                              action: 'consultation_status',
                              status: event.target.value,
                            })}
                            className="min-h-9 rounded-lg border border-charcoal/15 bg-white px-2 text-sm disabled:opacity-60">
                            {['new', 'contacted', 'scheduled', 'done'].map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </td>
                      );
                    }
                    if (type === 'consultations' && column.key === 'assigned_to') {
                      return (
                        <td key={column.key} className="whitespace-nowrap px-4 py-4">
                          <select aria-label={`Owner for ${row.name ?? row.email ?? 'consultation'}`}
                            value={row.assigned_to ?? ''} disabled={!canUpdateConsultations}
                            onChange={(event) => onConsultationChange(row, {
                              action: 'consultation_assign',
                              assignedTo: event.target.value || null,
                            })}
                            className="min-h-9 max-w-48 rounded-lg border border-charcoal/15 bg-white px-2 text-sm disabled:opacity-60">
                            <option value="">Unassigned</option>
                            {consultationStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name || staff.email}</option>)}
                          </select>
                        </td>
                      );
                    }
                    if (type === 'consultations' && column.key === 'internal_notes') {
                      return (
                        <td key={column.key} className="min-w-[220px] px-4 py-4">
                          <input aria-label={`Internal note for ${row.name ?? row.email ?? 'consultation'}`}
                            defaultValue={row.internal_notes ?? ''} disabled={!canUpdateConsultations}
                            onBlur={(event) => {
                              if (event.currentTarget.value !== (row.internal_notes ?? '')) {
                                onConsultationChange(row, {
                                  action: 'consultation_note',
                                  internalNotes: event.currentTarget.value,
                                });
                              }
                            }}
                            className="w-full min-h-9 rounded-lg border border-charcoal/15 bg-white px-2 text-sm disabled:opacity-60"
                            placeholder="Staff only" />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={column.key}
                        className={`px-4 py-4 ${column.key === 'email' ? 'break-all' : ''} ${
                          column.key === 'notes'
                            ? 'max-w-[240px] whitespace-pre-wrap break-words text-charcoal/65'
                            : ''
                        } ${column.key === 'name' ? 'font-semibold' : ''}`}
                      >
                        {row[column.key] ?? '—'}
                      </td>
                    );
                  })}
                  {onDelete && (
                    <td className="whitespace-nowrap px-4 py-4">
                      <button type="button" onClick={() => onDelete(row)} className="rounded-full px-3 py-1 text-xs font-semibold text-terracotta hover:bg-terracotta/10">Delete</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeletedRecordsPanel({
  rows,
  loading,
  isSuperAdmin,
  onRestore,
  onPurge,
}: {
  rows: Row[];
  loading: boolean;
  isSuperAdmin: boolean;
  onRestore: (row: Row) => void;
  onPurge: (row: Row) => void;
}) {
  if (loading) {
    return <p className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-14 text-center text-sm text-charcoal/50">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-14 text-center text-sm text-charcoal/50">No deleted records.</p>;
  }
  return (
    <div className="overflow-hidden rounded-[16px] border border-charcoal/10 bg-white">
      {rows.map((row) => (
        <div key={row.id ?? row.email} className="flex flex-col gap-3 border-b border-charcoal/[0.07] p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-semibold text-charcoal">{row.name ?? row.email ?? 'Deleted record'}</p>
            <p className="truncate text-sm text-charcoal/60">
              {[row.event_slug, row.email, row.status].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 text-xs text-charcoal/50">
              Deleted {row.deleted_at ? new Date(row.deleted_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) : 'at unknown time'}
              {row.deleted_by ? ` · by ${row.deleted_by}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => onRestore(row)} className="min-h-10 rounded-[9px] border border-deep-green px-4 text-sm font-semibold text-deep-green hover:bg-mint">Restore</button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Permanently delete this record? This cannot be undone.')) onPurge(row);
                }}
                className="min-h-10 rounded-[9px] border border-terracotta/40 px-4 text-sm font-semibold text-terracotta hover:bg-terracotta/10"
              >
                Purge
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const inputClass =
  'min-h-[48px] w-full rounded-[10px] border border-charcoal/15 bg-white px-3.5 py-2.5 font-[family-name:var(--font-body)] text-[16px] text-charcoal placeholder:text-charcoal/35 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 lg:min-h-[44px] lg:text-[0.9rem]';

const pagerButton =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-[8px] border border-charcoal/15 bg-white px-5 py-1.5 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint disabled:cursor-not-allowed disabled:opacity-40';
