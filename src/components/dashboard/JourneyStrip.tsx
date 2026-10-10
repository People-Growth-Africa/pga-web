import type { Journey, JourneyStage } from '../../lib/dashboard';

/**
 * Where the talent stands, as five labelled stages.
 *
 * A process with a sequence gets a progress indicator rather than a static label
 * (9.3), and the stages are labelled rather than left to dots so nobody has to
 * guess what the shapes mean (7.3). Reached stages use the darker brand green
 * and the mint tint, never the saturated accent: on this screen the accent
 * belongs to the one primary action (5.2). The strip is presentational only, so
 * it is rendered as a plain ordered list with the state spelled out for screen
 * readers.
 */

const STATE_WORDS: Record<JourneyStage['state'], string> = {
  complete: 'done',
  current: 'current step',
  upcoming: 'not open yet',
};

function Node({ state, index }: { state: JourneyStage['state']; index: number }) {
  if (state === 'complete') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-deep-green/30 bg-mint">
        <svg
          className="h-3.5 w-3.5 stroke-deep-green fill-none"
          viewBox="0 0 24 24"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 13 4 4L19 7" />
        </svg>
      </span>
    );
  }

  if (state === 'current') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-deep-green bg-white">
        <span className="h-2.5 w-2.5 rounded-full bg-deep-green" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-charcoal/25 bg-charcoal/5 font-[family-name:var(--font-body)] text-[0.7rem] font-semibold text-charcoal/65">
      {index + 1}
    </span>
  );
}

export default function JourneyStrip({ journey }: { journey: Journey }) {
  const { stages, caption } = journey;

  return (
    <div>
      <ol className="flex items-start gap-1">
        {stages.map(({ stage, state }, index) => (
          <li key={stage.id} className="relative flex flex-1 flex-col items-center text-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`absolute left-[-50%] right-1/2 top-[13px] h-[2px] ${
                  state === 'upcoming' ? 'bg-charcoal/15' : 'bg-deep-green/30'
                }`}
              />
            )}

            <Node state={state} index={index} />

            <span
              className={`mt-2 font-[family-name:var(--font-body)] text-[0.72rem] font-semibold leading-tight ${
                state === 'current'
                  ? 'text-deep-green'
                  : state === 'complete'
                    ? 'text-charcoal'
                    : 'text-charcoal/65'
              }`}
            >
              {stage.label}
              <span className="sr-only"> ({STATE_WORDS[state]})</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-charcoal/10 pt-3 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
        {caption}
      </p>
    </div>
  );
}
