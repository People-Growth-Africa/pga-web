import type { ReactNode } from 'react';

export type DashboardDetail = {
  label: string;
  value: string;
  /** True when nothing has been set yet, so the row can say so quietly. */
  missing?: boolean;
  /** Inline content after the value, for example the confirmation state. */
  note?: ReactNode;
};

/**
 * The read back list on both dashboards.
 *
 * Labels sit above their values, everything shares one left edge, and a value
 * that has not been set is quieter than one that has, so a filled profile is
 * readable at a glance without reading every line (3, 4).
 *
 * grid-cols-1 and min-w-0 are load bearing rather than decorative: these rows
 * hold user text, and an implicit grid column is sized `auto`, so a single long
 * unbroken name widened the column past the card and pushed the page sideways.
 * A definite minmax(0,1fr) track cannot, and break-words on the value wraps the
 * word once the column tells it how much room it has (13.7, 14.2).
 */
export default function DetailList({ details }: { details: readonly DashboardDetail[] }) {
  return (
    <dl className="grid grid-cols-1 gap-4">
      {details.map((detail) => (
        <div key={detail.label} className="min-w-0">
          <dt className="font-[family-name:var(--font-body)] text-xs font-semibold text-charcoal/65">
            {detail.label}
          </dt>
          <dd
            className={`mt-0.5 break-words font-[family-name:var(--font-body)] text-base ${
              detail.missing ? 'text-charcoal/65' : 'text-charcoal'
            }`}
          >
            {detail.value}
            {detail.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}
