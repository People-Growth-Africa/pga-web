/**
 * The brand's leaf, used in exactly two ways and nowhere else: the corner of the
 * one primary action card on each dashboard, and a small mark at the top of a
 * screen's first empty state (EmptyState's `mark` prop, set once per screen).
 *
 * The skill reserves novelty for a product's one or two signature moments (1)
 * and asks for personality at emotional or repeated moments such as empty states
 * (12). Spending the mark on the primary card and one empty state per screen
 * keeps it meaningful; the rest of the surface stays restrained, and no other
 * card in the app carries it.
 */

/** The leaf drawn in its own space: tips at (0,0) and (130,0), blade either side. */
const BLADE = 'M0,0 Q65,-60 130,0 Q65,60 0,0 Z';
const MIDRIB = 'M7,0 C 45,-3 85,-3 123,0';
const VEINS_UP = 'M36,0 L54,-18 M62,0 L80,-18 M88,0 L104,-13';
const VEINS_DOWN = 'M36,0 L54,18 M62,0 L80,18 M88,0 L104,13';

/**
 * The corner of the next step card, shaped as a leaf.
 *
 * The drawing is positioned to the card's top right and sized in that corner,
 * and the leaf is rotated so its two tips sit exactly on the card's top and
 * right edges, which is what makes it read as the corner rather than as a
 * sticker near it. It is decorative, so it is hidden from assistive technology,
 * it never takes a tap, and it sits behind the content.
 */
export function LeafCorner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute right-0 top-0 z-0 text-brand-green ${className}`}
      viewBox="0 0 112 112"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(45) scale(1.2185)">
        <path d={BLADE} className="fill-current opacity-[0.14]" />
        <g
          className="fill-none stroke-current opacity-40"
          strokeWidth={1.3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <path d={MIDRIB} vectorEffect="non-scaling-stroke" />
          <path d={VEINS_UP} vectorEffect="non-scaling-stroke" />
          <path d={VEINS_DOWN} vectorEffect="non-scaling-stroke" />
        </g>
      </g>
    </svg>
  );
}

/** The same leaf at a small size, for an empty state that needs a mark, not a decoration. */
export function LeafGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`text-brand-green ${className}`}
      viewBox="-6 -62 142 124"
      aria-hidden="true"
      focusable="false"
    >
      <path d={BLADE} className="fill-current opacity-[0.16]" />
      <g
        className="fill-none stroke-current opacity-45"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d={MIDRIB} />
        <path d={VEINS_UP} />
        <path d={VEINS_DOWN} />
      </g>
    </svg>
  );
}
