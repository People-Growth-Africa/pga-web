import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * The three button weights the dashboards use, in one place so the same action
 * never looks like two different things on two screens (13.6, 14.8).
 *
 * There is one primary weight and it belongs to the screen's single primary
 * action (7.1). Secondary is an outline. Quiet is a text action, and it keeps a
 * 44px tap area even though the words are small (11).
 */
const SHARED =
  'inline-flex items-center justify-center gap-2 rounded-full font-[family-name:var(--font-body)] font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70';

export const primaryButtonClass = `${SHARED} bg-brand-green px-7 py-3.5 text-base text-white hover:bg-terracotta`;

export const secondaryButtonClass = `${SHARED} border-2 border-deep-green px-6 py-3 text-sm text-deep-green hover:bg-deep-green hover:text-white`;

/**
 * A lighter secondary action, for a control that is real but not the point of
 * the screen (changing one detail, for example). It keeps the 44px tap target
 * and the focus ring the same as the buttons above, and it is a button rather
 * than underlined text because these controls are what decide matching
 * eligibility, so they should look like controls (11, 14.7).
 */
export const chipButtonClass = `${SHARED} min-h-[44px] border border-charcoal/25 bg-white px-5 py-2.5 text-sm text-charcoal hover:border-deep-green hover:text-deep-green`;

/**
 * A link inside a sentence ("reset it by email") that still gets a 44px tap
 * area. It is an inline box with a 44px minimum height and negative vertical
 * margins, so the target is genuinely 44px tall while its contribution to the
 * line box is still one line of text: the sentence it sits in does not move or
 * grow (11).
 */
export const inlineLinkClass =
  'inline-flex min-h-[44px] -my-3 items-center rounded-sm font-semibold text-deep-green underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2';

/** A quiet, full-width-when-needed text action that still meets the tap target. */
export function QuietAction({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-1 font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green underline transition-colors motion-reduce:transition-none hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {children}
    </button>
  );
}
