import { useEffect, useState } from 'react';
import SEO from '../components/SEO';
import RequireAuth from '../components/RequireAuth';
import DashboardPanel from '../components/DashboardPanel';
import DashboardSection, { PendingChip, StateMessage } from '../components/dashboard/DashboardSection';
import DetailList, { type DashboardDetail } from '../components/dashboard/DetailList';
import EmailStatusNote from '../components/dashboard/EmailStatusNote';
import EmptyState from '../components/dashboard/EmptyState';
import NextStepCard from '../components/dashboard/NextStepCard';
import { primaryButtonClass, secondaryButtonClass, QuietAction } from '../components/dashboard/DashboardButtons';
import { useAuth } from '../hooks/useAuth';
import { useConsultation } from '../hooks/useConsultation';
import { authRequest, needLabel } from '../lib/authClient';
import {
  formatCalendarDay,
  formatMeetingFormat,
  SHORTLIST_ENTRIES,
  employerProfileOf,
  type ConsultationRequest,
} from '../lib/dashboard';

type ConsultationState =
  | { status: 'loading' }
  | { status: 'ready'; consultation: ConsultationRequest | null }
  | { status: 'error' };

export default function EmployerDashboard() {
  const { user } = useAuth();
  const { openConsultation } = useConsultation();
  const profile = employerProfileOf(user);

  const [consultationState, setConsultationState] = useState<ConsultationState>({
    status: 'loading',
  });

  // Reads the request back. The loading state is set by whoever asks for the
  // read (the mount, or the retry), and the answer lands in a promise callback,
  // so the effect synchronises with the API rather than with its own state, and
  // a reply that arrives after the page is gone is dropped.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    void authRequest<{ ok: boolean; consultation: ConsultationRequest | null }>(
      '/api/employer/consultation',
      { method: 'GET' },
    ).then((result) => {
      if (!active) return;
      setConsultationState(
        result.ok
          ? { status: 'ready', consultation: result.data.consultation ?? null }
          : { status: 'error' },
      );
    });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const details: DashboardDetail[] = [
    { label: 'Contact person', value: profile?.name?.trim() || 'Not set', missing: !profile?.name },
    {
      label: 'Company or organisation',
      value: profile?.company?.trim() || 'Not set',
      missing: !profile?.company,
    },
    {
      label: 'What you need',
      value: profile?.needs?.length
        ? profile.needs.map((need) => needLabel(need)).join(', ')
        : 'Not set',
      missing: !profile?.needs?.length,
    },
    {
      label: 'Email',
      value: user?.email ?? 'Not set',
      note: <EmailStatusNote verified={Boolean(user?.emailVerified)} />,
    },
  ];

  /**
   * What the card says when the email address is still unconfirmed (5, 3). It
   * states the consequence of the booking, not the instruction again: the
   * notice above already says what to do and carries the button that does it, so
   * this note adds the one thing that belongs to this card (1).
   */
  const emailDependency = user?.emailVerified ? undefined : (
    <p className="flex gap-2 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal">
      <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" aria-hidden="true" />
      Until your email address is confirmed, we cannot email you about your account or your
      requests. The notice above sends a new link.
    </p>
  );

  const consultation = consultationState.status === 'ready' ? consultationState.consultation : null;

  return (
    <>
      <SEO
        title="Your employer dashboard"
        description="Your People Growth Africa employer account."
        url="/employer/dashboard"
      />
      <RequireAuth role="employer">
        <DashboardPanel
          eyebrow="Employer account"
          title={`Hello ${profile?.name ?? user?.name ?? 'there'}`}
          intro={
            profile?.company
              ? `Your account for ${profile.company}. This is where you find talent, build a shortlist and follow what you have asked us for.`
              : 'This is where you find talent, build a shortlist and follow what you have asked us for.'
          }
          aside={
            <DashboardSection
              title="Company details"
              description="These are the details on your account."
            >
              <DetailList details={details} />
            </DashboardSection>
          }
        >
          <NextStepCard
            dependency={emailDependency}
            headline="Talk to our advisory team"
            description="Tell us who you are looking for and we will come back with people to meet. Nothing is booked until we confirm a time with you by email."
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => openConsultation()}
                className={`${primaryButtonClass} w-full min-[480px]:w-auto`}
              >
                Book a consultation
              </button>
              <p className="font-[family-name:var(--font-body)] text-sm text-charcoal/70">
                Takes about two minutes.
              </p>
            </div>
          </NextStepCard>

          {/* Search and the shortlist are one job for an employer, so they are one
              card with one action rather than two regions each asking for a
              decision (3 proximity, 7.2 one coherent unit, 7.1 one primary). The
              copy answers the only question that matters today: what can I do
              now. What the team still has to settle internally is not printed
              here (1, 14.7). */}
          <DashboardSection
            title="Find talent"
            description="Talent search and shortlists open soon."
            status={<PendingChip>Opens soon</PendingChip>}
          >
            {SHORTLIST_ENTRIES.status === 'planned' ? (
              <EmptyState
                mark
                headline="Nobody shortlisted yet"
                explanation="When search opens, you can look people up by field, country and availability, and save the ones you want to come back to. Until then, our advisory team can put a shortlist together for you."
                action={
                  <button
                    type="button"
                    onClick={() => openConsultation()}
                    className={primaryButtonClass}
                  >
                    Book a consultation
                  </button>
                }
              />
            ) : null}
          </DashboardSection>

          {/* What the employer asked for and the consultation that answers it are
              one request, read from one place, so the card has one heading and one
              empty state (1, 3, 9.5). */}
          <DashboardSection
            title="Your requests"
            description="What you told us you need, and the consultation you have asked for."
          >
            <div className="rounded-2xl border border-charcoal/12 bg-cream/70 px-4 py-4">
              <p className="font-[family-name:var(--font-body)] text-xs font-semibold text-charcoal/65">
                What you asked us for when you signed up
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {(profile?.needs ?? []).map((need) => (
                  <li
                    key={need}
                    className="rounded-full border border-deep-green/25 bg-mint px-3 py-1 font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green"
                  >
                    {needLabel(need)}
                  </li>
                ))}
                {!profile?.needs?.length && (
                  <li className="font-[family-name:var(--font-body)] text-sm text-charcoal/65">
                    Nothing recorded yet.
                  </li>
                )}
              </ul>
            </div>

            <div className="mt-4">
              {consultationState.status === 'loading' ? (
                <div role="status" className="flex flex-col gap-3">
                  <span className="sr-only">Loading your consultation requests</span>
                  <div className="h-4 w-40 animate-pulse rounded-full bg-charcoal/10 motion-reduce:animate-none" />
                  <div className="h-4 w-56 animate-pulse rounded-full bg-charcoal/10 motion-reduce:animate-none" />
                  <div className="h-4 w-32 animate-pulse rounded-full bg-charcoal/10 motion-reduce:animate-none" />
                </div>
              ) : consultationState.status === 'error' ? (
                <div>
                  <StateMessage tone="error">
                    We could not load your consultation requests. Check your connection and try
                    again. Nothing you have sent has been lost.
                  </StateMessage>
                  <button
                    type="button"
                    onClick={() => {
                      setConsultationState({ status: 'loading' });
                      setReloadToken((token) => token + 1);
                    }}
                    className={`${secondaryButtonClass} mt-3`}
                  >
                    Try again
                  </button>
                </div>
              ) : consultation ? (
                <div>
                  <p className="font-[family-name:var(--font-body)] text-xs font-semibold text-charcoal/65">
                    The consultation you asked for
                  </p>

                  <div className="mt-2">
                    <DetailList
                      details={[
                        {
                          label: 'Requested time',
                          value: `${formatCalendarDay(consultation.preferredDate)} at ${consultation.preferredSlot} (WAT)`,
                        },
                        {
                          label: 'How we meet',
                          value: formatMeetingFormat(consultation.meetingFormat),
                        },
                        {
                          label: 'Organisation',
                          value: consultation.organisation,
                        },
                        {
                          label: 'Requested on',
                          value: formatCalendarDay(consultation.requestedOn),
                        },
                      ]}
                    />
                  </div>

                  <p className="mt-4 max-w-[60ch] font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
                    Until you hear from us by email, this is a request rather than a booking.
                  </p>

                  <QuietAction className="mt-2" onClick={() => openConsultation()}>
                    Request another time
                  </QuietAction>
                </div>
              ) : (
                <EmptyState
                  headline="No consultation requested yet"
                  explanation="Choose a time that suits you and our advisory team will confirm it by email."
                  action={
                    /* The same action, in the card whose job is to report rather
                       than to act: the words and the destination are identical,
                       and the lighter weight keeps the accent spent twice on
                       this screen instead of three times (5.2, 2). */
                    <button
                      type="button"
                      onClick={() => openConsultation()}
                      className={secondaryButtonClass}
                    >
                      Book a consultation
                    </button>
                  }
                />
              )}
            </div>
          </DashboardSection>
        </DashboardPanel>
      </RequireAuth>
    </>
  );
}
