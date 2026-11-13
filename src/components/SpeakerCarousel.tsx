import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  speakerFocus,
  speakerInitial,
  speakerLine,
  speakerLinkedIn,
  speakerPhoto,
  type SpeakerView,
} from '../lib/speakers';

/**
 * The floating portrait card a reader gets by clicking a speaker.
 *
 * The photo fills the card and the text sits on a progressive blur at the bottom:
 * the face stays readable, the copy stays legible on a light photo, and the two
 * meet without a visible edge. The card only knows the speaker, its neighbours
 * and the focal point each photo carries.
 *
 * It is a dialog in the accessibility sense: focus moves into it, Tab cycles
 * inside it, Escape closes it and the page behind does not scroll. The opener
 * is passed in so it can return focus to the exact card or button that launched
 * it. Everything here is CSS transitions and component state; no animation
 * library is needed.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** The bio is clamped in the card; below this length "More" would do nothing. */
const BIO_NEEDS_MORE = 120;

export default function SpeakerCarousel({
  speakers,
  startIndex = 0,
  opener = null,
  onClose,
}: {
  speakers: SpeakerView[];
  startIndex?: number;
  opener?: HTMLElement | null;
  onClose: () => void;
}) {
  const count = speakers.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)),
  );
  const [direction, setDirection] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const speaker = speakers[index]!;
  const previous = speakers[(index - 1 + count) % count]!;
  const next = speakers[(index + 1) % count]!;
  const photo = speakerPhoto(speaker);
  const line = speakerLine(speaker);
  const linkedIn = speakerLinkedIn(speaker);
  const hasMore = Boolean(speaker.bio && speaker.bio.length > BIO_NEEDS_MORE);

  const go = useCallback(
    (step: number) => {
      if (count < 2) return;
      setDirection(step);
      setExpanded(false);
      setIndex((current) => (current + step + count) % count);
    },
    [count],
  );

  // Opening the dialog takes the focus and the scrollbar; closing gives both
  // back. The body's own value is restored rather than assumed, because a page
  // can already be locked when this opens.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, [opener]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Preload the centre and its two neighbours; the rest load only if visited.
  useEffect(() => {
    for (const entry of [speaker, previous, next]) {
      const url = entry.photoUrl ?? entry.photoThumbUrl;
      if (!url) continue;
      const image = new Image();
      image.src = url;
    }
  }, [speaker, previous, next]);

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

    // Focus trap: the page behind is still there and still looks reachable.
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
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

  if (count === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-carousel)]">
      <style>{CAROUSEL_CSS}</style>

      <button
        type="button"
        aria-label="Close speaker details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default border-none bg-[#161a19]/90 backdrop-blur-md"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="speaker-dialog-name"
        onKeyDown={handleKeyDown}
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,env(safe-area-inset-top))]"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close speaker details"
          className="pointer-events-auto absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-8 md:top-8"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="relative mx-auto flex w-full max-w-[1100px] flex-1 items-center justify-center">
          <div className="relative flex w-[320px] items-center justify-center md:w-[340px]">
            {/* Neighbours: only the two adjacent cards exist, and only the sliver
                outside the centre card is visible. Clicking one moves to it. */}
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={`Previous speaker: ${previous.name}`}
                  className="speaker-neighbour absolute right-[calc(100%-24px)] top-0 z-0 h-full w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#10231d] md:right-[calc(100%+32px)]"
                >
                  <NeighbourFace speaker={previous} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label={`Next speaker: ${next.name}`}
                  className="speaker-neighbour absolute left-[calc(100%-24px)] top-0 z-0 h-full w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#10231d] md:left-[calc(100%+32px)]"
                >
                  <NeighbourFace speaker={next} />
                </button>
              </>
            )}

            {count > 1 && (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous speaker"
                className="pointer-events-auto absolute -left-[4.5rem] top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}

            {count > 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next speaker"
                className="pointer-events-auto absolute -right-[4.5rem] top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            )}

            {/* Two levels: the track slides, the card pops, and the two never
                fight over one transform. */}
            <div
              key={index}
              className="speaker-track pointer-events-auto relative z-10 w-full"
              style={{ '--slide-from': direction > 0 ? '48px' : '-48px' } as React.CSSProperties}
            >
              <div
                className="speaker-slide relative w-full"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <article className="relative h-[min(620px,calc(100dvh-9.5rem))] w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#10231d] shadow-[0_30px_80px_rgba(0,0,0,0.55)] md:h-[580px]">
                  {photo ? (
                    <img
                      src={photo}
                      alt={`${speaker.name}${line ? `, ${line}` : ''}`}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: speakerFocus(speaker) }}
                      loading="eager"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#7fc7ae] to-[#0f3b2f]">
                      <span className="font-[family-name:var(--font-heading)] text-7xl font-semibold text-white/90">
                        {speakerInitial(speaker.name)}
                      </span>
                    </div>
                  )}

                  {/* 1. Progressive blur over the bottom 58%. */}
                  <div
                    aria-hidden="true"
                    className="speaker-blur pointer-events-none absolute inset-x-0 bottom-0 h-[58%] [backdrop-filter:blur(16px)] [-webkit-backdrop-filter:blur(16px)] [mask-image:linear-gradient(to_bottom,transparent,#000_55%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,#000_55%)]"
                  />
                  {/* 2. Dark gradient under the text. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-[#0a1c17] via-[#0a1c17]/75 to-transparent"
                  />

                  {/* 3. Text. */}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 text-white md:p-6">
                    <p className="font-[family-name:var(--font-body)] text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#9be8c9]">
                      Speaker {index + 1} of {count}
                    </p>
                    <h2
                      id="speaker-dialog-name"
                      className="break-words font-[family-name:var(--font-heading)] text-[1.5rem] font-semibold leading-tight md:text-[1.75rem]"
                    >
                      {speaker.name}
                    </h2>
                    {line && (
                      <p className="break-words font-[family-name:var(--font-body)] text-[0.82rem] font-medium text-white/75">
                        {line}
                      </p>
                    )}
                    {speaker.bio && (
                      <div className="mt-1">
                        <p
                          className={`break-words font-[family-name:var(--font-body)] text-[0.85rem] leading-relaxed text-white/80 ${
                            expanded
                              ? 'max-h-[340px] overflow-y-auto pr-1 md:max-h-[360px]'
                              : 'line-clamp-3'
                          }`}
                        >
                          {speaker.bio}
                        </p>
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => setExpanded((value) => !value)}
                            aria-expanded={expanded}
                            className="mt-1 min-h-[36px] font-[family-name:var(--font-body)] text-[0.85rem] font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          >
                            {expanded ? 'Less' : 'More'}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-white/45">
                        ← swipe →
                      </span>
                      {linkedIn && (
                        <a
                          href={linkedIn}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-5 font-[family-name:var(--font-body)] text-[0.88rem] font-semibold text-[#0a1c17] transition-colors hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1c17]"
                        >
                          LinkedIn
                          <span aria-hidden="true">↗</span>
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>

        {/* Announced, not seen. */}
        <p aria-live="polite" className="sr-only">
          Speaker {index + 1} of {count}: {speaker.name}
        </p>

        {count > 1 && (
          <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-1">
            {speakers.map((entry, dotIndex) => (
              <button
                key={`${entry.name}-${dotIndex}`}
                type="button"
                title={`Go to ${entry.name}`}
                onClick={() => {
                  if (dotIndex === index) return;
                  setDirection(dotIndex > index ? 1 : -1);
                  setExpanded(false);
                  setIndex(dotIndex);
                }}
                aria-label={`Show speaker ${dotIndex + 1}: ${entry.name}`}
                aria-current={dotIndex === index ? 'true' : undefined}
                className="flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    dotIndex === index ? 'w-6 bg-white' : 'w-2 bg-white/35'
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

/** A neighbour's photo, dimmed and blurred by the card that wraps it. */
function NeighbourFace({ speaker }: { speaker: SpeakerView }) {
  const photo = speakerPhoto(speaker);
  return (
    <span className="block h-full w-full">
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="eager"
          className="h-full w-full object-cover"
          style={{ objectPosition: speakerFocus(speaker) }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#7fc7ae] to-[#0f3b2f] font-[family-name:var(--font-heading)] text-7xl font-semibold text-white/80">
          {speakerInitial(speaker.name)}
        </span>
      )}
    </span>
  );
}

/**
 * Clamped line count for the bio is a utility class from the site's stylesheet;
 * these keyframes are for this component alone. The reduced-motion block comes
 * last on purpose. The @supports block replaces a blur that would not render
 * with a stronger gradient, so the text stays legible either way.
 */
const CAROUSEL_CSS = `
@keyframes speaker-slide-in {
  from { opacity: .5; transform: translateX(var(--slide-from, 0)) scale(.98); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes speaker-card-pop {
  from { opacity: 0; transform: translateY(16px) scale(.96); }
  60% { opacity: 1; transform: translateY(0) scale(1.015); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.speaker-track { animation: speaker-slide-in 350ms ease both; }
.speaker-slide { animation: speaker-card-pop 500ms cubic-bezier(.2,.9,.3,1.2) both; }
.speaker-neighbour {
  opacity: .4;
  transform: scale(.9);
  filter: blur(3px);
}
.speaker-neighbour:hover, .speaker-neighbour:focus-visible { opacity: .55; }
@media (max-width: 767px) {
  .speaker-neighbour { transform: scale(1); filter: blur(2px); }
}
@keyframes speaker-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .speaker-track, .speaker-slide { animation: speaker-fade-in 200ms ease both !important; transform: none !important; }
  .speaker-neighbour { animation: none !important; transform: scale(.9) !important; }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .speaker-blur { background: linear-gradient(to bottom, transparent, rgba(10,28,23,.62) 55%, rgba(10,28,23,.8)); }
}
`;
