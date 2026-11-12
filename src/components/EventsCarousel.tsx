import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import EventCard from './EventCard';
import HoverPill from './HoverPill';
import type { EventItem } from '../data/events';

interface EventsCarouselProps {
  events: EventItem[];
  onRegister: (event: EventItem) => void;
}

/** Mirrors the track's `gap-6`, so the slide stride includes the gutter. */
const GAP_PX = 24;
/** How long each slide is held before the carousel advances on its own. */
const AUTOPLAY_MS = 4500;
/** After a click anywhere inside, hold still this long before resuming, so the
 *  card someone just opened does not slide away underneath them. */
const INTERACTION_HOLD_MS = 12_000;

/** Normal one-step slide. */
const SLIDE_TRANSITION = { type: 'spring', stiffness: 260, damping: 28 } as const;
/** Used only when the track wraps past the end: a long, eased sweep reads as a
 *  deliberate rewind rather than a jump cut. */
const REWIND_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] } as const;
const FLIP_TRANSITION = { duration: 0.55, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;

export default function EventsCarousel({ events, onRegister }: EventsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(3);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [holdingAfterClick, setHoldingAfterClick] = useState(false);
  const [playIntent, setPlayIntent] = useState(true);
  // Deliberately open until told otherwise: some embedded and occluded
  // webviews never deliver an IntersectionObserver callback at all, and a
  // carousel that simply never moves is a worse failure than one that advances
  // a little early. A normal browser reports the real value within a frame.
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [isRewinding, setIsRewinding] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const interactionTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  // One card at a time is presented as a stacked deck whose cards flip over one
  // another. A sliding track can only line up when the card width is known, and
  // at phone widths the old percentage maths drifted so the wrong card showed.
  const isDeck = cardsPerView === 1;

  // Update cards per view based on viewport width
  useEffect(() => {
    const updateCardsPerView = () => {
      if (window.innerWidth < 640) {
        setCardsPerView(1);
      } else if (window.innerWidth < 1024) {
        setCardsPerView(2);
      } else {
        setCardsPerView(3);
      }
    };
    updateCardsPerView();
    window.addEventListener('resize', updateCardsPerView);
    return () => window.removeEventListener('resize', updateCardsPerView);
  }, []);

  // The multi-card track is shifted in real pixels. Measuring the track removes
  // the guesswork of expressing the 24px gap as a percentage of the container.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const measure = () => setWrapperWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Auto-advancing content that nobody is looking at is wasted work: the timer
  // waits until the carousel is on screen, and stops again once it scrolls away.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '120px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Browsers already throttle timers in background tabs, but not the animation
  // frames that follow a queued advance, so the tab state is tracked directly.
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const maxIndex = Math.max(0, events.length - cardsPerView);
  // A resize can leave the stored index past the end of a shortened track, so
  // the value that is actually rendered is clamped instead of being written
  // back to state (which would cost an extra render).
  const activeIndex = Math.min(currentIndex, maxIndex);
  const cardWidth =
    wrapperWidth > 0 ? (wrapperWidth - (cardsPerView - 1) * GAP_PX) / cardsPerView : 0;
  const stride = cardWidth + GAP_PX;

  // A click counts as "stop moving for a moment": timers are cleared on every
  // interaction and only one is ever live at a time.
  const noteInteraction = useCallback(() => {
    setHoldingAfterClick(true);
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(
      () => setHoldingAfterClick(false),
      INTERACTION_HOLD_MS,
    );
  }, []);

  useEffect(
    () => () => {
      if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
    },
    [],
  );

  const goTo = useCallback(
    (next: number) => {
      noteInteraction();
      setIsRewinding(false);
      setCurrentIndex(next);
    },
    [noteInteraction],
  );

  const handlePrev = useCallback(() => {
    noteInteraction();
    if (activeIndex === 0) {
      setIsRewinding(true);
      setCurrentIndex(maxIndex);
      return;
    }
    setIsRewinding(false);
    setCurrentIndex(activeIndex - 1);
  }, [activeIndex, maxIndex, noteInteraction]);

  const handleNext = useCallback(() => {
    noteInteraction();
    if (activeIndex >= maxIndex) {
      setIsRewinding(true);
      setCurrentIndex(0);
      return;
    }
    setIsRewinding(false);
    setCurrentIndex(activeIndex + 1);
  }, [activeIndex, maxIndex, noteInteraction]);

  const canAutoPlay =
    playIntent &&
    !isHovering &&
    !holdingAfterClick &&
    inView &&
    pageVisible &&
    !reducedMotion &&
    maxIndex > 0;

  // One timeout per advance rather than one interval for the whole run: the
  // countdown restarts from the real index after every interaction, and the
  // effect re-arms with a fresh closure, so no stale index can be advanced.
  useEffect(() => {
    if (!canAutoPlay) return;
    const id = window.setTimeout(() => {
      if (activeIndex >= maxIndex) {
        setIsRewinding(true);
        setCurrentIndex(0);
        return;
      }
      setIsRewinding(false);
      setCurrentIndex(activeIndex + 1);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [canAutoPlay, activeIndex, maxIndex]);

  const slideTransition = useMemo(() => {
    if (reducedMotion) return INSTANT;
    return isRewinding ? REWIND_TRANSITION : SLIDE_TRANSITION;
  }, [isRewinding, reducedMotion]);

  const flipTransition = reducedMotion ? INSTANT : FLIP_TRANSITION;
  const showControls = maxIndex > 0;

  return (
    <div
      className="relative"
      ref={wrapperRef}
      onPointerEnter={() => setIsHovering(true)}
      onPointerLeave={() => setIsHovering(false)}
      onFocusCapture={() => setIsHovering(true)}
      onBlurCapture={() => setIsHovering(false)}
      onPointerDown={noteInteraction}
    >
      {/* Carousel Navigation Header Controls */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-deep-green">
            {isDeck
              ? `Showing ${activeIndex + 1} of ${events.length} programmes`
              : `Showing ${activeIndex + 1}\u2013${Math.min(
                  activeIndex + cardsPerView,
                  events.length,
                )} of ${events.length} programmes`}
          </span>
        </div>

        {showControls && (
          <div className="flex items-center gap-2">
            {/* An auto-advancing carousel needs a way to stop it, so the toggle
                is always available rather than only implicit through hovering. */}
            {!reducedMotion && (
              <button
                type="button"
                onClick={() => setPlayIntent((current) => !current)}
                aria-label={playIntent ? 'Pause automatic scrolling' : 'Resume automatic scrolling'}
                className="group relative w-10 h-10 rounded-full border border-charcoal/20 bg-white hover:bg-mint hover:border-brand-green/50 flex items-center justify-center text-charcoal transition-all cursor-pointer shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
              >
                {playIntent ? (
                  <svg
                    className="w-4 h-4 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                <HoverPill
                  label={playIntent ? 'Pause auto-scroll' : 'Resume auto-scroll'}
                  align="center"
                />
              </button>
            )}

            {/* Arrow Controls */}
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous events slide"
              className="w-10 h-10 rounded-full border border-charcoal/20 bg-white hover:bg-mint hover:border-brand-green/50 flex items-center justify-center text-charcoal transition-all cursor-pointer shadow-sm"
            >
              <svg
                className="w-4 h-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"
                viewBox="0 0 24 24"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next events slide"
              className="w-10 h-10 rounded-full border border-charcoal/20 bg-white hover:bg-mint hover:border-brand-green/50 flex items-center justify-center text-charcoal transition-all cursor-pointer shadow-sm"
            >
              <svg
                className="w-4 h-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"
                viewBox="0 0 24 24"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {isDeck ? (
        /* Every card shares one grid cell, so they flip over one another while
           the section keeps the height of the tallest card instead of
           collapsing or jumping between slides. */
        <div className="grid" style={{ perspective: '1200px' }}>
          {events.map((event, index) => {
            const isActive = index === activeIndex;
            return (
              <motion.div
                key={event.id}
                className="col-start-1 row-start-1"
                inert={!isActive}
                initial={false}
                animate={{
                  opacity: isActive ? 1 : 0,
                  rotateY: isActive ? 0 : index < activeIndex ? -35 : 35,
                  scale: isActive ? 1 : 0.94,
                }}
                transition={flipTransition}
                style={{
                  transformStyle: 'preserve-3d',
                  pointerEvents: isActive ? 'auto' : 'none',
                  zIndex: isActive ? 2 : 1,
                }}
              >
                <EventCard event={event} featured={event.featured} onRegister={onRegister} />
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* Tablet and desktop keep the multi-card track, shifted by a measured
           pixel stride so the cards stay aligned. */
        <div className="overflow-hidden">
          <motion.div
            className="flex gap-6"
            animate={{ x: -activeIndex * stride }}
            transition={slideTransition}
            onAnimationComplete={() => setIsRewinding(false)}
          >
            {events.map((event) => (
              <div
                key={event.id}
                className="flex-shrink-0"
                style={{
                  width: `calc(${100 / cardsPerView}% - ${
                    (GAP_PX * (cardsPerView - 1)) / cardsPerView
                  }px)`,
                }}
              >
                <div className="h-full">
                  <EventCard event={event} featured={event.featured} onRegister={onRegister} />
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      )}

      {/* Carousel Indicator Dots */}
      {showControls && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={activeIndex === i}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                activeIndex === i ? 'w-8 bg-brand-green' : 'w-2 bg-charcoal/20 hover:bg-charcoal/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
