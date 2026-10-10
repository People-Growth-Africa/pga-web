import { useId, type ReactNode } from 'react';

/**
 * One titled region of a dashboard.
 *
 * A card is used because each of these is one coherent, glanceable unit that a
 * visitor scans on every visit (7.2). The heading is a real h2 so the page has a
 * navigable outline rather than a stack of styled paragraphs.
 */
export default function DashboardSection({
  title,
  description,
  status,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  /** Sits at the end of the heading row, for example the "Opens soon" chip. */
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-5 py-6 md:px-8 md:py-8 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2
          id={headingId}
          className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal"
        >
          {title}
        </h2>
        {status}
      </div>

      {description && (
        <p className="mt-2 max-w-[60ch] font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/65">
          {description}
        </p>
      )}

      <div className={description ? 'mt-5' : 'mt-4'}>{children}</div>
    </section>
  );
}

/**
 * Marks a region that is designed but not switched on yet.
 *
 * It is neutral grey, not amber: the product's amber (terracotta) means "this
 * needs your attention" (an unconfirmed address, a refused save), and a region
 * that simply has not opened yet is information rather than a problem. Two
 * different meanings on one colour is the anti pattern the skill names outright
 * (5.3 semantic colours, 16). The label text keeps enough contrast to read
 * comfortably on the tint.
 */
export function PendingChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-charcoal/[0.08] px-3 py-1 font-[family-name:var(--font-body)] text-xs font-semibold text-charcoal/75">
      <span className="h-1.5 w-1.5 rounded-full bg-charcoal/40" aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * The one way this app reports the result of an action: mint for something that
 * worked, pale amber for something that did not. Every message is a full
 * sentence with a next step in it, because a bare "error" tells a person
 * nothing they can act on (9.4).
 */
export function StateMessage({
  tone,
  children,
}: {
  tone: 'success' | 'error';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-deep-green/25 bg-mint text-deep-green'
      : 'border-terracotta/40 bg-terracotta/10 text-charcoal';

  return (
    <p
      role={tone === 'success' ? 'status' : 'alert'}
      className={`mt-4 rounded-xl border px-4 py-3 font-[family-name:var(--font-body)] text-sm leading-relaxed ${toneClass}`}
    >
      {children}
    </p>
  );
}
