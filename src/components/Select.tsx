import { useId, type ChangeEvent } from 'react';

/**
 * The one dropdown on the site.
 *
 * Every select used to be styled by hand, twice over: the account forms
 * carried `rounded-xl ... text-base` and the lead forms carried
 * `rounded-[12px] ... text-sm`, and each one re-implemented the label, the
 * focus ring and the error wiring. This keeps the markup in one place so the
 * next form (a filter, a dashboard editor) looks like the rest of the site
 * without copying any of that out.
 *
 * It is a native `<select>` underneath on purpose. A custom listbox would need
 * its own keyboard handling, type-ahead, screen reader semantics and mobile
 * behaviour before it matched what the browser already does, and phones get
 * their own picker for free. `appearance-none` plus the chevron below is what
 * makes it look designed rather than operating-system, and the props are
 * neutral enough that the control could be swapped for a custom popup later
 * without touching any call site.
 */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  /** The words above the control. A placeholder is not a label, so this always renders. */
  label: string;
  /** Carries the field through to a form event for callers that read one. */
  name: string;
  /** Controlled value. Pass `''` to sit on the placeholder. */
  value: string;
  onChange: (value: string) => void;
  /** Plain strings become options whose label and value match, or pass pairs. */
  options: ReadonlyArray<string | SelectOption>;
  /** Shown as the empty first option, for example "Select your country". */
  placeholder?: string;
  /** Omit to have one generated; the label targets it either way. */
  id?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  /**
   * Message under the control. It also sets `aria-invalid` and points
   * `aria-describedby` at itself, so an error can never render visually
   * without reaching a screen reader.
   */
  error?: string;
  /** Calmer helper text, used only when there is no error. */
  hint?: string;
  /**
   * Form density. `lg` is the account forms (larger text, rounded-xl), `md` is
   * the standalone booking card (rounded-[12px]), `sm` is the compact fields in
   * the booking modal (rounded-[10px]). Each one keeps the look its form had
   * before this component existed, so nothing on the page shifts by using it.
   */
  size?: 'lg' | 'md' | 'sm';
  /** Extra classes for the wrapper, for grid placement or spacing. */
  className?: string;
}

const SIZES = {
  lg: {
    control: 'rounded-xl px-4 py-3 text-base',
    label: 'text-sm font-semibold text-charcoal mb-1.5',
  },
  md: {
    control: 'rounded-[12px] px-4 py-3 text-sm',
    label: 'text-xs font-semibold text-charcoal/70 mb-1',
  },
  sm: {
    control: 'rounded-[10px] px-3.5 py-2.5 text-xs md:text-sm',
    label: 'text-xs font-semibold text-charcoal/70 mb-1',
  },
} as const;

const BASE_CONTROL =
  'w-full appearance-none bg-white border border-charcoal/20 text-charcoal font-[family-name:var(--font-body)] transition-colors motion-reduce:transition-none focus:outline-none focus:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-charcoal/5';

const ERROR_CONTROL = 'border-terracotta/60 focus:border-terracotta focus-visible:ring-terracotta/40';

function normalize(options: ReadonlyArray<string | SelectOption>): SelectOption[] {
  return options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
}

export function Select({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  id,
  required,
  disabled,
  autoComplete,
  error,
  hint,
  size = 'md',
  className = '',
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = `${selectId}-message`;
  const density = SIZES[size];

  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={selectId} className={density.label}>
        {label}
      </label>

      <div className="group relative">
        <select
          id={selectId}
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={`${BASE_CONTROL} ${density.control} pr-10 ${error ? ERROR_CONTROL : ''}`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {normalize(options).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* The native caret is removed by appearance-none; this one sits with
            the control's padding and follows focus and hover. */}
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/45 transition-colors group-hover:text-deep-green group-focus-within:text-deep-green motion-reduce:transition-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {error ? (
        <p id={messageId} role="alert" className="mt-1.5 text-xs font-[family-name:var(--font-body)] text-terracotta">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs font-[family-name:var(--font-body)] text-charcoal/65">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default Select;
