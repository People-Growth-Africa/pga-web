import { Link } from 'react-router-dom';
import SEO from './SEO';
import { ContourPanel } from './ContourPattern';
import { useConsultation } from '../hooks/useConsultation';

/**
 * What `/auth` shows on the public site while accounts are not announced yet.
 *
 * It is the same frame as the account page (dark band, brand panel, one white
 * card) so it reads as a deliberate state of that page rather than a stray
 * screen, and it is honest about what is happening: accounts are not open yet,
 * nothing happens with the address, and there is a way to reach a person in the
 * meantime. One heading, one primary action, one way back (2, 7.1, 9.5).
 *
 * Which hosts show this page rather than the forms is decided in
 * `src/lib/accountGate.ts`, and the "write to us" address is the same one the
 * rest of the site publishes.
 */
export default function AuthComingSoon() {
  const { openConsultation } = useConsultation();

  return (
    <>
      <SEO
        title="Accounts are coming soon | People Growth Africa"
        description="Talent and employer accounts with People Growth Africa are coming soon. Talk to our advisory team in the meantime."
        url="/auth"
      />

      <section className="relative min-h-screen bg-cream">
        {/* Dark band behind the fixed navbar, matching every other page. */}
        <div className="absolute inset-x-0 top-0 h-[100px] bg-deep-green" aria-hidden="true" />

        <div className="relative mx-auto max-w-[1000px] px-5 pb-[80px] pt-[130px] md:px-6">
          <div className="grid gap-6 min-[820px]:grid-cols-[minmax(0,1fr)_460px] min-[820px]:gap-8">
            {/* Brand panel, the same one the account page carries. */}
            <aside className="min-[820px]:h-full">
              <ContourPanel
                variant="portrait"
                art="ribbons"
                className="flex h-full flex-col justify-start px-6 py-7 min-[820px]:px-10 min-[820px]:py-12"
              >
                <div className="mb-5 inline-flex items-center gap-2.5">
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

                <p className="mb-3 font-[family-name:var(--font-heading)] font-semibold leading-[1.2] text-white"
                  style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.4rem)' }}
                >
                  People first. Growth always.
                </p>
                <p className="max-w-[38ch] font-[family-name:var(--font-body)] text-sm leading-relaxed text-white md:text-base">
                  People Growth Africa helps growing businesses across the continent build the people
                  systems, cultures and practices that make growth sustainable.
                </p>
              </ContourPanel>
            </aside>

            {/* One card, one message, one action. */}
            <div className="mx-auto w-full max-w-[460px] rounded-[20px] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] min-[820px]:mx-0 min-[820px]:px-8 min-[820px]:py-8">
              <p className="font-[family-name:var(--font-body)] text-xs font-semibold tracking-[0.08em] text-deep-green">
                Accounts
              </p>

              <h1
                className="mt-2 font-[family-name:var(--font-heading)] font-semibold leading-[1.2] text-charcoal"
                style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}
              >
                Accounts are coming soon
              </h1>

              <p className="mt-3 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70 md:text-base">
                Talent and employer accounts are being finished, and they are not open to the public
                yet. Nothing else on this site changes: our programmes, events and advisory work carry
                on as normal.
              </p>

              <button
                type="button"
                onClick={() => openConsultation()}
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brand-green px-6 py-3.5 font-[family-name:var(--font-body)] text-base font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
              >
                Talk to our team
              </button>

              <p className="mt-4 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
                Want to be told the day they open? Write to{' '}
                <a
                  href="mailto:hello@peoplegrowthafrica.com"
                  className="inline-flex min-h-[44px] -my-3 items-center rounded-sm font-semibold text-deep-green underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                >
                  hello@peoplegrowthafrica.com
                </a>
                .
              </p>

              <p className="mt-1 font-[family-name:var(--font-body)] text-sm">
                <Link
                  to="/"
                  className="inline-flex min-h-[44px] items-center rounded-sm font-semibold text-deep-green underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                >
                  Back to the home page
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
