import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  speakerInitial,
  speakerLine,
  speakerLinkedIn,
  speakerPhoto,
  type SpeakerView,
} from '../lib/speakers';

/**
 * The floating carousel a reader gets by clicking a speaker.
 *
 * It is a dialog in the accessibility sense, not just visually: focus moves into
 * it, Tab cycles inside it, Escape closes it, and the page behind does not
 * scroll. The caller owns the "return focus" half - it knows which speaker
 * button was pressed - so `onClose` is the only way out.
 *
 * Everything here is CSS transitions and a little state. No animation library:
 * the whole motion budget is one pop on the centre card and a 350ms slide
 * between speakers, and both are switched off when the reader asks for reduced
 * motion.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function SpeakerCarousel({
  speakers,
  startIndex = 0,
  onClose,
}: {
  speakers: SpeakerView[];
  startIndex?: number;
  onClose: () => void;
}) {
  const count = speakers.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)),
  );
  const [direction, setDirection] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  /** A portal needs a document; an opened dialog is always a client event. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const go = useCallback(
    (step: number) => {
      if (count < 2) return;
      setDirection(step);
      setIndex((current) => (current + step + count) % count);
    },
    [count],
  );

  // Opening the dialog takes the focus and the scrollbar; closing gives both
  // back. Stored rather than assumed, because a page can already be locked.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // The dialog only exists once `mounted` flips, so this has to wait for it:
  // with an empty dependency list the ref was still null and focus never left
  // the page behind the backdrop.
  useEffect(() => {
    if (mounted) closeRef.current?.focus();
  }, [mounted]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;

    // Focus trap: the browser would otherwise walk out of the dialog into the
    // page behind it, which is still there and still looks reachable.
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleTouchStart(event: React.TouchEvent) {
    const point = event.touches[0];
    if (point) touch.current = { x: point.clientX, y: point.clientY };
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = touch.current;
    const point = event.changedTouches[0];
    touch.current = null;
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    // A horizontal swipe, not a vertical scroll of a long bio.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  if (!mounted || count === 0) return null;

  const speaker = speakers[index]!;
  const previous = speakers[(index - 1 + count) % count]!;
  const next = speakers[(index + 1) % count]!;
  const photo = speakerPhoto(speaker);
  const linkedIn = speakerLinkedIn(speaker);
  const line = speakerLine(speaker);

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <style>{CAROUSEL_CSS}</style>

      <button
        type="button"
        aria-label="Close speaker details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default border-none bg-deep-green/85 backdrop-blur-md"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="speaker-dialog-name"
        onKeyDown={handleKeyDown}
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))]"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close speaker details"
          className="pointer-events-auto absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-charcoal shadow-card transition-colors hover:bg-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 md:right-8 md:top-8"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="pointer-events-none relative flex w-full max-w-[1060px] items-center justify-center">
          {/* Neighbours peek at the sides on a wide screen. They are decoration:
              the arrows, the dots, the keys and the swipe are the controls. */}
          {count > 1 && (
            <>
              <div
                aria-hidden="true"
                key={`prev-${index}`}
                className="speaker-neighbour pointer-events-none absolute left-0 hidden h-[300px] w-[300px] rounded-[26px] bg-white/90 lg:block"
                style={{ transform: 'translateX(-8%) rotate(-4deg) scale(.86)' }}
              >
                <div className="flex h-full items-center justify-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint/80 font-[family-name:var(--font-heading)] text-xl font-semibold text-deep-green/60">
                    {speakerInitial(previous.name)}
                  </span>
                </div>
              </div>
              <div
                aria-hidden="true"
                key={`next-${index}`}
                className="speaker-neighbour pointer-events-none absolute right-0 hidden h-[300px] w-[300px] rounded-[26px] bg-white/90 lg:block"
                style={{ transform: 'translateX(8%) rotate(4deg) scale(.86)' }}
              >
                <div className="flex h-full items-center justify-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint/80 font-[family-name:var(--font-heading)] text-xl font-semibold text-deep-green/60">
                    {speakerInitial(next.name)}
                  </span>
                </div>
              </div>
            </>
          )}

          {count > 1 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous speaker"
              className="pointer-events-auto absolute left-2 z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-deep-green text-white shadow-card transition-colors hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex lg:left-[-3.25rem]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}

          {count > 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next speaker"
              className="pointer-events-auto absolute right-2 z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-deep-green text-white shadow-card transition-colors hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex lg:right-[-3.25rem]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}

          {/* Two levels on purpose: the track slides, the card pops, and two
              animations never fight over the same transform. */}
          <div
            key={index}
            className="speaker-track pointer-events-auto relative w-full md:w-[600px]"
            style={{ '--slide-from': direction > 0 ? '48px' : '-48px' } as React.CSSProperties}
          >
          <div
            className="speaker-slide relative w-full rounded-[26px] bg-white shadow-elevated"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain p-5 md:max-h-[calc(100dvh-9rem)] md:p-7">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-7">
                <div className="h-[220px] w-full shrink-0 overflow-hidden rounded-[18px] bg-mint md:h-[220px] md:w-[220px]">
                  {photo ? (
                    <img
                      src={photo}
                      alt={speaker.name}
                      className="h-full w-full object-cover"
                      loading="eager"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-full w-full items-center justify-center font-[family-name:var(--font-heading)] text-6xl font-semibold text-deep-green"
                    >
                      {speakerInitial(speaker.name)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-brand-green">
                    Speaker {index + 1} of {count}
                  </p>
                  <h2
                    id="speaker-dialog-name"
                    className="mt-2 break-words font-[family-name:var(--font-heading)] text-[1.6rem] font-semibold leading-tight text-charcoal md:text-[1.9rem]"
                  >
                    {speaker.name}
                  </h2>
                  {line && (
                    <p className="mt-1.5 font-[family-name:var(--font-body)] text-[0.95rem] font-medium text-charcoal/70">
                      {line}
                    </p>
                  )}
                  {speaker.bio && (
                    <p className="mt-4 whitespace-pre-line break-words font-[family-name:var(--font-body)] text-[0.95rem] leading-relaxed text-charcoal/60">
                      {speaker.bio}
                    </p>
                  )}
                  {linkedIn && (
                    <a
                      href={linkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 font-[family-name:var(--font-body)] text-[0.92rem] font-semibold text-deep-green underline decoration-brand-green/40 underline-offset-4 transition-colors hover:text-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                    >
                      LinkedIn
                      <span aria-hidden="true">→</span>
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        {/* Announced, not seen: the visible position line is inside the card. */}
        <p aria-live="polite" className="sr-only">
          Speaker {index + 1} of {count}
        </p>

        {count > 1 && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-center gap-1 px-4">
            {speakers.map((entry, dotIndex) => (
              <button
                key={`${entry.name}-${dotIndex}`}
                type="button"
                title={`Go to ${entry.name}`}
                onClick={() => {
                  setDirection(dotIndex > index ? 1 : -1);
                  setIndex(dotIndex);
                }}
                aria-label={`Show speaker ${dotIndex + 1}: ${entry.name}`}
                aria-current={dotIndex === index ? 'true' : undefined}
                className="flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2.5 rounded-full transition-all duration-300 ${
                    dotIndex === index ? 'w-8 bg-white' : 'w-2.5 bg-white/40'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Inline styles rather than a stylesheet: these keyframes exist for this
 * component alone, and the site's CSS is built from src/, so a rule here travels
 * with the component that needs it. The reduced-motion block comes last on
 * purpose - it has to win over the animations above.
 */
const CAROUSEL_CSS = `
@keyframes speaker-slide-in {
  from { opacity: .5; transform: translateX(var(--slide-from, 0)) scale(.98); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes speaker-card-pop {
  from { opacity: 0; transform: translateY(16px) scale(.94); }
  60% { opacity: 1; transform: translateY(0) scale(1.02); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.speaker-track { animation: speaker-slide-in 350ms ease both; }
.speaker-slide { animation: speaker-card-pop 500ms cubic-bezier(.2,.9,.3,1.2) both; }
/* No slide animation here: its final transform would replace the deliberate
   scale/rotation that places the peek beside the card. */
.speaker-neighbour { opacity: .35; }
@media (max-width: 1023px) {
  .speaker-neighbour { display: none; }
}
@keyframes speaker-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .speaker-track, .speaker-slide { animation: speaker-fade-in 200ms ease both !important; transform: none !important; }
  .speaker-neighbour { animation: none !important; opacity: .35 !important; transform: none !important; }
}
`;
