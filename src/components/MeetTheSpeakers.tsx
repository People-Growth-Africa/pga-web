import { useEffect, useRef, useState } from 'react';

import SpeakerCarousel from './SpeakerCarousel';
import {
  hasSpeakers,
  speakerInitial,
  speakerLine,
  speakerThumb,
  type SpeakerView,
} from '../lib/speakers';

/**
 * "Meet the speakers" - the block at the end of a post.
 *
 * It renders nothing at all when the post has no speakers or the manager turned
 * the section off, so an older post keeps the exact layout it had before this
 * existed: no heading, no padding, no empty gap.
 *
 * Names, roles and bios are in the page's HTML. That matters for two readers:
 * a crawler that never runs the script sees who is speaking, and the pop
 * animation is decoration on top of text that was already there.
 *
 * The pop is one CSS animation per speaker, revealed by an IntersectionObserver
 * that runs once. Without an observer (or with reduced motion) the row is simply
 * visible from the start - the section never depends on JavaScript to be read.
 */

/** The whole pop: up, overshoot slightly, settle. */
const POP_CSS = `
@keyframes speaker-pop-in {
  0% { opacity: 0; transform: translateY(24px) scale(.5); }
  62% { opacity: 1; transform: translateY(-4px) scale(1.06); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.speaker-pop { opacity: 0; }
.speaker-pop.speaker-pop-in { animation: speaker-pop-in 600ms cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes speaker-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .speaker-pop { opacity: 1; transform: none !important; }
  .speaker-pop.speaker-pop-in {
    animation: speaker-fade-in 200ms ease both !important;
    animation-delay: 0ms !important;
    transform: none !important;
  }
}
`;

/** 250ms between speakers on a wide screen, 150ms on a phone. */
function staggerForViewport(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 250;
  return window.matchMedia('(max-width: 767px)').matches ? 150 : 250;
}

export default function MeetTheSpeakers({
  speakers,
  show = true,
}: {
  speakers?: SpeakerView[] | null;
  show?: boolean;
}) {
  const list = (speakers ?? []).filter((speaker) => speaker.name.trim() !== '');
  const [revealed, setRevealed] = useState(false);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [stagger, setStagger] = useState(250);
  const sectionRef = useRef<HTMLElement>(null);
  // The button that opened the dialog, so closing puts focus back where it was.
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setStagger(staggerForViewport());
  }, []);

  useEffect(() => {
    if (list.length === 0) return;
    const node = sectionRef.current;
    if (!node) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          // Once, as asked: the row does not replay when it is scrolled past.
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.length]);

  if (!show || !hasSpeakers(list)) return null;

  function closeCarousel() {
    setOpenAt(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="speakers-heading"
      className="bg-white py-14"
    >
      <style>{POP_CSS}</style>

      <div className="mx-auto max-w-[1100px] px-6">
        <h2
          id="speakers-heading"
          className="mb-10 text-center font-[family-name:var(--font-heading)] text-[1.7rem] font-semibold text-charcoal sm:text-[2rem]"
        >
          Meet the speakers
        </h2>

        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-10 sm:gap-x-12">
          {list.map((speaker, index) => {
            const photo = speakerThumb(speaker);
            const line = speakerLine(speaker);

            return (
              <li
                key={`${speaker.name}-${index}`}
                className={`speaker-pop w-[136px] ${revealed ? 'speaker-pop-in' : ''}`}
                style={{ animationDelay: `${index * stagger}ms` }}
              >
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${speaker.name}${line ? `, ${line}` : ''}. Open speaker details.`}
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setOpenAt(index);
                  }}
                  className="group flex w-full min-h-[44px] flex-col items-center rounded-[18px] bg-transparent px-1 py-1 text-center transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-4"
                >
                  <span className="block h-32 w-32 overflow-hidden rounded-full bg-mint shadow-card">
                    {photo ? (
                      <img
                        src={photo}
                        srcSet={
                          speaker.photoUrl && speaker.photoThumbUrl
                            ? `${speaker.photoThumbUrl} 96w, ${speaker.photoUrl} 400w`
                            : undefined
                        }
                        sizes="128px"
                        alt=""
                        width={128}
                        height={128}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center font-[family-name:var(--font-heading)] text-4xl font-semibold text-deep-green"
                      >
                        {speakerInitial(speaker.name)}
                      </span>
                    )}
                  </span>
                  <span className="mt-4 block max-w-full break-words font-[family-name:var(--font-body)] text-[0.95rem] font-semibold leading-snug text-charcoal">
                    {speaker.name}
                  </span>
                  {line && (
                    <span className="mt-1 block max-w-full break-words font-[family-name:var(--font-body)] text-[0.82rem] leading-snug text-charcoal/55">
                      {line}
                    </span>
                  )}
                </button>
                {/* The bio is on the page for a crawler and a screen reader; the
                    card itself stays as short as the design asks for. */}
                {speaker.bio && <p className="sr-only">{speaker.bio}</p>}
              </li>
            );
          })}
        </ul>
      </div>

      {openAt !== null && (
        <SpeakerCarousel speakers={list} startIndex={openAt} onClose={closeCarousel} />
      )}
    </section>
  );
}
