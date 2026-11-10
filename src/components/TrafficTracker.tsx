import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { isStaffRole } from '../lib/authClient';

/**
 * Sends one page view on first load and on every client-side route change.
 *
 * The server assigns a short-lived hit ID so this beacon can enrich the
 * server-side page hit instead of counting the same navigation twice. Staff
 * pages are excluded here and again by routing middleware.
 */
export default function TrafficTracker() {
  const location = useLocation();
  const { user, status } = useAuth();
  const lastTrackedLocation = useRef<string | null>(null);

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

    const route = `${location.pathname}${location.search}`;
    if (lastTrackedLocation.current === route) return;
    const isInitialView = lastTrackedLocation.current === null;
    lastTrackedLocation.current = route;

    // Only the first view can have an external referrer. A client-side route
    // change came from this site, so attributing it to the arrival source would
    // over-count that source.
    const referrer = isInitialView ? document.referrer : '';
    const hitId = isInitialView ? readTrafficHitId() ?? window.crypto.randomUUID() : window.crypto.randomUUID();

    const body = JSON.stringify({
      hitId,
      path: route,
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

function readTrafficHitId(): string | null {
  const entry = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('pga_traffic_hit='));
  const value = entry?.slice('pga_traffic_hit='.length);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}
