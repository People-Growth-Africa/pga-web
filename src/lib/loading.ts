/**
 * Two small loading channels shared by the whole app.
 *
 * `page` is for lazy route chunks: it waits 250 ms before showing anything and
 * keeps the loader up for at least 400 ms, so a fast chunk never flashes it and
 * a slow one does not blink. `request` is for dashboard fetches and route
 * changes, which feed the thin top bar.
 *
 * The store lives outside React so the minimum duration survives the Suspense
 * fallback unmounting when the chunk arrives.
 */

export type LoadingKind = 'page' | 'request';

type Channel = {
  pending: number;
  visible: boolean;
  showTimer: number | undefined;
  hideTimer: number | undefined;
  shownAt: number;
};

const channels: Record<LoadingKind, Channel> = {
  page: { pending: 0, visible: false, showTimer: undefined, hideTimer: undefined, shownAt: 0 },
  request: { pending: 0, visible: false, showTimer: undefined, hideTimer: undefined, shownAt: 0 },
};

const listeners: Record<LoadingKind, Set<() => void>> = {
  page: new Set(),
  request: new Set(),
};

function emit(kind: LoadingKind) {
  listeners[kind].forEach((listener) => listener());
}

export function beginLoading(kind: LoadingKind = 'page') {
  const channel = channels[kind];
  channel.pending += 1;

  if (channel.hideTimer !== undefined) {
    window.clearTimeout(channel.hideTimer);
    channel.hideTimer = undefined;
  }
  if (channel.visible || channel.showTimer !== undefined) return;

  channel.showTimer = window.setTimeout(() => {
    channel.showTimer = undefined;
    channel.visible = true;
    channel.shownAt = Date.now();
    emit(kind);
  }, 250);
}

export function endLoading(kind: LoadingKind = 'page') {
  const channel = channels[kind];
  channel.pending = Math.max(0, channel.pending - 1);
  if (channel.pending > 0) return;

  if (channel.showTimer !== undefined) {
    window.clearTimeout(channel.showTimer);
    channel.showTimer = undefined;
  }
  if (!channel.visible || channel.hideTimer !== undefined) return;

  const remaining = Math.max(0, 400 - (Date.now() - channel.shownAt));
  channel.hideTimer = window.setTimeout(() => {
    channel.hideTimer = undefined;
    if (channel.pending > 0) return;
    channel.visible = false;
    emit(kind);
  }, remaining);
}

export function subscribeLoading(kind: LoadingKind, listener: () => void): () => void {
  listeners[kind].add(listener);
  return () => {
    listeners[kind].delete(listener);
  };
}

export function getLoadingVisible(kind: LoadingKind): boolean {
  return channels[kind].visible;
}

export function getLoadingPending(kind: LoadingKind): boolean {
  return channels[kind].pending > 0;
}
