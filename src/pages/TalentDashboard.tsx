import { useState, type FormEvent } from 'react';
import SEO from '../components/SEO';
import RequireAuth from '../components/RequireAuth';
import DashboardPanel from '../components/DashboardPanel';
import DashboardSection, { PendingChip, StateMessage } from '../components/dashboard/DashboardSection';
import DetailList, { type DashboardDetail } from '../components/dashboard/DetailList';
import EmailStatusNote from '../components/dashboard/EmailStatusNote';
import EmptyState from '../components/dashboard/EmptyState';
import JourneyStrip from '../components/dashboard/JourneyStrip';
import NextStepCard from '../components/dashboard/NextStepCard';
import { ConfirmEmailButton } from '../components/dashboard/EmailConfirmation';
import { chipButtonClass, primaryButtonClass, QuietAction } from '../components/dashboard/DashboardButtons';
import Select from '../components/Select';
import { COUNTRIES } from '../data/options';
import { useAuth } from '../hooks/useAuth';
import { AVAILABILITY_OPTIONS, authRequest, availabilityLabel, type TalentProfile } from '../lib/authClient';
import {
  MATCHED_ROLES,
  profileDetailValues,
  profileIsMatchReady,
  profileStrength,
  talentJourney,
  talentProfileOf,
} from '../lib/dashboard';

/** The card shows either the step it worked out, or the one a link asked for. */
type Step = 'auto' | 'availability' | 'country';

const NEXT_STEP_ID = 'talent-next-step';

function goToNextStep() {
  const card = document.getElementById(NEXT_STEP_ID);
  if (!card) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

  // Focus, not just scroll: a keyboard user who activates a link has to land
  // where the eye does. The card's first control is the action itself, and the
  // card itself is the fallback for a step that has no control.
  const control = card.querySelector<HTMLElement>('input, select, button, a[href]');
  (control ?? card).focus({ preventScroll: true });
}

export default function TalentDashboard() {
  const { user, refresh } = useAuth();
  const profile = talentProfileOf(user);
  const strength = profileStrength(profile);
  const filled = profileDetailValues(profile);

  const journey = talentJourney({
    profileComplete: profileIsMatchReady(profile),
    emailVerified: Boolean(user?.emailVerified),
  });

  const [step, setStep] = useState<Step>('auto');
  const [availability, setAvailability] = useState('');
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // What the controls show: the choice just made, or what the profile already
  // says, so an edit starts from the current answer rather than from blank.
  const availabilityValue = availability || profile?.availability || '';
  const countryValue = country || profile?.country || '';

  // Availability is the one answer matching needs and the only one a talent can
  // leave unset by design, so it is the step the card resolves to. Country is
  // optional, so it is offered from the settled state instead of demanded first.
  const activeStep: Step =
    step !== 'auto' ? step : filled.availability ? 'auto' : 'availability';
  const cannotBeFixedHere = strength.missing === 'name' || strength.missing === 'field';

  /**
   * The step that outranks every other one. Confirming the address is the only
   * stage of the journey that no other control on the page can move: without it
   * the account cannot be emailed about anything, so while it is open the card
   * becomes that step, with the primary button that moves it (2, 7.1, 14.1). The
   * notice that used to sit above the cards is off for this screen, so the
   * message is said once, where it is acted on (1, 3).
   */
  const emailUnconfirmed = Boolean(user) && !user?.emailVerified;
  // A chip that was just tapped still has to be able to open its editor, so the
  // confirmation step wins only while the card is on its own default step.
  const emailStepActive = emailUnconfirmed && step === 'auto';

  async function save(body: { availability?: string; country?: string }, successText: string) {
    if (saving) return;
    setSaving(true);
    setStepError(null);
    setFeedback(null);

    const result = await authRequest<{ ok: boolean; profile: TalentProfile }>('/api/talent/profile', {
      body,
    });

    if (!result.ok) {
      setSaving(false);
      setFeedback({ tone: 'error', text: result.failure.error });
      return;
    }

    // The session carries the profile, so the screen is read back from the
    // account rather than from what was typed. It also keeps the journey strip
    // and the details list in step with the save.
    await refresh();
    setSaving(false);
    setAvailability('');
    setCountry('');
    setStep('auto');
    setFeedback({ tone: 'success', text: successText });
  }

  async function handleAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availabilityValue) {
      setStepError('Choose when you can start, then save.');
      return;
    }
    await save(
      { availability: availabilityValue },
      `Saved. Your availability is now "${availabilityLabel(availabilityValue)}".`,
    );
  }

  async function handleCountry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(
      { country: countryValue },
      countryValue
        ? 'Saved. Your country is on your profile.'
        : 'Saved. Your country was cleared from your profile.',
    );
  }

  const details: DashboardDetail[] = [
    { label: 'Full name', value: profile?.name?.trim() || 'Not set', missing: !filled.name },
    { label: 'Field or main skill', value: profile?.field?.trim() || 'Not set', missing: !filled.field },
    {
      label: 'Country',
      value: profile?.country?.trim() || 'Not set',
      missing: !filled.country,
    },
    {
      label: 'Availability',
      value: filled.availability ? availabilityLabel(profile?.availability ?? null) : 'Not set',
      missing: !filled.availability,
    },
    {
      label: 'Email',
      value: user?.email ?? 'Not set',
      note: <EmailStatusNote verified={Boolean(user?.emailVerified)} />,
    },
    {
      // A different gate from email, so it does not borrow the word confirmed.
      // TODO(visibility): once talent profiles can be shared, read this from the
      // talent's own consent setting instead of a fixed sentence.
      label: 'Visible to employers',
      value: 'Not yet. Talent search is not open.',
      missing: true,
    },
  ];

  /** The two profile answers a talent can edit from here, wherever the card stands. */
  const profileControls = (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        onClick={() => setStep('availability')}
        className={chipButtonClass}
      >
        {filled.availability ? 'Change your availability' : 'Add your availability'}
      </button>
      <button type="button" onClick={() => setStep('country')} className={chipButtonClass}>
        {filled.country ? 'Change your country' : 'Add your country'}
      </button>
    </div>
  );

  return (
    <>
      <SEO
        title="Your talent dashboard"
        description="Your People Growth Africa talent profile."
        url="/talent/dashboard"
      />
      <RequireAuth role="talent">
        <DashboardPanel
          eyebrow="Talent account"
          title={`Hello ${profile?.name ?? user?.name ?? 'there'}`}
          intro="This is your profile and where you are in the journey from signing up to starting a role."
          emailNotice={false}
          aside={
            <DashboardSection
              title="Your details"
              description="These are the details on your profile. Country is optional."
              status={
                <span className="font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green">
                  {strength.filled} of {strength.total} details
                </span>
              }
            >
              <DetailList details={details} />

              <p className="mt-5 border-t border-charcoal/10 pt-4 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
                Employers cannot see talent profiles yet. When they can, you will be told before
                anything of yours is shared.
              </p>
            </DashboardSection>
          }
        >
          <NextStepCard
            id={NEXT_STEP_ID}
            headline={
              emailStepActive
                ? 'Confirm your email'
                : cannotBeFixedHere
                  ? 'Something on your profile needs our help'
                  : activeStep === 'availability'
                    ? filled.availability
                      ? 'Update your availability'
                      : 'Tell us when you can start'
                    : activeStep === 'country'
                      ? 'Add your country'
                      : 'Your profile is ready'
            }
            description={
              emailStepActive
                ? `We sent a link to ${user?.email ?? 'your email address'}. Open it to confirm your address so we can email you about your account and your profile. The link expires in 24 hours.`
                : cannotBeFixedHere
                  ? 'Your name or field is missing, and only we can change those. Write to us and we will put it right.'
                  : activeStep === 'availability'
                    ? 'Availability is the one answer employers act on, and you can change it whenever your plans change.'
                    : activeStep === 'country'
                      ? 'Country is optional. It tells us where you are when a role is close to home.'
                      : 'Everything matching needs is on your profile. Matching is not open yet, so nothing is being reviewed today. We will email you when it is.'
            }
          >
            {emailStepActive ? (
              <>
                <ConfirmEmailButton />
                <div className="mt-5 border-t border-charcoal/10 pt-4">
                  <p className="mb-3 font-[family-name:var(--font-body)] text-sm text-charcoal/70">
                    Your profile is still yours to update in the meantime.
                  </p>
                  {profileControls}
                </div>
              </>
            ) : cannotBeFixedHere ? (
              <a
                href="mailto:hello@peoplegrowthafrica.com"
                className={`${primaryButtonClass} w-full min-[480px]:w-auto`}
              >
                Write to hello@peoplegrowthafrica.com
              </a>
            ) : activeStep === 'availability' ? (
              <form onSubmit={handleAvailability} noValidate>
                <fieldset>
                  <legend className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal">
                    When can you start?
                  </legend>

                  <div className="mt-3 grid grid-cols-1 gap-2.5 min-[460px]:grid-cols-3">
                    {AVAILABILITY_OPTIONS.map((option) => {
                      const selected = availabilityValue === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-3 font-[family-name:var(--font-body)] text-sm transition-colors motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-green has-[:focus-visible]:ring-offset-1 ${
                            selected
                              ? 'border-brand-green bg-mint/60 font-semibold text-charcoal'
                              : 'border-charcoal/20 bg-white text-charcoal/85 hover:border-brand-green/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name="availability"
                            value={option.value}
                            checked={selected}
                            onChange={() => {
                              setAvailability(option.value);
                              setStepError(null);
                            }}
                            className="h-4 w-4 shrink-0 accent-[#0F6E56] focus:outline-none"
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {stepError && (
                  <p
                    role="alert"
                    className="mt-3 font-[family-name:var(--font-body)] text-sm text-terracotta"
                  >
                    {stepError}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    aria-busy={saving}
                    className={`${primaryButtonClass} w-full min-[480px]:w-auto`}
                  >
                    {saving ? 'Please wait' : 'Save availability'}
                  </button>
                  {step !== 'auto' && (
                    <QuietAction
                      onClick={() => {
                        setStep('auto');
                        setStepError(null);
                        setFeedback(null);
                      }}
                    >
                      Cancel
                    </QuietAction>
                  )}
                </div>
              </form>
            ) : activeStep === 'country' ? (
              <form onSubmit={handleCountry} noValidate>
                <Select
                  id="talent-country"
                  name="country"
                  label="Country (Optional)"
                  placeholder="Select your country"
                  options={COUNTRIES}
                  autoComplete="country-name"
                  size="lg"
                  value={countryValue}
                  onChange={setCountry}
                  hint="Type the first letters to jump through the list, or leave this empty if you would rather not say."
                />

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    aria-busy={saving}
                    className={`${primaryButtonClass} w-full min-[480px]:w-auto`}
                  >
                    {saving ? 'Please wait' : 'Save country'}
                  </button>
                  <QuietAction
                    onClick={() => {
                      setStep('auto');
                      setFeedback(null);
                    }}
                  >
                    Cancel
                  </QuietAction>
                </div>
              </form>
            ) : (
              profileControls
            )}

            {feedback && <StateMessage tone={feedback.tone}>{feedback.text}</StateMessage>}
          </NextStepCard>

          <DashboardSection
            title="Your journey"
            description="Five stages, from your profile to your first day in a role."
          >
            <JourneyStrip journey={journey} />
          </DashboardSection>

          <DashboardSection
            title="Matched roles"
            description="Roles we think fit your field, country and availability."
            status={<PendingChip>Opens soon</PendingChip>}
          >
            {MATCHED_ROLES.status === 'planned' ? (
              <EmptyState
                mark
                headline="No matches yet"
                explanation="Matching is not open yet. When it is, roles that fit your profile will be listed here, and we will email you about each one."
                action={<QuietAction onClick={goToNextStep}>Keep your details up to date</QuietAction>}
              />
            ) : null}
          </DashboardSection>
        </DashboardPanel>
      </RequireAuth>
    </>
  );
}
