import { useState, type FormEvent } from 'react';

import FormsUnavailableNotice, { FormAvailabilityPending } from './FormsUnavailableNotice';
import { useFormsAvailability } from '../hooks/useFormsAvailability';
import { authRequest } from '../lib/authClient';

/**
 * The blog's email newsletter, in the two places it appears.
 *
 * `section` is the block at the bottom of /blog: its own cream band with the
 * headline and the promise. `article` is the same form at the end of a post, in
 * a card that suits the reading column - a reader who has just finished an
 * article is the person most likely to want the next one.
 *
 * Both variants share this one submit handler, availability probe and status
 * line, so a fix to the wording or the confirmation flow cannot reach one page
 * and miss the other. The server is the source of truth for the answer: nothing
 * is reported as sent until `/api/newsletter/subscribe` says so.
 */

type State = 'idle' | 'sending' | 'sent' | 'error';

const inputClass =
  'flex-1 px-6 py-4 border-[1.5px] border-charcoal/12 rounded-full font-[family-name:var(--font-body)] text-base bg-white text-charcoal outline-none focus:border-brand-green transition-colors placeholder:text-charcoal/40';

const noteClass =
  'font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/40 mt-4';

export default function NewsletterSignup({
  variant = 'section',
}: {
  variant?: 'section' | 'article';
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [notice, setNotice] = useState('');
  const formsAvailability = useFormsAvailability();
  const isArticle = variant === 'article';

  const handleSubscribe = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || state === 'sending') return;

    setState('sending');
    setNotice('');

    const result = await authRequest<{ ok: boolean; message?: string; already?: boolean }>(
      '/api/newsletter/subscribe',
      { body: { email: address } },
    );

    if (result.ok) {
      setState('sent');
      setNotice(result.data.message ?? 'Check your inbox to confirm your subscription.');
      // An address that is already subscribed stays in the box: clearing it
      // would suggest another email was sent to it.
      if (result.data.already !== true) setEmail('');
      return;
    }

    setState('error');
    setNotice(result.failure.fields?.email ?? result.failure.error);
  };

  const form = (
    <form
      onSubmit={handleSubscribe}
      className={
        isArticle
          ? 'flex flex-col gap-3 sm:flex-row'
          : 'flex flex-col sm:flex-row gap-3 max-w-[480px] mx-auto'
      }
    >
      <input
        type="email"
        placeholder="Enter your email address"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          // A new address is a new attempt, so the last answer goes away.
          if (state !== 'idle') {
            setState('idle');
            setNotice('');
          }
        }}
        required
        className={inputClass}
        aria-label="Email address for newsletter"
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        className={`px-8 py-4 border-none rounded-full font-[family-name:var(--font-body)] text-[0.95rem] font-semibold cursor-pointer transition-all duration-300 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70 ${
          state === 'sent'
            ? 'bg-brand-green text-white'
            : 'bg-deep-green text-white hover:bg-terracotta hover:-translate-y-0.5'
        }`}
      >
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Thanks ✓' : 'Subscribe'}
      </button>
    </form>
  );

  const fields =
    formsAvailability !== 'available' ? (
      formsAvailability === 'unavailable' ? (
        <FormsUnavailableNotice className={isArticle ? '' : 'max-w-[480px] mx-auto text-left'} />
      ) : (
        <FormAvailabilityPending className={isArticle ? '' : 'text-center'} />
      )
    ) : (
      form
    );

  // Mounted from the start so a screen reader announces the server's answer when
  // it lands.
  const status = (
    <p
      role="status"
      aria-live="polite"
      className={`font-[family-name:var(--font-body)] text-[0.85rem] mt-2 min-h-[1.25rem] ${
        state === 'error' ? 'text-terracotta' : 'text-deep-green'
      }`}
    >
      {notice}
    </p>
  );

  if (isArticle) {
    return (
      <section
        aria-labelledby="newsletter-heading"
        className="mt-12 rounded-[20px] border border-charcoal/10 bg-mint/30 px-6 py-7 sm:px-8"
      >
        <p className="font-[family-name:var(--font-body)] text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-2.5">
          Newsletter
        </p>
        <h2
          id="newsletter-heading"
          className="font-[family-name:var(--font-heading)] text-[1.55rem] font-semibold leading-tight text-charcoal mb-2"
        >
          Get the next article by email
        </h2>
        <p className="font-[family-name:var(--font-body)] text-[0.95rem] leading-relaxed text-charcoal/60 mb-5">
          Practical people management tips, regulatory updates and growth strategies. It comes
          quarterly, and you can leave any time.
        </p>
        {fields}
        <p className={noteClass}>No spam. The newsletter and nothing else.</p>
        {status}
      </section>
    );
  }

  return (
    <section className="py-[100px] bg-cream relative overflow-hidden">
      <div className="absolute top-[-60px] right-[-60px] w-[300px] h-[300px] rounded-full bg-terracotta/8" />
      <div className="absolute bottom-[-40px] left-[-40px] w-[200px] h-[200px] rounded-full bg-brand-green/6" />
      <div className="relative z-[1] max-w-[1200px] mx-auto px-6">
        <div className="max-w-[680px] mx-auto text-center">
          <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">
            Stay in the Loop
          </p>
          <h2
            className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
            style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}
          >
            Get HR Insights
            <br />
            Delivered to Your Inbox
          </h2>
          <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/60 leading-relaxed mb-9 max-w-[500px] mx-auto">
            Join 2,000+ business leaders across Africa receiving practical people management tips,
            regulatory updates, and growth strategies. It comes in quarterly.
          </p>
          {fields}
          <p className={noteClass}>No spam. The newsletter and nothing else. It comes in quarterly.</p>
          {status}
        </div>
      </div>
    </section>
  );
}
