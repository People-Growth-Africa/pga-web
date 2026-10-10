import { useId, type ReactNode } from 'react';
import { LeafCorner } from './LeafMark';

/**
 * The one card that carries the leaf corner, and the only card on a dashboard
 * whose button uses the saturated accent.
 *
 * Everything about it is there to make the single most important thing on the
 * screen unmissable: it sits directly under the greeting, it is the largest
 * isolated surface, the accent is spent only here (2, 5.2), and the leaf corner
 * is the product's one signature moment rather than a treatment repeated across
 * the page (1, 12).
 *
 * The heading block keeps clear of the corner mark so the words never sit under
 * it, and the mark is decorative: hidden from assistive technology and out of
 * the way of taps.
 */
export default function NextStepCard({
  id,
  headline,
  description,
  dependency,
  children,
  className = '',
}: {
  /** Lets another region of the page scroll back to this card. */
  id?: string;
  headline: string;
  description: string;
  /**
   * Optional note between the description and the control, for a prerequisite
   * that is not this card's own step: the account's email address being
   * unconfirmed, for example. Saying it here is what stops the card from
   * reading as more important than the thing it depends on (2, 14.1).
   */
  dependency?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();

  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={`relative overflow-hidden rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-5 py-6 focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 md:px-8 md:py-8 ${className}`}
    >
      <LeafCorner className="h-[76px] w-[76px] md:h-[104px] md:w-[104px]" />

      <div className="relative z-[1]">
        <p className="font-[family-name:var(--font-body)] text-xs font-semibold tracking-[0.08em] text-deep-green">
          Your next step
        </p>

        <h2
          id={headingId}
          className="mt-2 pr-16 font-[family-name:var(--font-heading)] font-semibold leading-[1.25] text-charcoal md:pr-24"
          style={{ fontSize: 'clamp(1.35rem, 3.2vw, 1.7rem)' }}
        >
          {headline}
        </h2>

        <p className="mt-2 max-w-[52ch] pr-16 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70 md:pr-24 md:text-base">
          {description}
        </p>

        {dependency && <div className="mt-4">{dependency}</div>}

        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}
