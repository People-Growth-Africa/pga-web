import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authRequest } from '../../lib/authClient';
import { StateMessage } from './DashboardSection';
import { primaryButtonClass } from './DashboardButtons';

/**
 * The one place an unconfirmed email address is acted on.
 *
 * The same request used to be written twice, in the page notice and (from this
 * round) inside the talent's next step card, and two copies of one action could
 * drift apart. The button, its in flight state and its answer live here, and the
 * notice above imports the same button, so the words and the result are the same
 * wherever the action appears (1, 14.8).
 */

const QUIET_BUTTON_CLASS =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-charcoal/40 px-5 py-2.5 font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal transition-colors motion-reduce:transition-none hover:border-charcoal hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70';

export function ConfirmEmailButton({
  variant = 'primary',
  className = '',
}: {
  /**
   * `primary` is the card's own step, so it takes the one accent. `quiet` is the
   * same action inside a notice that is not the screen's main task (7.1).
   */
  variant?: 'primary' | 'quiet';
  className?: string;
}) {
  const { refresh } = useAuth();
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (resending) return;
    setResending(true);
    setMessage(null);
    setError(null);

    const result = await authRequest<{ ok: boolean; message?: string }>(
      '/api/auth/resend-verification',
      { body: {} },
    );

    // The session may have moved on since this page loaded: the address can have
    // been verified from the emailed link in another tab. Reading it back lets
    // the "already confirmed" answer retire this action instead of leaving it
    // under a notice that is no longer true.
    await refresh();
    setResending(false);

    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setMessage(result.data.message ?? 'We sent a new confirmation link.');
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleResend}
        disabled={resending}
        aria-busy={resending}
        className={`${variant === 'primary' ? `${primaryButtonClass} w-full min-[480px]:w-auto` : QUIET_BUTTON_CLASS} `}
      >
        {resending ? 'Please wait' : 'Send a new confirmation link'}
      </button>

      {message && <StateMessage tone="success">{message}</StateMessage>}
      {error && <StateMessage tone="error">{error}</StateMessage>}
    </div>
  );
}

/**
 * The page level notice, for an account whose screen does not carry the action
 * in its own next step card. The talent dashboard does carry it (their next step
 * is confirming), so it passes `emailNotice={false}` and the message appears
 * once; the employer dashboard books consultations rather than confirming an
 * address, so it keeps the notice here (1: say a thing once, where it is acted
 * on).
 */
export default function EmailConfirmNotice() {
  const { user } = useAuth();
  if (!user || user.emailVerified) return null;

  return (
    <div className="mt-5 rounded-[20px] border border-terracotta/40 bg-terracotta/10 px-5 py-4">
      <p className="font-[family-name:var(--font-body)] text-sm text-charcoal">
        Confirm your email address. We sent a link to{' '}
        <span className="font-semibold">{user.email}</span>. The link expires in 24 hours.
      </p>

      <ConfirmEmailButton variant="quiet" className="mt-4" />
    </div>
  );
}
