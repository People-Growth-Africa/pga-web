import { FORMS_CONTACT_EMAIL, FORMS_UNAVAILABLE_MESSAGE } from '../lib/formsAvailability';

/**
 * What a public form shows in place of its fields while the server has no
 * database to write to.
 *
 * The server still answers 503 with the same words (see `databaseUnavailable`),
 * so this is the same message as before, only delivered before the visitor fills
 * anything in. The message is split around the address so the one copy of the
 * wording can still carry a working mail link rather than repeating it.
 */
export default function FormsUnavailableNotice({ className = '' }: { className?: string }) {
  const [before, after] = FORMS_UNAVAILABLE_MESSAGE.split(FORMS_CONTACT_EMAIL);

  return (
    <div
      role="status"
      className={`rounded-[14px] border border-terracotta/30 bg-terracotta/10 px-5 py-5 text-sm leading-relaxed text-charcoal/80 ${className}`}
    >
      <p className="font-[family-name:var(--font-heading)] text-base font-semibold text-charcoal mb-1.5">
        Temporarily unavailable
      </p>
      <p>
        {before}
        <a
          href={`mailto:${FORMS_CONTACT_EMAIL}`}
          className="font-semibold text-deep-green underline decoration-brand-green/60 underline-offset-2 transition-colors hover:text-terracotta"
        >
          {FORMS_CONTACT_EMAIL}
        </a>
        {after}
      </p>
    </div>
  );
}

/**
 * The beat between opening a form and the server saying whether there is a
 * database behind it.
 *
 * It is deliberately quiet, and it is what stands in for the fields so the form
 * is never shown and then taken away: a visitor who has started typing loses
 * nothing, because nothing was asked of them yet.
 */
export function FormAvailabilityPending({ className = '' }: { className?: string }) {
  return (
    <p
      role="status"
      className={`font-[family-name:var(--font-body)] text-sm text-charcoal/50 ${className}`}
    >
      Checking availability…
    </p>
  );
}
