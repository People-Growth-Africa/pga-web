import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { authRequest } from '../../lib/authClient';

type Notification = {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  href: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationResponse = {
  notifications: Notification[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
};

export default function AdminNotifications() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    const result = await authRequest<NotificationResponse>(
      `/api/admin/notifications?page=${page}&pageSize=20&unreadOnly=${unreadOnly}`,
      { method: 'GET' },
    );
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.failure.error);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markRead(id: string) {
    const result = await authRequest('/api/admin/notifications', {
      method: 'PATCH',
      body: { action: 'read', id },
    });
    if (result.ok) await loadNotifications();
  }

  async function markAllRead() {
    const result = await authRequest('/api/admin/notifications', {
      method: 'PATCH',
      body: { action: 'all' },
    });
    if (result.ok) await loadNotifications();
  }

  const pageCount = Math.max(1, Math.ceil((data?.totalCount ?? 0) / 20));

  return (
    <>
      <SEO title="Notifications | People Growth Africa" description="Review your staff notifications." />
      <AdminShell
        title="Notifications"
        subtitle="Updates that are relevant to your staff account."
        actions={
          <>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={!data?.unreadCount}
              className="rounded-full border border-[#0B4B3C]/25 px-4 py-2 text-sm font-semibold text-[#0B4B3C] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Mark all read
            </button>
            <label className="flex items-center gap-2 text-sm font-medium text-charcoal/75">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => {
                    setPage(1);
                    setUnreadOnly(event.target.checked);
                }}
                className="accent-[#0B4B3C]"
              />
              Unread only
            </label>
          </>
        }
      >
        {data && (
          <p className="mb-4 text-sm text-charcoal/60" aria-live="polite">
            {data.unreadCount} unread notification{data.unreadCount === 1 ? '' : 's'}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {!data && !error ? (
          <p className="py-12 text-center text-charcoal/55" aria-busy="true">Loading notifications…</p>
        ) : data?.notifications.length ? (
          <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
            {data.notifications.map((notification) => (
              <article
                key={notification.id}
                className={`flex items-start justify-between gap-5 border-b border-charcoal/10 px-5 py-5 last:border-0 sm:px-7 ${
                  notification.severity === 'critical'
                    ? 'border-l-4 border-l-red-600'
                    : notification.severity === 'warning'
                      ? 'border-l-4 border-l-amber-500'
                      : ''
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  {!notification.read_at && (
                    <span aria-label="Unread" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#C95C3D]" />
                  )}
                  <div>
                    <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal">
                      {notification.href ? (
                        <Link
                          to={notification.href}
                          onClick={() => {
                            if (!notification.read_at) void markRead(notification.id);
                          }}
                          className="text-inherit underline decoration-charcoal/20 underline-offset-2 hover:decoration-charcoal"
                        >
                          {notification.title}
                        </Link>
                      ) : notification.title}
                    </h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/70">
                      {notification.body}
                    </p>
                    <time className="mt-3 block text-xs text-charcoal/45" dateTime={notification.created_at}>
                      {new Date(notification.created_at).toLocaleString()}
                    </time>
                  </div>
                </div>
                {!notification.read_at && (
                  <button
                    type="button"
                    onClick={() => void markRead(notification.id)}
                    className="shrink-0 text-sm font-semibold text-[#0B4B3C] underline underline-offset-2"
                  >
                    Mark read
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : !error ? (
          <div className="rounded-2xl border border-charcoal/10 bg-white px-6 py-14 text-center text-charcoal/60">
            You’re all caught up.
          </div>
        ) : null}
        {data && pageCount > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-full border border-charcoal/20 px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-charcoal/60">Page {page} of {pageCount}</span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-full border border-charcoal/20 px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </AdminShell>
    </>
  );
}
