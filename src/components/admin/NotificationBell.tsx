import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  unreadCount: number;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [today] = useState(() => new Date().toDateString());

  useEffect(() => {
    let intervalId: number | undefined;
    let startId: number | undefined;
    let cancelled = false;

    const loadCount = async () => {
      const result = await authRequest<{ unreadCount: number }>('/api/admin/notifications-count', { method: 'GET' });
      if (!cancelled && result.ok) {
        setUnreadCount(result.data.unreadCount);
      }
    };

    // The badge is useful, not urgent. It used to fire at the same moment as
    // the dashboard's own requests (and every minute thereafter); starting it
    // after the page has settled, and checking every two minutes, keeps the
    // first screen's network free for the figures someone actually opened it
    // for. Opening the panel still asks immediately.
    const updatePolling = () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (startId !== undefined) window.clearTimeout(startId);
      intervalId = undefined;
      startId = undefined;
      if (document.visibilityState !== 'visible') return;
      startId = window.setTimeout(() => {
        if (cancelled || document.visibilityState !== 'visible') return;
        void loadCount();
        intervalId = window.setInterval(() => {
          if (document.visibilityState === 'visible') void loadCount();
        }, 120_000);
      }, 1_200);
    };

    updatePolling();
    document.addEventListener('visibilitychange', updatePolling);
    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (startId !== undefined) window.clearTimeout(startId);
      document.removeEventListener('visibilitychange', updatePolling);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void authRequest<NotificationResponse>(
      '/api/admin/notifications?page=1&pageSize=10',
      { method: 'GET' },
    ).then((result) => {
      if (!cancelled && result.ok) setNotifications(result.data.notifications);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function markRead(id: string) {
    const result = await authRequest<{ updated: boolean }>('/api/admin/notifications', {
      method: 'PATCH',
      body: { action: 'read', id },
    });
    if (result.ok) {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, read_at: new Date().toISOString() }
            : notification,
        ),
      );
      if (result.data.updated) setUnreadCount((current) => Math.max(0, current - 1));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white hover:bg-white/20"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#C95C3D] px-1 text-center text-xs font-bold leading-5 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="absolute right-0 top-14 z-50 w-[min(90vw,380px)] overflow-hidden rounded-2xl border border-charcoal/10 bg-white text-charcoal shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-charcoal/10 px-5 py-4">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold">Notifications</h2>
            <Link
              to="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-[#0B4B3C] underline underline-offset-2"
            >
              View all
            </Link>
          </div>
          <div className="max-h-[min(65vh,440px)] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-5 py-8 text-sm text-charcoal/60">You’re all caught up.</p>
            ) : (
              ([
                ['Today', notifications.filter((notification) => new Date(notification.created_at).toDateString() === today)],
                ['Earlier', notifications.filter((notification) => new Date(notification.created_at).toDateString() !== today)],
              ] as const).map(([group, items]) => items.length > 0 && (
                <section key={group} aria-label={group}>
                  <h3 className="bg-[#F5F0E7] px-5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-charcoal/50">{group}</h3>
                  {items.map((notification) => {
                const severityClass = notification.severity === 'critical'
                  ? 'border-l-4 border-l-red-600'
                  : notification.severity === 'warning'
                    ? 'border-l-4 border-l-amber-500'
                    : 'border-l-4 border-l-[#0B4B3C]/20';
                const content = (
                  <>
                    <span className="flex items-start gap-2">
                      {!notification.read_at && (
                        <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#C95C3D]" />
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold">{notification.title}</span>
                        <span className="mt-1 block text-sm leading-relaxed text-charcoal/70">{notification.body}</span>
                        <time className="mt-2 block text-xs text-charcoal/45" dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString()}
                        </time>
                      </span>
                    </span>
                  </>
                );
                return notification.href ? (
                  <Link
                    key={notification.id}
                    to={notification.href}
                    onClick={() => {
                      if (!notification.read_at) void markRead(notification.id);
                      setOpen(false);
                    }}
                    className={`block border-b border-charcoal/5 px-5 py-4 no-underline hover:bg-[#F5F0E7] ${severityClass} ${
                      notification.read_at ? 'text-charcoal/75' : 'text-charcoal'
                    }`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={notification.id} className={`border-b border-charcoal/5 px-5 py-4 ${severityClass}`}>
                    {content}
                    {!notification.read_at && (
                      <button
                        type="button"
                        onClick={() => void markRead(notification.id)}
                        className="ml-4 mt-2 text-xs font-semibold text-[#0B4B3C] underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                );
                  })}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
