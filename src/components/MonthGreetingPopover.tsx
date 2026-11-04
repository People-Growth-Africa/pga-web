import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * The "Welcome November" greeting that meets visitors as they arrive.
 *
 * It is a limited-time campaign, so the whole thing is gated on the clock rather
 * than on a flag somebody has to remember to switch off:
 *
 *   opens  1 November 2026, 00:00 WAT
 *   closes 3 November 2026, 12:00 WAT
 *
 * WAT (UTC+1) rather than the visitor's own timezone: the greeting is the
 * Lagos office's, so somebody opening the site from London or New York sees it
 * stop on the same afternoon the office stops showing it.
 *
 * Nothing is rendered on the server or in the prerendered HTML. The card is
 * armed in an effect, which keeps the build output free of a campaign that
 * would be stale the moment it shipped, and means the hydrating client and the
 * prerendered markup cannot disagree.
 */
const SHOW_FROM = Date.parse('2026-11-01T00:00:00+01:00');
const SHOW_UNTIL = Date.parse('2026-11-03T12:00:00+01:00');

/**
 * The artwork, by the names it is most likely to be saved under. A photo
 * dropped in as welcome-november.jpg should not leave the card empty just
 * because this file asked for a .png, so each name is tried in turn.
 */
const POSTER_CANDIDATES = [
  '/images/welcome-november.png',
  '/images/welcome-november.jpg',
  '/images/welcome-november.jpeg',
  '/images/welcome-november.webp',
];

/** Long enough for the first paint and the logo intro to have the stage first. */
const APPEAR_DELAY_MS = 900;

/** How long the card takes to leave, after which it is taken out of the DOM. */
const EXIT_MS = 320;

/** setTimeout silently collapses delays past this into "now". */
const MAX_TIMEOUT_MS = 2_147_483_647;

function isWithinWindow(now: number): boolean {
  return now >= SHOW_FROM && now < SHOW_UNTIL;
}

/**
 * The poster, drawn in type. Only used if the artwork has not been dropped into
 * public/images yet (or fails to load), so the greeting still arrives complete
 * instead of as an empty frame.
 */
function PosterFallback() {
  return (
    <div className="relative overflow-hidden bg-[#F1ECE3] px-6 py-9 text-center">
      {/* The two green petals from the bottom of the artwork. */}
      <div className="pointer-events-none absolute -right-10 bottom-0 h-32 w-32 rounded-tl-full bg-deep-green/85" />
      <div className="pointer-events-none absolute -left-16 bottom-8 h-10 w-24 rotate-[-20deg] rounded-full bg-brand-green/60" />

      <img
        src="/images/logo-black.png"
        alt="People Growth Africa"
        className="relative mx-auto h-9 w-auto object-contain"
      />
      <p className="relative mt-7 text-[0.7rem] font-semibold uppercase tracking-[0.42em] text-charcoal/70">
        Welcome
      </p>
      <p className="relative -mt-1 font-[family-name:var(--font-heading)] text-[2.6rem] leading-none font-black uppercase tracking-tight text-charcoal">
        N<span className="text-deep-green">o</span>vember
      </p>
      <p className="relative mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-charcoal/70">
        Happy new month
      </p>
    </div>
  );
}

export default function MonthGreetingPopover() {
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [posterAttempt, setPosterAttempt] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Closing plays the card out, then takes it out of the DOM on a timer. The
  // overlay is never left behind: an invisible full-screen layer would go on
  // swallowing clicks on the page underneath.
  const close = useCallback(() => setIsClosing(true), []);

  useEffect(() => {
    if (!isClosing) return;
    const timer = window.setTimeout(() => {
      setIsMounted(false);
      setIsClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isClosing]);

  // Armed on mount, and disarmed by itself the moment the campaign ends even if
  // the tab has been sitting open since the morning.
  useEffect(() => {
    const now = Date.now();
    if (!isWithinWindow(now)) return;

    const openTimer = window.setTimeout(() => setIsMounted(true), APPEAR_DELAY_MS);

    const remaining = SHOW_UNTIL - now;
    const closeTimer =
      remaining > 0 && remaining < MAX_TIMEOUT_MS
        ? window.setTimeout(close, remaining)
        : null;

    return () => {
      window.clearTimeout(openTimer);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
    };
  }, [close]);

  // Escape closes it, the page behind stops scrolling while it is up, and the
  // close button takes focus so a keyboard visitor is not left tabbing through
  // the page behind the card.
  useEffect(() => {
    if (!isMounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    const previousOverflow = document.body.style.overflow;
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMounted, close]);

  const posterSrc = POSTER_CANDIDATES[posterAttempt];

  const enter = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 240, damping: 22, mass: 0.9 };

  const exitTransition = {
    duration: prefersReducedMotion ? 0 : EXIT_MS / 1000,
    ease: [0.4, 0, 1, 1] as const,
  };

  if (!isMounted) return null;

  return (
    <motion.div
      className={
        'fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6' +
        (isClosing ? ' pointer-events-none' : '')
      }
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: isClosing ? 0 : 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      {/* Scrim. Clicking it closes, the same as the button. */}
      <div className="absolute inset-0 bg-charcoal/70 backdrop-blur-md" onClick={close} aria-hidden="true" />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome November from People Growth Africa"
        className="relative z-10 w-full max-w-[420px]"
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 32 }}
        animate={
          isClosing
            ? { opacity: 0, scale: 0.94, y: 20 }
            : { opacity: 1, scale: 1, y: 0 }
        }
        transition={isClosing ? exitTransition : enter}
      >
        <div className="relative overflow-hidden rounded-[24px] bg-cream shadow-elevated ring-1 ring-charcoal/10">
          <motion.div
            initial={prefersReducedMotion ? false : { scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.9,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {posterSrc === undefined ? (
              <PosterFallback />
            ) : (
              <img
                src={posterSrc}
                alt="Welcome November and happy new month from People Growth Africa"
                className="block h-auto max-h-[calc(100vh-3rem)] w-full object-contain"
                onError={() => setPosterAttempt((attempt) => attempt + 1)}
              />
            )}
          </motion.div>

          {/* Close. Sits over the artwork's cream corner, so it reads as part
              of the card rather than a floating afterthought. */}
          <motion.button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close the Welcome November greeting"
            className="absolute top-3 right-3 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/90 text-deep-green shadow-md ring-1 ring-charcoal/10 backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: prefersReducedMotion ? 0 : 0.35,
              type: 'spring',
              stiffness: 380,
              damping: 20,
            }}
            whileHover={prefersReducedMotion ? undefined : { scale: 1.08, rotate: 90 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.9, rotate: 90 }}
          >
            <svg
              className="h-4 w-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
