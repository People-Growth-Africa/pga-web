import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { onSessionEnded } from '../../lib/authClient';
import AccessRequestDialog from './AccessRequestDialog';
import {
  ACCESS_PERMISSIONS,
  cancelAccessRequest,
  listAccess,
  requestAccess,
  type AccessDuration,
  type AccessOverview,
  type AccessPermission,
} from './AccessClient';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

function statusStyle(status: string): string {
  if (status === 'approved') return 'bg-brand-green/10 text-deep-green';
  if (status === 'pending') return 'bg-[#F7E9D7] text-[#754A21]';
  if (status === 'declined') return 'bg-terracotta/10 text-terracotta';
  return 'bg-charcoal/[0.06] text-charcoal/55';
}

export default function AdminMyAccess() {
  const [overview, setOverview] = useState<AccessOverview | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [selectedPermission, setSelectedPermission] = useState<AccessPermission | null>(null);
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

  const latestByPermission = useMemo(() => {
    const latest = new Map<AccessPermission, AccessOverview['requests'][number]>();
    for (const request of overview?.requests ?? []) {
      if (!latest.has(request.permission)) latest.set(request.permission, request);
    }
    return latest;
  }, [overview?.requests]);

  async function submitRequest(
    reason: string,
    requestedDuration: AccessDuration,
  ) {
    if (!selectedPermission) {
      return {
        ok: false as const,
        failure: { error: 'Choose a permission to request.', code: 'invalid_permission' },
      };
    }
    const result = await requestAccess({
      permission: selectedPermission,
      reason,
      requestedDuration,
    });
    if (result.ok) {
      setNotice('Your request was sent for review.');
      await load();
    }
    return result;
  }

  async function cancelRequest(requestId: string) {
    setBusyRequestId(requestId);
    setError(null);
    setNotice(null);
    const result = await cancelAccessRequest(requestId);
    setBusyRequestId(null);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setNotice('Your request was cancelled.');
    await load();
  }

  return (
    <>
      <SEO title="My access | People Growth Africa" description="Review and request staff permissions." />
      <AdminShell
        title="My access"
        subtitle="See what you can do and request additional permissions for your work."
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

        <section aria-labelledby="access-options-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-deep-green">
                Permissions
              </p>
              <h2
                id="access-options-title"
                className="mt-1 font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold text-charcoal"
              >
                Access for your work
              </h2>
            </div>
            <p className="text-xs text-charcoal/50">Your role and active grants are checked on every request.</p>
          </div>

          {loading && !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Loading permissions…
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {ACCESS_PERMISSIONS.map((item) => {
                const request = latestByPermission.get(item.id);
                const hasPermission = overview?.effectivePermissions.includes(item.id) ?? false;
                const pending = request?.status === 'pending';
                return (
                  <article
                    key={item.id}
                    className="flex flex-col justify-between gap-5 rounded-[14px] border border-charcoal/10 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="font-[family-name:var(--font-heading)] text-[1.18rem] font-semibold text-charcoal">
                        {item.label}
                      </h3>
                      <p className="mt-1.5 max-w-[42rem] text-sm leading-relaxed text-charcoal/60">
                        {item.description}
                      </p>
                      {pending && request && (
                        <p className="mt-2 text-xs text-[#754A21]">
                          Requested {formatDate(request.created_at)} · awaiting review
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {hasPermission ? (
                        <span className="inline-flex min-h-[38px] items-center rounded-full bg-brand-green/10 px-4 text-xs font-semibold text-deep-green">
                          Available
                        </span>
                      ) : pending ? (
                        <span className="inline-flex min-h-[38px] items-center rounded-full bg-[#F7E9D7] px-4 text-xs font-semibold text-[#754A21]">
                          Under review
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!overview}
                          onClick={() => {
                            setSelectedPermission(item.id);
                            setError(null);
                            setNotice(null);
                          }}
                          className="inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-white px-4 text-sm font-semibold text-deep-green transition-colors hover:bg-mint disabled:cursor-wait disabled:opacity-50"
                        >
                          Request access
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="request-history-title" className="mt-9">
          <div className="mb-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-deep-green">
              Your activity
            </p>
            <h2
              id="request-history-title"
              className="mt-1 font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold text-charcoal"
            >
              Request history
            </h2>
          </div>
          {loading && !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Loading requests…
            </p>
          ) : !overview ? (
            <p className="rounded-[14px] border border-charcoal/10 bg-white p-5 text-sm text-charcoal/55">
              Request history is unavailable until your access details load.
            </p>
          ) : overview.requests.length ? (
            <div className="space-y-3">
              {overview.requests.map((request) => {
                const permissionLabel =
                  ACCESS_PERMISSIONS.find((item) => item.id === request.permission)?.label ??
                  request.permission;
                return (
                  <article
                    key={request.id}
                    className="rounded-[14px] border border-charcoal/10 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-charcoal">{permissionLabel}</h3>
                        <p className="mt-1 text-xs text-charcoal/50">
                          Requested {formatDate(request.created_at)}
                          {request.requested_duration === null
                            ? ' · preference: permanent'
                            : ` · preference: ${request.requested_duration} days`}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[0.7rem] font-semibold capitalize ${statusStyle(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                    {request.status === 'approved' && (
                      <p className="mt-3 text-sm text-deep-green">
                        {request.grant_expires_at
                          ? `Access expires ${formatDate(request.grant_expires_at)}.`
                          : 'Access has no expiry date.'}
                      </p>
                    )}
                    {request.status === 'declined' && request.decision_note && (
                      <p className="mt-3 rounded-[10px] bg-cream/60 px-3.5 py-3 text-sm leading-relaxed text-charcoal/70">
                        {request.decision_note}
                      </p>
                    )}
                    {request.status === 'pending' && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-charcoal/60">Waiting for the super administrator to review it.</p>
                        <button
                          type="button"
                          disabled={busyRequestId === request.id}
                          onClick={() => void cancelRequest(request.id)}
                          className="min-h-[38px] cursor-pointer rounded-[8px] border border-charcoal/15 bg-white px-4 text-xs font-semibold text-charcoal hover:bg-cream/60 disabled:opacity-50"
                        >
                          {busyRequestId === request.id ? 'Cancelling…' : 'Cancel request'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-charcoal/20 bg-white/70 p-6 text-sm text-charcoal/55">
              No requests yet. Choose a permission above if your work needs access beyond your current role.
            </p>
          )}
        </section>
      </AdminShell>

      {selectedPermission && (
        <AccessRequestDialog
          permission={selectedPermission}
          currentStatus={latestByPermission.get(selectedPermission)?.status ?? null}
          onSubmit={(reason, requestedDuration) =>
            submitRequest(reason, requestedDuration)
          }
          onCancel={() => setSelectedPermission(null)}
        />
      )}
    </>
  );
}
