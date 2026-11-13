import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { useConfirm } from '../../hooks/useConfirm';
import { onSessionEnded, roleLabel } from '../../lib/authClient';
import {
  ACCESS_PERMISSIONS,
  approveAccessRequest,
  declineAccessRequest,
  listAccess,
  revokePermissionGrant,
  type AccessDuration,
  type AccessOverview,
  type PendingAccessRequest,
} from './AccessClient';

const inputClass =
  'min-h-[42px] w-full rounded-[9px] border border-charcoal/15 bg-white px-3 py-2 text-sm text-charcoal focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

function permissionLabel(permission: string): string {
  return ACCESS_PERMISSIONS.find((item) => item.id === permission)?.label ?? permission;
}

function requestDurationLabel(duration: AccessDuration): string {
  return duration === null ? 'Permanent' : `${duration} days`;
}

function needsReview(grantedAt: string): boolean {
  const age = Date.now() - new Date(grantedAt).getTime();
  return age > 90 * 24 * 60 * 60 * 1000;
}

export default function AdminAccess() {
  const confirm = useConfirm();
  const [overview, setOverview] = useState<AccessOverview | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, AccessDuration>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loading = overview === null && error === null;
  const navigate = useNavigate();

  const endSession = useCallback(
    () => navigate('/admin/login?expired=1', { replace: true }),
    [navigate],
  );
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await listAccess();
    if (signal?.aborted) return;
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setOverview(result.data);
    setError(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function approve(request: PendingAccessRequest) {
    const duration = Object.prototype.hasOwnProperty.call(durations, request.id)
      ? durations[request.id]
      : 30;
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    const result = await approveAccessRequest(request.id, duration);
    setBusyId(null);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setNotice(`Access approved for ${request.requester_name ?? request.requester_email}.`);
    await load();
  }

  async function decline(request: PendingAccessRequest) {
    const decisionNote = (decisionNotes[request.id] ?? '').trim();
    if (!decisionNote) {
      setError('Add a note before declining the request.');
      return;
    }
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    const result = await declineAccessRequest(request.id, decisionNote);
    setBusyId(null);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setNotice(`Request declined for ${request.requester_name ?? request.requester_email}.`);
    await load();
  }

  async function revoke(grantId: string, name: string | null, email: string) {
    const target = name ?? email;
    await confirm({
      tone: 'warning',
      title: `Revoke access for ${target}?`,
      message: `This staff member will lose this access grant.`,
      confirmLabel: 'Revoke access',
      onConfirm: async () => {
        setBusyId(grantId);
        setError(null);
        setNotice(null);
        try {
          const result = await revokePermissionGrant(grantId);
          if (!result.ok) {
            setError(result.failure.error);
            throw new Error(result.failure.error);
          }
          setNotice(`Access revoked for ${target}.`);
          await load();
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  const pendingRequests = overview?.pendingRequests ?? [];
  const activeGrants = overview?.activeGrants ?? [];

  return (
    <>
      <SEO title="Access | People Growth Africa" description="Review staff access requests and grants." />
      <AdminShell
        title="Access"
        subtitle="Review temporary permissions separately from staff roles."
      >
        {error && (
          <p role="alert" className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-5 rounded-[12px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal">
            {notice}
          </p>
        )}

        <section aria-labelledby="pending-access-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-deep-green">
                Review queue
              </p>
              <h2
                id="pending-access-title"
                className="mt-1 font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold text-charcoal"
              >
                Pending requests
              </h2>
            </div>
            {!loading && (
              <span className="rounded-full bg-[#F7E9D7] px-3 py-1 text-xs font-semibold text-[#754A21]">
                {pendingRequests.length} awaiting review
              </span>
            )}
          </div>

          {loading && !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Loading access requests…
            </p>
          ) : !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Access requests could not be loaded.
            </p>
          ) : pendingRequests.length ? (
            <div className="space-y-4">
              {pendingRequests.map((request) => {
                const duration = Object.prototype.hasOwnProperty.call(durations, request.id)
                  ? durations[request.id]
                  : 30;
                const requesterName = request.requester_name ?? 'No name set';
                return (
                  <article
                    key={request.id}
                    className="overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.025)]"
                  >
                    <div className="border-l-[3px] border-terracotta px-5 py-5 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-[family-name:var(--font-heading)] text-[1.3rem] font-semibold text-charcoal">
                            {requesterName}
                          </h3>
                          <p className="mt-1 break-all text-sm text-charcoal/60">
                            {request.requester_email} · {roleLabel(request.requester_role)}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#F7E9D7] px-3 py-1 text-[0.7rem] font-semibold text-[#754A21]">
                          {formatDate(request.created_at)}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-charcoal/45">
                            Permission requested
                          </p>
                          <p className="mt-1 font-semibold text-deep-green">
                            {permissionLabel(request.permission)}
                          </p>
                          <p className="mt-1 text-xs text-charcoal/50">
                            Requested duration: {requestDurationLabel(request.requested_duration)}
                          </p>
                          <p className="mt-3 border-l-2 border-charcoal/10 pl-3 text-sm leading-relaxed text-charcoal/75">
                            {request.reason}
                          </p>
                        </div>

                        <div className="space-y-3 rounded-[12px] bg-cream/55 p-4">
                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-charcoal/65">
                            Grant duration
                            <select
                              className={inputClass}
                              value={duration ?? ''}
                              onChange={(event) =>
                                setDurations((current) => ({
                                  ...current,
                                  [request.id]:
                                    event.target.value === ''
                                      ? null
                                      : (Number(event.target.value) as 7 | 30 | 90),
                                }))
                              }
                              disabled={busyId === request.id}
                            >
                              <option value="">Permanent</option>
                              <option value="7">7 days</option>
                              <option value="30">30 days</option>
                              <option value="90">90 days</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void approve(request)}
                            disabled={busyId === request.id}
                            className="inline-flex min-h-[42px] w-full cursor-pointer items-center justify-center rounded-[9px] border border-deep-green bg-deep-green px-4 text-sm font-semibold text-white hover:border-brand-green hover:bg-brand-green disabled:cursor-wait disabled:opacity-60"
                          >
                            {busyId === request.id ? 'Saving…' : 'Approve request'}
                          </button>
                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-charcoal/65">
                            Note for declining
                            <textarea
                              className={`${inputClass} min-h-20 resize-y`}
                              maxLength={1000}
                              value={decisionNotes[request.id] ?? ''}
                              onChange={(event) =>
                                setDecisionNotes((current) => ({
                                  ...current,
                                  [request.id]: event.target.value,
                                }))
                              }
                              placeholder="Give the requester context"
                              disabled={busyId === request.id}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void decline(request)}
                            disabled={busyId === request.id}
                            className="inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center rounded-[9px] border border-terracotta/35 bg-white px-4 text-sm font-semibold text-terracotta hover:bg-terracotta/5 disabled:opacity-50"
                          >
                            Decline request
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-charcoal/20 bg-white/70 p-6 text-sm text-charcoal/55">
              The review queue is clear. New staff requests will appear here.
            </p>
          )}
        </section>

        <section aria-labelledby="active-grants-title" className="mt-10">
          <div className="mb-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-deep-green">
              Current access
            </p>
            <h2
              id="active-grants-title"
              className="mt-1 font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold text-charcoal"
            >
              Active grants
            </h2>
          </div>

          {loading && !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Loading grants…
            </p>
          ) : !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Active grants could not be loaded.
            </p>
          ) : activeGrants.length ? (
            <div className="overflow-hidden rounded-[14px] border border-charcoal/10 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-charcoal/10 bg-cream/60 text-[0.67rem] uppercase tracking-[0.12em] text-charcoal/50">
                      <th className="px-5 py-3.5 font-semibold">Staff member</th>
                      <th className="px-5 py-3.5 font-semibold">Permission</th>
                      <th className="px-5 py-3.5 font-semibold">Granted by</th>
                      <th className="px-5 py-3.5 font-semibold">Dates</th>
                      <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGrants.map((grant) => {
                      const review = needsReview(grant.granted_at);
                      return (
                        <tr
                          key={grant.id}
                          className="border-b border-charcoal/[0.07] text-sm text-charcoal last:border-0"
                        >
                          <td className="px-5 py-4">
                            <p className="font-semibold">{grant.user_name ?? 'No name set'}</p>
                            <p className="mt-0.5 break-all text-xs text-charcoal/55">
                              {grant.user_email} · {roleLabel(grant.user_role)}
                            </p>
                            {review && (
                              <span className="mt-2 inline-flex rounded-full bg-[#F7E9D7] px-2.5 py-1 text-[0.65rem] font-semibold text-[#754A21]">
                                Needs review
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 font-medium">{permissionLabel(grant.permission)}</td>
                          <td className="px-5 py-4">
                            <p>{grant.grantor_name ?? 'Staff member'}</p>
                            <p className="mt-0.5 break-all text-xs text-charcoal/50">{grant.grantor_email}</p>
                          </td>
                          <td className="px-5 py-4 text-xs leading-relaxed text-charcoal/60">
                            <p>Granted {formatDate(grant.granted_at)}</p>
                            <p>{grant.expires_at ? `Expires ${formatDate(grant.expires_at)}` : 'No expiry'}</p>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              disabled={busyId === grant.id}
                              onClick={() => void revoke(grant.id, grant.user_name, grant.user_email)}
                              className="min-h-[38px] cursor-pointer rounded-[8px] border border-terracotta/35 bg-white px-4 text-xs font-semibold text-terracotta hover:bg-terracotta/5 disabled:opacity-50"
                            >
                              {busyId === grant.id ? 'Revoking…' : 'Revoke'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-charcoal/20 bg-white/70 p-6 text-sm text-charcoal/55">
              No active permission grants.
            </p>
          )}
        </section>
      </AdminShell>
    </>
  );
}
