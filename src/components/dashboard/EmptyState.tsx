import type { ReactNode } from 'react';
import { LeafGlyph } from './LeafMark';

/**
 * What a region shows when there is nothing in it yet.
 *
 * The skill is explicit that an empty state is a guidance moment, not blank
 * space: it says what belongs here, and it offers the next action (9.5).
 *
 * The small leaf is the product's one piece of personality (12), and `mark` is
 * how a screen spends it: the first empty state on a dashboard opts in, the ones
 * below it do not, so the motif stays a signature moment rather than becoming a
 * treatment repeated down the page (1, 12). A screen with two empty states gets
 * one glyph.
 */
export default function EmptyState({
  headline,
  explanation,
  action,
  mark = false,
}: {
  headline: string;
  explanation: string;
  action?: ReactNode;
  /** Draws the leaf glyph above the headline. At most one per screen. */
  mark?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-charcoal/12 bg-cream/70 px-5 py-7 text-center">
      {mark && <LeafGlyph className="mx-auto h-8 w-8" />}

      <p
        className={`font-[family-name:var(--font-heading)] text-base font-semibold text-charcoal ${
          mark ? 'mt-3' : ''
        }`}
      >
        {headline}
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/65">
        {explanation}
      </p>

      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
