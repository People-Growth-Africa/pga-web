import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ContourPanel } from './ContourPattern';
import EmailConfirmNotice from './dashboard/EmailConfirmation';
import { inlineLinkClass } from './dashboard/DashboardButtons';
import { useAuth } from '../hooks/useAuth';
import { authRequest } from '../lib/authClient';

type DashboardPanelProps = {
  /** The small line above the greeting, for example "Talent account". */
  eyebrow: string;
  title: string;
  intro: string;
  /** The secondary column: details and anything else that is read, not acted on. */
  aside: ReactNode;
  /** The primary column, in the order the visitor should read it. */
  children: ReactNode;
  /**
   * Whether this page shows the unconfirmed email notice above the cards. True by
   * default, because most screens only have room for the message there. The talent
   * dashboard turns it off: confirming the address *is* their next step, so the
   * card at the top of the page carries the same action with the primary button,
   * and the page says it once (1, 7.1, 14.1).
   */
  emailNotice?: boolean;
};

const inputClass =
  'w-full rounded-xl border border-charcoal/20 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-base text-charcoal placeholder:text-charcoal/40 transition-colors motion-reduce:transition-none focus:border-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-1';

/**
 * The frame every signed in page shares.
 *
 * It owns the things that must look and behave the same on both dashboards: the
 * greeting panel, the unconfirmed email notice, the account and security
 * controls, and the account deletion row. The two dashboards fill the two
 * columns, so a change to the shell can never make one dashboard behave
 * differently from the other.
 *
 * Layout note (3, 10): one column on a phone, two from 900px, and the primary
 * column comes first in the reading order because that is where the action is.
 * Nothing here shrinks to fit: the columns become one instead.
 */
export default function DashboardPanel({
  eyebrow,
  title,
  intro,
  aside,
  children,
  emailNotice = true,
}: DashboardPanelProps) {
  const { signOut, refresh } = useAuth();
  const navigate = useNavigate();

  const [signingOut, setSigningOut] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Opening the row moves the keyboard into what it revealed, so a keyboard user
  // is not left behind on a heading while the form appears below it (11).
  useEffect(() => {
    if (deleteOpen) passwordRef.current?.focus();
  }, [deleteOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/', { replace: true });
  }

  async function handleSignOutEverywhere() {
    if (signingOutEverywhere) return;
    setSigningOutEverywhere(true);
    setSignOutError(null);

    const result = await authRequest<{ ok: boolean }>('/api/auth/logout-all', { body: {} });
    if (!result.ok) {
      setSigningOutEverywhere(false);
      setSignOutError(result.failure.error);
      return;
    }

    // Every token including this one is now stale; read the session back so the
    // shell shows signed out before the log in page appears.
    await refresh();
    navigate('/auth#login', { replace: true });
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    const result = await authRequest<{ ok: boolean }>('/api/auth/account', {
      method: 'DELETE',
      body: { password },
    });

    if (!result.ok) {
      setDeleting(false);
      setDeleteError(result.failure.error);
      return;
    }

    // The server already cleared the session cookie.
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <section className="relative min-h-screen bg-cream pb-[80px] pt-[130px]">
      {/* The dark band behind the fixed header, matching every other page, so the
          white lockup and links never sit on cream. */}
      <div className="absolute inset-x-0 top-0 h-[108px] bg-deep-green" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1000px] px-5 md:px-6">
        {/* The heading sits on the brand panel so the dashboard carries the same
            texture as the page it was reached from. */}
        <ContourPanel className="px-5 py-6 md:px-8 md:py-7">
          <p className="font-[family-name:var(--font-body)] text-xs font-semibold tracking-[0.08em] text-mint">
            {eyebrow}
          </p>
          {/* break-words, because a name is user content: one 100 character token
              with no space in it must wrap instead of pushing the page sideways
              (13.7: a very long value is an edge case for every text block). */}
          <h1
            className="mt-2 break-words font-[family-name:var(--font-heading)] font-semibold leading-[1.2] text-white"
            style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)' }}
          >
            {title}
          </h1>
          {/* Solid white, not a tint: the contour artwork under this panel
              raises the local background brightness, and white at 85% dips
              below AA over the lighter parts of the wash. */}
          <p className="mt-2 max-w-[52ch] break-words font-[family-name:var(--font-body)] text-sm leading-relaxed text-white md:text-base">
            {intro}
          </p>
        </ContourPanel>

        {emailNotice && <EmailConfirmNotice />}

        {/* grid-cols-1 on the base, not a bare grid: an implicit column is sized
            `auto`, which is driven by the widest unbreakable word inside it. One
            long name in a detail row then pushed the whole column past the
            viewport and body's overflow-x: hidden clipped the right edge of
            every card. minmax(0,1fr) is a definite track that cannot do that,
            and min-w-0 lets the items shrink inside it. */}
        <div className="mt-5 grid grid-cols-1 gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start">
          <div className="flex min-w-0 flex-col gap-5">{children}</div>

          <div className="flex min-w-0 flex-col gap-5">
            {aside}

            <div className="rounded-[20px] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:px-8 md:py-8">
              <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">
                Signing in and out
              </h2>

              {signOutError && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal"
                >
                  {signOutError}
                </p>
              )}

              {/* Two actions with different reach, so they are not given the
                  same treatment: the plain one ends this session, and the one
                  below the divider ends every session. The stronger action sits
                  after the line with its own explanation, without borrowing the
                  colour reserved for the destructive one (1, 5.3, 14.8). */}
              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-deep-green px-6 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green transition-colors motion-reduce:transition-none hover:bg-deep-green hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-70"
                  >
                    {signingOut ? 'Please wait' : 'Log out'}
                  </button>
                  <p className="mt-1.5 font-[family-name:var(--font-body)] text-xs text-charcoal/65">
                    Ends this device.
                  </p>
                </div>

                <div className="border-t border-charcoal/10 pt-4">
                  <button
                    type="button"
                    onClick={handleSignOutEverywhere}
                    disabled={signingOutEverywhere}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-charcoal px-6 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal transition-colors motion-reduce:transition-none hover:bg-charcoal hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-70"
                  >
                    {signingOutEverywhere ? 'Please wait' : 'Log out on all devices'}
                  </button>
                  <p className="mt-1.5 font-[family-name:var(--font-body)] text-xs text-charcoal/65">
                    Ends every device, including phones and shared computers.
                  </p>
                </div>
              </div>

              <p className="mt-5 font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
                To change your password,{' '}
                <Link to="/forgot-password" className={inlineLinkClass}>
                  reset it by email
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Deleting an account is the last thing on the page on purpose: it is
            never part of a visit's task, so it does not sit among the cards
            someone came here to use. The row is a disclosure, the warning is
            inside it, and the destructive button only exists once someone has
            opened it and read what it does (2, 5.3, 9.6, 12). */}
        <section className="mt-5 rounded-[20px] border border-charcoal/15 bg-white px-5 py-2 md:px-8 md:py-3">
          <h2>
            <button
              type="button"
              aria-expanded={deleteOpen}
              aria-controls="delete-account-panel"
              onClick={() => setDeleteOpen((open) => !open)}
              className="flex min-h-[44px] w-full items-center justify-between gap-4 rounded-sm py-1 text-left font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
            >
              Delete your account
              <svg
                className={`h-5 w-5 shrink-0 text-charcoal/65 transition-transform motion-reduce:transition-none ${
                  deleteOpen ? 'rotate-180' : ''
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </h2>

          {deleteOpen && (
            <div id="delete-account-panel" className="mt-1 border-t border-charcoal/10 pb-4 pt-4">
              <p className="max-w-[56ch] font-[family-name:var(--font-body)] text-sm leading-relaxed text-charcoal/70">
                This removes your account, your profile and every sign in record. It cannot be
                undone, and we cannot bring it back for you.
              </p>

              <form onSubmit={handleDelete} noValidate className="mt-4 flex flex-col gap-3">
                <div>
                  <label
                    className="mb-1.5 block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal"
                    htmlFor="delete-password"
                  >
                    Confirm with your password
                  </label>
                  <input
                    id="delete-password"
                    ref={passwordRef}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={deleteError ? true : undefined}
                    aria-describedby={deleteError ? 'delete-password-error' : undefined}
                    className={inputClass}
                  />
                  {/* The refusal sits with the field that caused it, and the
                      field points at it, so the message cannot appear somewhere
                      a screen reader or a thumb never reaches (6, 9.4). */}
                  {deleteError && (
                    <p
                      id="delete-password-error"
                      role="alert"
                      className="mt-2 rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 font-[family-name:var(--font-body)] text-sm text-charcoal"
                    >
                      {deleteError}
                    </p>
                  )}
                </div>
                {/* The warning fill, so the colour itself signals that this
                    cannot be undone and slows the hand down before the click
                    (5.3). It is the deeper terracotta rather than the plain one
                    because white on that only reaches 3.5:1, and the label on a
                    destructive button has to be readable. */}
                <button
                  type="submit"
                  disabled={deleting}
                  className="inline-flex min-h-[44px] items-center justify-center self-start rounded-full bg-terracotta-deep px-6 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 disabled:opacity-70"
                >
                  {deleting ? 'Please wait' : 'Delete my account'}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
