import { useEffect, useState, type ReactNode } from 'react';
import { isFirstPaint } from '../lib/firstPaint';

/**
 * The cross-fade between pages.
 *
 * A navigation used to wait for an exit animation and then play an entry one
 * through AnimatePresence, so every click felt a beat slower than the data.
 * The exit is gone and the entry is a CSS animation: the new page mounts
 * immediately and fades in while the browser paints it. Reduced motion and the
 * first paint of a prerendered page both skip the animation entirely; the
 * wrapper element stays in both cases so the hydration markup agrees.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  // Captured once on mount. On the first paint of a prerendered page the
  // finished content is already visible; later mounts are client navigations.
  const [skipEntry] = useState(isFirstPaint);

  useEffect(() => {
    if (window.location.hash) return;
    // `instant`, not `auto`: html sets scroll-behavior: smooth, and auto would
    // glide the new page to the top while it fades in.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  return <div className={skipEntry ? undefined : 'page-enter'}>{children}</div>;
}
