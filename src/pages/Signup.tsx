import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import SignupChoice from '../components/SignupChoice';
import { ContourPanel } from '../components/ContourPattern';

/**
 * What `/auth` answers with while accounts are off.
 *
 * The built-in signup and login forms still exist and are still deployed, but
 * signups are handled with two Google Forms for now, so this page replaces the
 * form rather than linking away blind: it offers the same Talent / Employer
 * choice the nav bar shows, and nothing here depends on a session, a database
 * or email. It keeps the account page's frame (dark band, brand panel, one
 * white card) so it reads as that page in a different state.
 */
export default function Signup() {
  return (
    <>
      <SEO
        title="Sign up | People Growth Africa"
        description="Join the People Growth Africa talent network or find people and programmes for your team."
        url="/auth"
      />

      <section className="relative min-h-screen bg-cream">
        <div className="absolute inset-x-0 top-0 h-[100px] bg-deep-green" aria-hidden="true" />

        <div className="relative mx-auto max-w-[1000px] px-5 pb-[80px] pt-[130px] md:px-6">
          <div className="grid gap-6 min-[820px]:grid-cols-[minmax(0,1fr)_460px] min-[820px]:gap-8">
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

                <p
                  className="mb-3 font-[family-name:var(--font-heading)] font-semibold leading-[1.2] text-white"
                  style={{ fontSize: 'clamp(1.7rem, 3.4vw, 2.4rem)' }}
                >
                  People first. Growth always.
                </p>
                <p className="max-w-[38ch] font-[family-name:var(--font-body)] text-sm leading-relaxed text-white md:text-base">
                  People Growth Africa helps growing businesses across the continent build the
                  people systems, cultures and practices that make growth sustainable.
                </p>
              </ContourPanel>
            </aside>

            <div className="mx-auto w-full max-w-[460px] rounded-[20px] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] min-[820px]:mx-0 min-[820px]:px-8 min-[820px]:py-8">
              <p className="font-[family-name:var(--font-body)] text-xs font-semibold tracking-[0.08em] text-deep-green">
                Get started
              </p>

              <h1
                className="mt-2 font-[family-name:var(--font-heading)] font-semibold leading-[1.2] text-charcoal"
                style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}
              >
                Which one are you?
              </h1>

              <p className="mt-3 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70 md:text-base">
                Tell us who you are and we will take you to the right sign up form. It opens in a
                new tab.
              </p>

              <div className="mt-6">
                <SignupChoice variant="panel" />
              </div>

              <p className="mt-6 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
                Prefer to talk it through? Write to{' '}
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
