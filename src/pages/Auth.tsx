import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ContourPanel } from '../components/ContourPattern';
import AuthComingSoon from '../components/AuthComingSoon';
import Select from '../components/Select';
import { accountScreensOpen } from '../lib/accountGate';
import SEO from '../components/SEO';
import { COUNTRIES, TALENT_FIELDS } from '../data/options';
import { useAuth } from '../hooks/useAuth';
import {
  AVAILABILITY_OPTIONS,
  NEED_OPTIONS,
  authRequest,
  dashboardPath,
  type AuthUser,
  type Role,
} from '../lib/authClient';

type Tab = 'signup' | 'login';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_CARDS: { value: Role; title: string; description: string }[] = [
  { value: 'talent', title: 'Talent', description: 'Find roles that match your skills' },
  { value: 'employer', title: 'Employer', description: 'Hire talent or book a consultation' },
];

const PANEL_COPY: Record<Role | 'login', { headline: string; text: string }> = {
  login: {
    headline: 'Welcome back.',
    text: 'Log in to pick up where you left off.',
  },
  talent: {
    headline: 'Find where your skills belong.',
    text: 'Create a talent profile and get matched with employers hiring across Africa.',
  },
  employer: {
    headline: 'Find the people your team needs.',
    text: 'Find vetted talent, or book a consultation on growing your team.',
  },
};

const inputClass =
  'w-full rounded-xl border border-charcoal/20 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-base text-charcoal placeholder:text-charcoal/40 transition-colors motion-reduce:transition-none focus:border-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-1';

const labelClass =
  'block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1.5';

const helpClass = 'mt-1.5 font-[family-name:var(--font-body)] text-xs text-charcoal/60';

export default function Auth() {
  const { status, user, setUser, refresh } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('signup');
  const [role, setRole] = useState<Role>('talent');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [field, setField] = useState('');
  const [country, setCountry] = useState('');
  const [availability, setAvailability] = useState('');
  const [company, setCompany] = useState('');
  const [needs, setNeeds] = useState<string[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The URL hash selects the tab, so /auth#login and /auth#signup can be linked.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash !== 'login' && hash !== 'signup') return;
      // Going back or following a link to the other tab is a tab switch like
      // any other, so the messages from the previous tab must not come along.
      setTab(hash);
      setFormError(null);
      setFieldErrors({});
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  if (status === 'signedIn' && user) {
    return <Navigate to={dashboardPath(user.role)} replace />;
  }

  // The public site shows a coming soon page here until the launch is a
  // deliberate decision; every environment the work happens in keeps the real
  // forms. A signed in session never reaches this line, so existing accounts are
  // unaffected (src/lib/accountGate.ts has the whole rule).
  if (!accountScreensOpen(window.location.hostname)) {
    return <AuthComingSoon />;
  }

  const isSignup = tab === 'signup';
  const panel = PANEL_COPY[isSignup ? role : 'login'];
  const submitLabel = !isSignup
    ? 'Log in'
    : role === 'talent'
      ? 'Create talent account'
      : 'Create employer account';

  function selectTab(next: Tab) {
    setTab(next);
    setFormError(null);
    setFieldErrors({});
    window.history.replaceState(null, '', `${window.location.pathname}#${next}`);
  }

  function selectRole(next: Role) {
    setRole(next);
    setFormError(null);
    setFieldErrors({});
  }

  function toggleNeed(value: string) {
    setNeeds((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();

    // Signing in collects an email and a password only, so the name is checked
    // only on the tab that actually asks for it. Checking it on both tabs made
    // every log in fail with "Enter your full name." and no field to type it in.
    if (isSignup) {
      if (!trimmedName) {
        errors.name = role === 'employer' ? 'Enter the contact person.' : 'Enter your full name.';
      } else if (trimmedName.length > 100) {
        errors.name = 'Name must be 100 characters or fewer.';
      }
    }

    if (isSignup && role === 'employer') {
      if (!company.trim()) errors.company = 'Enter your company or organisation.';
      else if (company.trim().length > 150) errors.company = 'Company must be 150 characters or fewer.';
    }

    if (isSignup && role === 'talent') {
      // Both of these are selects now, so the only way to fail the first check
      // is to leave the placeholder option in place.
      if (!field.trim()) errors.field = 'Select your field or main skill.';
      else if (field.trim().length > 100) errors.field = 'Field must be 100 characters or fewer.';
      if (country.trim().length > 60) errors.country = 'Country must be 60 characters or fewer.';
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) errors.email = 'Enter your email address.';
    else if (trimmedEmail.length > 254) errors.email = 'Email must be 254 characters or fewer.';
    else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Enter an email address in the form name@example.com.';
    }

    if (!password) {
      errors.password = 'Enter your password.';
    } else if (isSignup && password.length < 8) {
      errors.password = 'Use at least 8 characters.';
    } else if (password.length > 128) {
      errors.password = 'Password must be 128 characters or fewer.';
    }

    if (isSignup && role === 'employer' && needs.length === 0) {
      errors.needs = 'Choose at least one: find talent or book a consultation.';
    }

    if (isSignup && !acceptedTerms) {
      errors.acceptedTerms = 'Agree to the terms and privacy policy to continue.';
    }

    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstKey = Object.keys(errors)[0] ?? '';
      setFormError(errors[firstKey] ?? 'Check the highlighted fields.');
      document.getElementById(`auth-${firstKey}`)?.focus();
      return;
    }

    setSubmitting(true);

    const body = isSignup
      ? role === 'talent'
        ? {
            role,
            name: name.trim(),
            email: email.trim(),
            password,
            field: field.trim(),
            ...(country.trim() ? { country: country.trim() } : {}),
            ...(availability ? { availability } : {}),
            acceptedTerms: true,
          }
        : {
            role,
            name: name.trim(),
            company: company.trim(),
            email: email.trim(),
            password,
            needs,
            acceptedTerms: true,
          }
      : { email: email.trim(), password };

    const result = await authRequest<{ user: AuthUser; redirect?: string }>(
      isSignup ? '/api/auth/signup' : '/api/auth/login',
      { body },
    );

    if (!result.ok) {
      setSubmitting(false);
      setFieldErrors(result.failure.fields ?? {});
      setFormError(result.failure.error);
      return;
    }

    setUser(result.data.user);
    // The login response carries no profile, so read the full session once and
    // let the dashboard render complete details on its first paint.
    const fullUser = await refresh();
    navigate(
      result.data.redirect ?? dashboardPath(fullUser?.role ?? result.data.user.role),
      { replace: true },
    );
  }

  return (
    <>
      <SEO
        title="Account | People Growth Africa"
        description="Create a talent or employer account with People Growth Africa, or log in to your existing account."
        url="/auth"
      />

      <section className="bg-cream min-h-screen relative">
        {/* Dark band behind the fixed navbar, matching every other page. */}
        <div className="absolute inset-x-0 top-0 h-[100px] bg-deep-green" aria-hidden="true" />
        <div className="relative max-w-[1000px] mx-auto px-5 md:px-6 pt-[130px] pb-[70px]">
          <div className="grid gap-6 min-[820px]:grid-cols-[minmax(0,1fr)_460px] min-[820px]:gap-8">
            {/* Brand panel. The ribbon artwork is inline SVG, so /auth loads no
                external images at all. Dimensions, padding and copy unchanged. */}
            <aside className="min-[820px]:h-full">
              <ContourPanel
                variant="portrait"
                art="ribbons"
                className="h-full flex flex-col justify-start px-6 py-7 min-[820px]:px-10 min-[820px]:py-12"
              >
                {/* Brand lockup, not a control: it sat inside the form card's
                    panel and read as the page's own heading, so making it a
                    link to the home page tempted people away mid-signup. */}
                <div className="inline-flex items-center gap-2.5 mb-5">
                  <img
                    src="/images/icon-white.png"
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9"
                    loading="lazy"
                  />
                  <span className="font-[family-name:var(--font-body)] text-sm font-semibold tracking-wide">
                    People Growth Africa
                  </span>
                </div>

                <h1
                  className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.2] mb-3"
                  style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.4rem)' }}
                >
                  {panel.headline}
                </h1>
                <p className="font-[family-name:var(--font-body)] text-white/80 text-sm md:text-base leading-relaxed max-w-[38ch]">
                  {panel.text}
                </p>
              </ContourPanel>
            </aside>

            {/* Form card */}
            <div className="w-full max-w-[460px] mx-auto min-[820px]:mx-0 rounded-[20px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-5 py-6 min-[820px]:px-8 min-[820px]:py-8">
              <div className="flex gap-6 border-b border-charcoal/10 mb-6" role="tablist" aria-label="Account">
                {(
                  [
                    { value: 'signup' as Tab, label: 'Create account' },
                    { value: 'login' as Tab, label: 'Log in' },
                  ] satisfies { value: Tab; label: string }[]
                ).map((item) => {
                  const active = tab === item.value;
                  return (
                    <button
                      key={item.value}
                      id={`auth-tab-${item.value}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls="auth-panel"
                      tabIndex={active ? 0 : -1}
                      onClick={() => selectTab(item.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                        event.preventDefault();
                        const next: Tab = tab === 'signup' ? 'login' : 'signup';
                        selectTab(next);
                        document.getElementById(`auth-tab-${next}`)?.focus();
                      }}
                      className={`-mb-px border-b-2 pb-3 font-[family-name:var(--font-body)] text-sm font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 rounded-sm ${
                        active
                          ? 'border-brand-green text-deep-green'
                          : 'border-transparent text-charcoal/55 hover:text-charcoal'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div id="auth-panel" role="tabpanel">
                <h2 className="sr-only">{isSignup ? 'Create your account' : 'Log in to your account'}</h2>

                {formError && (
                  <p
                    role="alert"
                    className="mb-5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal"
                  >
                    {formError}
                  </p>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  {isSignup && (
                    <>
                      <fieldset className="mb-5">
                        <legend className={labelClass}>I am joining as</legend>
                        <div className="grid gap-3 min-[420px]:grid-cols-2">
                          {ROLE_CARDS.map((card) => {
                            const active = role === card.value;
                            return (
                              <label
                                key={card.value}
                                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-green has-[:focus-visible]:ring-offset-1 ${
                                  active
                                    ? 'border-brand-green bg-mint/60'
                                    : 'border-charcoal/20 bg-white hover:border-brand-green/60'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="role"
                                  value={card.value}
                                  checked={active}
                                  onChange={() => selectRole(card.value)}
                                  className="peer mt-0.5 h-4 w-4 shrink-0 accent-[#0F6E56] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                                />
                                <span>
                                  <span className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal">
                                    {card.title}
                                  </span>
                                  <span className="block font-[family-name:var(--font-body)] text-xs text-charcoal/65 mt-0.5">
                                    {card.description}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>

                      <div className="mb-4">
                        <label className={labelClass} htmlFor="auth-name">
                          {role === 'employer' ? 'Contact person' : 'Full name'}
                        </label>
                        <input
                          id="auth-name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          placeholder={
                            role === 'employer' ? 'e.g. Ngozi Okafor' : 'e.g. Adebayo Oladele'
                          }
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          className={inputClass}
                          aria-invalid={Boolean(fieldErrors.name)}
                          aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
                        />
                        {fieldErrors.name && (
                          <p id="auth-name-error" className={helpClass}>
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>

                      {role === 'employer' && (
                        <div className="mb-4">
                          <label className={labelClass} htmlFor="auth-company">
                            Company or organisation
                          </label>
                          <input
                            id="auth-company"
                            name="company"
                            type="text"
                            autoComplete="organization"
                            placeholder="e.g. Sterling Ventures"
                            value={company}
                            onChange={(event) => setCompany(event.target.value)}
                            className={inputClass}
                            aria-invalid={Boolean(fieldErrors.company)}
                            aria-describedby={fieldErrors.company ? 'auth-company-error' : undefined}
                          />
                          {fieldErrors.company && (
                            <p id="auth-company-error" className={helpClass}>
                              {fieldErrors.company}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mb-4">
                        <label className={labelClass} htmlFor="auth-email">
                          Email
                        </label>
                        <input
                          id="auth-email"
                          name="email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="name@company.com"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className={inputClass}
                          aria-invalid={Boolean(fieldErrors.email)}
                          aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                        />
                        {fieldErrors.email && (
                          <p id="auth-email-error" className={helpClass}>
                            {fieldErrors.email}
                          </p>
                        )}
                      </div>

                      {role === 'employer' ? (
                        <fieldset className="mb-4">
                          <legend className={labelClass}>What do you need help with?</legend>
                          <div className="flex flex-col gap-2.5">
                            {NEED_OPTIONS.map((option) => (
                              <label
                                key={option.value}
                                className="flex cursor-pointer items-center gap-3 font-[family-name:var(--font-body)] text-sm text-charcoal"
                              >
                                <input
                                  id={`auth-needs-${option.value}`}
                                  name="needs"
                                  type="checkbox"
                                  value={option.value}
                                  checked={needs.includes(option.value)}
                                  onChange={() => toggleNeed(option.value)}
                                  className="h-4 w-4 shrink-0 accent-[#0F6E56] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                          <p id="auth-needs-error" className={helpClass} role={fieldErrors.needs ? 'alert' : undefined}>
                            {fieldErrors.needs ?? 'Choose at least one.'}
                          </p>
                        </fieldset>
                      ) : (
                        <>
                          <div className="mb-4">
                            {/* A select rather than a free text box: the list is
                                what the dashboard and any future matching would
                                read, so it should not be a spelling lottery. */}
                            <Select
                              id="auth-field"
                              name="field"
                              label="Field or main skill"
                              placeholder="Select your field or main skill"
                              options={TALENT_FIELDS}
                              autoComplete="off"
                              size="lg"
                              value={field}
                              onChange={setField}
                              error={fieldErrors.field}
                            />
                          </div>

                          <div className="mb-4">
                            <Select
                              id="auth-country"
                              name="country"
                              label="Country"
                              placeholder="Select your country"
                              options={COUNTRIES}
                              autoComplete="country-name"
                              size="lg"
                              value={country}
                              onChange={setCountry}
                              error={fieldErrors.country}
                              hint="Optional. It tells us where you are when we match you with roles."
                            />
                          </div>

                          <div className="mb-4">
                            <Select
                              id="auth-availability"
                              name="availability"
                              label="Availability"
                              placeholder="Select availability"
                              options={AVAILABILITY_OPTIONS}
                              size="lg"
                              value={availability}
                              onChange={setAvailability}
                            />
                          </div>
                        </>
                      )}

                      <div className="mb-4">
                        <label className={labelClass} htmlFor="auth-password">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className={`${inputClass} pr-20`}
                            aria-invalid={Boolean(fieldErrors.password)}
                            aria-describedby={
                              fieldErrors.password ? 'auth-password-error' : 'auth-password-help'
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            aria-pressed={showPassword}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm px-2 py-1 font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {fieldErrors.password ? (
                          <p id="auth-password-error" className={helpClass}>
                            {fieldErrors.password}
                          </p>
                        ) : (
                          <p id="auth-password-help" className={helpClass}>
                            Use at least 8 characters.
                          </p>
                        )}
                      </div>

                      <div className="mb-6">
                        <label className="flex cursor-pointer items-start gap-3 font-[family-name:var(--font-body)] text-sm text-charcoal/80">
                          <input
                            id="auth-acceptedTerms"
                            name="acceptedTerms"
                            type="checkbox"
                            checked={acceptedTerms}
                            onChange={(event) => setAcceptedTerms(event.target.checked)}
                            aria-invalid={Boolean(fieldErrors.acceptedTerms)}
                            aria-describedby={
                              fieldErrors.acceptedTerms ? 'auth-acceptedTerms-error' : undefined
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#0F6E56] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                          />
                          <span>
                            I agree to the{' '}
                            <Link to="/terms" className="font-semibold text-deep-green underline">
                              terms
                            </Link>{' '}
                            and{' '}
                            <Link to="/privacy" className="font-semibold text-deep-green underline">
                              privacy policy
                            </Link>
                            .
                          </span>
                        </label>
                        {fieldErrors.acceptedTerms && (
                          <p id="auth-acceptedTerms-error" className={helpClass}>
                            {fieldErrors.acceptedTerms}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {!isSignup && (
                    <>
                      <div className="mb-4">
                        <label className={labelClass} htmlFor="auth-email">
                          Email
                        </label>
                        <input
                          id="auth-email"
                          name="email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="name@company.com"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className={inputClass}
                          aria-invalid={Boolean(fieldErrors.email)}
                          aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                        />
                        {fieldErrors.email && (
                          <p id="auth-email-error" className={helpClass}>
                            {fieldErrors.email}
                          </p>
                        )}
                      </div>

                      <div className="mb-2">
                        <label className={labelClass} htmlFor="auth-password">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="Your password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className={`${inputClass} pr-20`}
                            aria-invalid={Boolean(fieldErrors.password)}
                            aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            aria-pressed={showPassword}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm px-2 py-1 font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {fieldErrors.password && (
                          <p id="auth-password-error" className={helpClass}>
                            {fieldErrors.password}
                          </p>
                        )}
                      </div>

                      <div className="mb-6 text-right">
                        <Link
                          to="/forgot-password"
                          className="font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green rounded-sm"
                        >
                          Forgot your password?
                        </Link>
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    aria-busy={submitting}
                    className="w-full inline-flex items-center justify-center rounded-full bg-brand-green px-6 py-3.5 font-[family-name:var(--font-body)] text-base font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Please wait' : submitLabel}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
