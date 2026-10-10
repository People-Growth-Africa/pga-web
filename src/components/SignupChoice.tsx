import { EMPLOYER_FORM_URL, TALENT_FORM_URL } from '../config/signup-links';

/**
 * The one "sign up" entry the site shows while accounts are off.
 *
 * One button used to serve both audiences (talent and employers), because the
 * built-in form asked which you were after you arrived. The Google Forms cannot
 * ask that for us, so the choice is made here instead: two clearly labelled
 * links, each opening its own form in a new tab so the visitor never loses the
 * site. Both carry `rel="noopener noreferrer"` - the standard guard for a link
 * to another origin opened with `target="_blank"`.
 *
 * `variant="menu"` is the compact nav bar dropdown; `variant="panel"` is the
 * full-width pair the `/auth` page shows inside its card. The wording is the
 * same in both, so the choice reads the same wherever it is offered.
 */
const CHOICES = [
  {
    key: 'talent',
    label: 'I am looking for work',
    hint: 'Join our talent network',
    href: TALENT_FORM_URL,
  },
  {
    key: 'employer',
    label: 'I am hiring',
    hint: 'Find people and programmes',
    href: EMPLOYER_FORM_URL,
  },
] as const;

export function SignupChoice({ variant = 'panel' }: { variant?: 'panel' | 'menu' }) {
  if (variant === 'menu') {
    return (
      <ul className="flex flex-col gap-1" aria-label="Sign up">
        {CHOICES.map((choice) => (
          <li key={choice.key}>
            <a
              href={choice.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg px-3 py-2 text-left font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
            >
              {choice.label}
              <span className="mt-0.5 block text-xs font-normal text-charcoal/60">
                {choice.hint}
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {CHOICES.map((choice) => (
        <a
          key={choice.key}
          href={choice.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full flex-col items-start rounded-2xl border border-charcoal/10 bg-white px-5 py-4 transition-colors hover:border-brand-green hover:bg-mint/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          <span className="font-[family-name:var(--font-body)] text-base font-semibold text-deep-green">
            {choice.label}
          </span>
          <span className="mt-0.5 font-[family-name:var(--font-body)] text-sm text-charcoal/60">
            {choice.hint}
          </span>
        </a>
      ))}
    </div>
  );
}

export default SignupChoice;
