import { useCallback, useEffect, useState, type FormEvent } from 'react';

import AdminShell from '../../components/admin/AdminShell';
import { authRequest } from '../../lib/authClient';

type RetentionSettings = {
  enabled: boolean;
  defaultsConfirmedAt: string | null;
  rawTrafficRetentionDays: number;
};

type RetentionCount = {
  dataset: string;
  eligible: number;
  deleted: number;
};

type RetentionResponse = {
  settings: RetentionSettings;
  defaults: Record<string, { days?: number; months?: number; monthsAfterEvent?: number; monthsAfterDone?: number; minimumMonths?: number }>;
  legalHolds: { dataset: (typeof HOLD_DATASETS)[number]; id: string }[];
};

const RETENTION_LABELS: Record<string, string> = {
  softDeletedRecords: 'Soft-deleted records',
  eventRegistrations: 'Event registrations',
  unsubscribedEmails: 'Unsubscribed email addresses',
  completedConsultations: 'Completed consultations',
  failedLoginEvents: 'Failed login events',
  expiredOrRevokedSessions: 'Expired or revoked sessions',
  alerts: 'Security alerts',
  auditLogs: 'Audit logs (minimum retention)',
  readNotifications: 'Read notifications',
  unreadNotifications: 'Unread notifications',
  rawTrafficHits: 'Raw traffic hit history',
};

const HOLD_DATASETS = [
  'registrations',
  'event_registrations',
  'newsletter_subscribers',
  'consultation_bookings',
  'posts',
  'events',
  'users',
  'enquiries',
] as const;

export default function AdminRetention() {
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [defaults, setDefaults] = useState<RetentionResponse['defaults']>({});
  const [counts, setCounts] = useState<RetentionCount[]>([]);
  const [countsTitle, setCountsTitle] = useState('Latest dry-run counts');
  const [legalHolds, setLegalHolds] = useState<RetentionResponse['legalHolds']>([]);
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const [rawTrafficDays, setRawTrafficDays] = useState(60);
  const [dataset, setDataset] = useState<(typeof HOLD_DATASETS)[number]>('registrations');
  const [recordId, setRecordId] = useState('');
  const [holdEnabled, setHoldEnabled] = useState(true);
  const [personEmail, setPersonEmail] = useState('');
  const [confirmPersonDelete, setConfirmPersonDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await authRequest<RetentionResponse>('/api/admin/retention', { method: 'GET' });
    if (!result.ok) {
      setError(result.failure.error);
      setLoading(false);
      return;
    }
    setSettings(result.data.settings);
    setRawTrafficDays(result.data.settings.rawTrafficRetentionDays);
    setDefaults(result.data.defaults);
    setLegalHolds(result.data.legalHolds);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePurgeSetting() {
    if (!settings) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    const result = await authRequest<RetentionResponse>('/api/admin/retention', {
      method: 'POST',
      body: {
        action: 'set_purge',
        enabled: !settings.enabled,
        confirmDefaults,
      },
    });
    if (!result.ok) {
      setError(result.failure.error);
    } else {
      setSettings(result.data.settings);
      setNotice(result.data.settings.enabled ? 'Real purging is enabled.' : 'Real purging is disabled.');
    }
    setWorking(false);
  }

  async function runDryRun() {
    setWorking(true);
    setError(null);
    setNotice(null);
    const result = await authRequest<{ counts: RetentionCount[] }>('/api/admin/retention', {
      method: 'POST',
      body: { action: 'dry_run' },
    });
    if (!result.ok) {
      setError(result.failure.error);
    } else {
      setCounts(result.data.counts);
      setCountsTitle('Latest dry-run counts');
      setNotice('Dry run complete. No records were deleted.');
    }
    setWorking(false);
  }

  async function saveRawTrafficRetention() {
    setWorking(true);
    setError(null);
    setNotice(null);
    const result = await authRequest<{ settings: RetentionSettings }>('/api/admin/retention', {
      method: 'POST',
      body: { action: 'set_raw_traffic_days', days: rawTrafficDays },
    });
    if (!result.ok) {
      setError(result.failure.error);
    } else {
      setSettings(result.data.settings);
      setRawTrafficDays(result.data.settings.rawTrafficRetentionDays);
      setNotice(`Raw traffic retention set to ${result.data.settings.rawTrafficRetentionDays} days.`);
    }
    setWorking(false);
  }

  async function submitHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setNotice(null);
    const result = await authRequest('/api/admin/retention', {
      method: 'POST',
      body: {
        action: 'set_legal_hold',
        dataset,
        id: recordId.trim(),
        enabled: holdEnabled,
      },
    });
    if (!result.ok) {
      setError(result.failure.error);
    } else {
      setRecordId('');
      await load();
      setNotice(holdEnabled ? 'Legal hold applied.' : 'Legal hold removed.');
    }
    setWorking(false);
  }

  async function submitPersonDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setNotice(null);
    const result = await authRequest<{ counts: Record<string, number>; rowCount: number }>('/api/admin/retention', {
      method: 'POST',
      body: { action: 'delete_person', email: personEmail.trim() },
    });
    if (!result.ok) {
      setError(result.failure.error);
    } else {
      setPersonEmail('');
      setConfirmPersonDelete(false);
      setNotice(`Deletion request completed. ${result.data.rowCount} record(s) removed; legal holds were preserved.`);
      setCounts(Object.entries(result.data.counts).map(([dataset, deleted]) => ({ dataset, eligible: deleted, deleted })));
      setCountsTitle('Personal data deletion counts');
    }
    setWorking(false);
  }

  if (loading) {
    return <AdminShell title="Data retention"><p className="text-sm text-charcoal/55">Loading settings…</p></AdminShell>;
  }

  return (
    <AdminShell
      title="Data retention"
      subtitle="Review proposed retention periods, run a non-destructive preview, and manage legal holds."
    >
      {error && <p role="alert" className="mb-5 rounded-xl border border-terracotta/30 bg-terracotta/10 p-4 text-sm text-terracotta">{error}</p>}
      {notice && <p role="status" className="mb-5 rounded-xl border border-deep-green/20 bg-deep-green/5 p-4 text-sm text-deep-green">{notice}</p>}

      <section className="rounded-2xl border border-charcoal/10 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-bold text-charcoal">Proposed retention periods</h2>
        <p className="mt-1 text-sm text-charcoal/60">
          These values start in dry-run mode. Confirm them before enabling permanent deletion.
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {Object.entries(defaults).map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-4 rounded-xl bg-[#F5F0E7] px-4 py-3">
              <dt className="text-sm text-charcoal/70">{RETENTION_LABELS[key] ?? key}</dt>
              <dd className="shrink-0 text-right text-sm font-semibold text-charcoal">
                {key === 'auditLogs'
                  ? `At least ${value.minimumMonths} months; never auto-purged`
                  : key === 'rawTrafficHits'
                    ? `${settings?.rawTrafficRetentionDays ?? value.days} days; configurable`
                  : Object.entries(value).map(([unit, amount]) => `${amount} ${unit.replace('monthsAfter', 'months after ').replace('months', 'months')}`).join(', ')}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-charcoal/70">
            Raw hits retained
            <input
              type="number"
              min={1}
              max={730}
              value={rawTrafficDays}
              onChange={(event) => setRawTrafficDays(Number(event.target.value))}
              className="min-h-10 w-24 rounded-lg border border-charcoal/15 bg-white px-3 text-sm text-charcoal"
            />
            days
          </label>
          <button
            type="button"
            disabled={working || rawTrafficDays < 1 || rawTrafficDays > 730}
            onClick={() => void saveRawTrafficRetention()}
            className="min-h-10 rounded-full border border-charcoal/20 px-5 text-sm font-semibold text-charcoal disabled:opacity-50"
          >
            Save period
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void runDryRun()}
            className="min-h-10 rounded-full border border-charcoal/20 px-5 text-sm font-semibold text-charcoal disabled:opacity-50"
          >
            Run dry-run preview
          </button>
          <span className="text-xs text-charcoal/55">
            Real purging is {settings?.enabled ? 'enabled' : 'disabled'}.
          </span>
        </div>
        {!settings?.enabled && (
          <label className="mt-5 flex items-start gap-3 text-sm text-charcoal/70">
            <input
              type="checkbox"
              checked={confirmDefaults}
              onChange={(event) => setConfirmDefaults(event.target.checked)}
              className="mt-1"
            />
            I confirm the proposed retention periods above before enabling real purges.
          </label>
        )}
        <button
          type="button"
          disabled={working || (!settings?.enabled && !confirmDefaults)}
          onClick={() => void savePurgeSetting()}
          className="mt-4 min-h-10 rounded-full bg-deep-green px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {settings?.enabled ? 'Disable real purging' : 'Enable real purging'}
        </button>
        {counts.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold text-charcoal">{countsTitle}</h3>
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead><tr className="border-b border-charcoal/10 text-xs uppercase text-charcoal/45"><th className="py-2">Dataset</th><th className="py-2 text-right">Eligible / matched</th><th className="py-2 text-right">Deleted</th></tr></thead>
              <tbody>
                {counts.map((row) => (
                  <tr key={row.dataset} className="border-b border-charcoal/5">
                    <td className="py-2 text-charcoal/75">{row.dataset}</td>
                    <td className="py-2 text-right text-charcoal/65">{row.eligible}</td>
                    <td className="py-2 text-right font-semibold text-charcoal">{row.deleted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-charcoal/10 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-bold text-charcoal">Legal holds</h2>
        <p className="mt-1 text-sm text-charcoal/60">
          Held records and event registrations linked to a held event are excluded from retention purges.
        </p>
        <form onSubmit={submitHold} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
          <label className="text-xs font-semibold text-charcoal/70">
            Record type
            <select value={dataset} onChange={(event) => setDataset(event.target.value as typeof dataset)} className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm">
              {HOLD_DATASETS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-charcoal/70">
            Record UUID
            <input required value={recordId} onChange={(event) => setRecordId(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-charcoal/70">
            Hold state
            <select value={holdEnabled ? 'held' : 'released'} onChange={(event) => setHoldEnabled(event.target.value === 'held')} className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm">
              <option value="held">Apply hold</option>
              <option value="released">Remove hold</option>
            </select>
          </label>
          <button type="submit" disabled={working} className="min-h-10 self-end rounded-full bg-deep-green px-5 text-sm font-semibold text-white disabled:opacity-50">Save hold</button>
        </form>
        {legalHolds.length > 0 && (
          <ul className="mt-5 divide-y divide-charcoal/10">
            {legalHolds.map((hold) => (
              <li key={`${hold.dataset}-${hold.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs">
                <span><strong className="text-charcoal">{hold.dataset}</strong><code className="ml-2 break-all text-charcoal/60">{hold.id}</code></span>
                <button
                  type="button"
                  onClick={() => {
                    setDataset(hold.dataset);
                    setRecordId(hold.id);
                    setHoldEnabled(false);
                  }}
                  className="rounded-full border border-charcoal/15 px-3 py-1.5 font-semibold text-charcoal/70"
                >
                  Prepare removal
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-terracotta/20 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-bold text-charcoal">Delete one person’s data</h2>
        <p className="mt-1 text-sm text-charcoal/60">
          Permanently removes matching registrations, subscriptions, consultations, enquiries and eligible public accounts.
          Legal holds are preserved. Staff-account requests require a separate offboarding review. The audit log records counts only.
        </p>
        <form onSubmit={submitPersonDelete} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-xs font-semibold text-charcoal/70">
            Account or submission email
            <input
              required
              type="email"
              value={personEmail}
              onChange={(event) => setPersonEmail(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-charcoal/15 bg-white px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={working || !confirmPersonDelete}
            className="min-h-10 self-end rounded-full bg-terracotta px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Delete matching data
          </button>
          <label className="flex items-start gap-3 text-xs text-charcoal/70 sm:col-span-2">
            <input type="checkbox" checked={confirmPersonDelete} onChange={(event) => setConfirmPersonDelete(event.target.checked)} className="mt-0.5" />
            I confirm this is a verified data-deletion request and understand the matching data will be permanently deleted.
          </label>
        </form>
      </section>
    </AdminShell>
  );
}
