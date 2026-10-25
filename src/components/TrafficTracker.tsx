import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { isStaffRole } from '../lib/authClient';

/**
 * Sends one page view on first load and on every client-side route change.
 *
 * No cookie, no identifier in the browser: the server derives a daily hash from
 * the request and forgets it after two days. Staff pages and Do Not Track are
 * excluded here; the server additionally drops known bots and unknown paths.
 */
export default function TrafficTracker() {
  const location = useLocation();
  const { user, status } = useAuth();
  const firstLoad = useRef(true);

  useEffect(() => {
    // Wait for the session check, otherwise a staff member's first page view
    // would be counted before we knew who they were.
    if (status === 'loading') return;
    // A signed in staff member browsing the public site is not a visitor.
    if (isStaffRole(user?.role)) return;

    const path = location.pathname;
    if (
      path.startsWith('/admin') ||
      path.startsWith('/api') ||
      path.startsWith('/talent') ||
      path.startsWith('/employer') ||
      path.startsWith('/auth') ||
      path.startsWith('/forgot-password')
    ) {
      return;
    }

    const dnt =
      navigator.doNotTrack === '1' ||
      (window as unknown as { doNotTrack?: string }).doNotTrack === '1';
    if (dnt) return;

    // Only the first view can have an external referrer. A client-side route
    // change came from this site, so attributing it to the arrival source would
    // over-count that source.
    const referrer = firstLoad.current ? document.referrer : '';
    firstLoad.current = false;

    const body = JSON.stringify({
      path: `${path}${location.search}`,
      referrer: referrer || undefined,
      utmSource: new URLSearchParams(location.search).get('utm_source') ?? undefined,
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      } else {
        void fetch('/api/track', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      }
    } catch {
      // A page view is never worth an error in the visitor's console.
    }
  }, [location.pathname, location.search, user?.role, status]);

  return null;
}
