import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  beginLoading,
  endLoading,
  getLoadingPending,
  getLoadingVisible,
  subscribeLoading,
} from '../lib/loading';

/** The five-bar growth mark from the design, pure CSS. */
export function Loader({
  label = 'Loading',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex flex-col items-center gap-3 ${className}`}
    >
      <div aria-hidden="true" className="flex h-[52px] items-end gap-[6px]">
        {[0, 1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className="loader-bar"
            style={{ animationDelay: `${bar * 90}ms` }}
          />
        ))}
      </div>
      <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/60">
        {label}
      </span>
    </div>
  );
}

/** Mounted inside Suspense: starts the page channel while the chunk loads. */
export function LoadingSignal() {
  useEffect(() => {
    beginLoading('page');
    return () => endLoading('page');
  }, []);
  return null;
}

/**
 * Always mounted at the shell. It stays empty in prerendered HTML and only
 * appears if the page channel has been waiting for more than 250 ms.
 */
export function GlobalPageLoader() {
  const visible = useSyncExternalStore(
    (listener) => subscribeLoading('page', listener),
    () => getLoadingVisible('page'),
    () => false,
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-cream/85 px-6">
      <Loader />
    </div>
  );
}

/** The thin bar on every dashboard route change and fetch. */
export function TopProgressBar() {
  const active = useSyncExternalStore(
    (listener) => subscribeLoading('request', listener),
    () => getLoadingPending('request'),
    () => false,
  );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[var(--z-progress)] h-[3px] overflow-hidden transition-opacity duration-150 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="top-progress-bar h-full w-1/3 bg-deep-green" />
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** Only show a skeleton once the wait is long enough to notice. */
export function useDelayedLoading(active: boolean, delay = 250): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);

  return visible;
}
