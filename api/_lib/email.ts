import { Resend } from 'resend';

import { renderEmail, renderLeadEmail } from './email-template.js';
import { counterKey } from './security.js';

/**
 * Transactional email. When RESEND_API_KEY is not configured the message is
 * logged instead of sent, so local work and preview deploys stay usable. The
 * links themselves are only ever printed outside production, because a reset
 * link in a log is a reset link for anyone who can read the log.
 *
 * The fallback sender must stay on the verified Resend sending domain
 * (mail.peoplegrowthafrica.com) - the bare domain is not set up to send.
 *
 * Every message carries both parts: the HTML in api/_lib/email-template.ts and
 * the plain text built here. The text is not a courtesy - it is what a
 * text-only client shows, it is what a spam filter reads, and it is the only
 * part the log prints, so the tests keep finding links where they always did.
 */

const FROM_ADDRESS =
  process.env.EMAIL_FROM ??
  process.env.AUTH_EMAIL_FROM ??
  'People Growth Africa <noreply@mail.peoplegrowthafrica.com>';

const IS_PRODUCTION = process.env.VERCEL_ENV === 'production';

/**
 * Fixed, server side origin for links in emails. Building a link from the
 * request's Host header would let an attacker make the reset link point at
 * their own domain.
 */
export function appUrl(): string {
  const configured =
    process.env.APP_URL ?? process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  return (configured ?? 'https://www.peoplegrowthafrica.com').replace(/\/+$/, '');
}

async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  /** The branded version. Falls back to the text alone when it is absent. */
  html?: string;
  /** The person to answer, when the mail is a notification about them. */
  replyTo?: string;
  /** Which flow sent this, so the logs name it. */
  tag?: string;
}): Promise<boolean> {
  const tag = message.tag ?? 'auth';
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (IS_PRODUCTION) {
      console.error(
        `[${tag}] RESEND_API_KEY is not set, so this email was not sent: "${message.subject}"`,
      );
      return false;
    }
    // Never print the recipient, body or links. A short keyed tag is enough to
    // correlate a local run without putting a reset link in a log.
    console.warn(
      `[${tag}] email not sent: RESEND_API_KEY is not configured (recipient ${counterKey(message.to).slice(0, 12)})`,
    );
    return true;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    if (error) {
      console.error(`[${tag}] email send failed (${error.name ?? 'provider_error'})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      `[${tag}] email send threw (${error instanceof Error ? error.name : 'unknown'})`,
    );
    return false;
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: 'Confirm your People Growth Africa email address',
    text: [
      'Welcome to People Growth Africa.',
      '',
      'Confirm your email address to finish setting up your account:',
      link,
      '',
      'This link works once and expires in 24 hours.',
      'If you did not create an account, you can ignore this message.',
    ].join('\n'),
    html: renderEmail({
      preheader: 'One tap confirms this address and your account is ready.',
      heading: 'Confirm your email address',
      paragraphs: [
        'Welcome to People Growth Africa. Confirm this address to finish setting up your account.',
      ],
      action: { label: 'Confirm email address', url: link },
      notes: [
        'This link works once and expires in 24 hours.',
        'If you did not create an account, you can ignore this message.',
      ],
      reason: 'You are getting this because this address was used to create a People Growth Africa account.',
      site: appUrl(),
    }),
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/forgot-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: 'Reset your People Growth Africa password',
    text: [
      'Someone asked to reset the password for this email address.',
      '',
      'Choose a new password here:',
      link,
      '',
      'This link works once and expires in 1 hour.',
      'If this was not you, you can ignore this message. Your password is unchanged.',
    ].join('\n'),
    html: renderEmail({
      preheader: 'The link works once and expires in an hour.',
      heading: 'Reset your password',
      paragraphs: [
        'Someone asked to reset the password for this email address. Choose a new one to get back in.',
      ],
      action: { label: 'Choose a new password', url: link },
      notes: [
        'This link works once and expires in 1 hour.',
        'If this was not you, you can ignore this message. Your password is unchanged.',
      ],
      reason: 'You are getting this because a password reset was requested for this address.',
      site: appUrl(),
    }),
  });
}

export async function sendStaffInviteEmail(
  to: string,
  name: string,
  token: string,
  portal: 'admin' | 'content' = 'admin',
): Promise<boolean> {
  const content = portal === 'content';
  const link = `${appUrl()}/${content ? 'content' : 'admin'}/set-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    tag: 'staff',
    subject: content
      ? 'You have been invited to the People Growth Africa content desk'
      : 'You have been invited to the People Growth Africa admin',
    text: [
      `Hi ${name},`,
      '',
      'A staff account has been created for you. Choose a password here:',
      link,
      '',
      'This link works once and expires in 24 hours.',
      'If you were not expecting this, you can ignore this message.',
    ].join('\n'),
    html: renderEmail({
      preheader: 'Choose a password for your staff account.',
      heading: content ? 'Your content desk account is ready' : 'Your staff account is ready',
      paragraphs: [
        `Hi ${name}, a ${content ? 'content manager' : 'staff'} account has been created for you. Choose a password to activate it.`,
      ],
      action: { label: 'Choose a password', url: link },
      notes: [
        'This link works once and expires in 24 hours.',
        'If you were not expecting this, you can ignore this message.',
      ],
      reason: `You are getting this because an administrator invited this address to the ${content ? 'content desk' : 'admin'}.`,
      site: appUrl(),
    }),
  });
}

/**
 * Where a lead notification goes. A dedicated mailbox, so one person leaving
 * does not silently send every enquiry into a dead account.
 */
const LEAD_INBOX = process.env.LEAD_INBOX ?? 'hello@peoplegrowthafrica.com';

/**
 * One lead, one notification, in the shape the team can act on: who it is, how
 * to reach them, what they asked for, and the row it was stored as. Reply-To is
 * the person who filled in the form, so answering needs no copy and paste.
 *
 * Best effort on purpose. The lead is already in the database by the time this
 * runs, and losing a notification is better than refusing a lead.
 */
export async function sendLeadNotification(input: {
  kind: string;
  replyTo: string;
  lines: string[];
}): Promise<void> {
  await sendEmail({
    to: LEAD_INBOX,
    tag: 'leads',
    replyTo: input.replyTo,
    subject: `${input.kind}: ${input.replyTo}`,
    text: [...input.lines, '', `Reply to this email to answer ${input.replyTo}.`].join('\n'),
    html: renderLeadEmail({
      kind: input.kind,
      lines: input.lines,
      replyTo: input.replyTo,
      site: appUrl(),
    }),
  });
}

/**
 * Double opt in: a newsletter signup only counts once the link in this message
 * is opened. Nothing else is ever sent to a pending address.
 */
export async function sendNewsletterConfirmationEmail(to: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    tag: 'newsletter',
    subject: 'Confirm your subscription to People Growth Africa insights',
    text: [
      'Thanks for asking for People Growth Africa insights.',
      '',
      'Confirm your subscription here:',
      link,
      '',
      'This link works once and expires in 48 hours.',
      'If you did not ask for this, ignore this message and nothing more will be sent.',
    ].join('\n'),
    html: renderEmail({
      preheader: 'One tap and our insights will start arriving.',
      heading: 'Confirm your subscription',
      paragraphs: [
        'Thanks for asking for People Growth Africa insights. One tap below and you are on the list.',
      ],
      action: { label: 'Confirm subscription', url: link },
      notes: [
        'This link works once and expires in 48 hours.',
        'If you did not ask for this, ignore this message and nothing more will be sent.',
      ],
      reason: 'You are getting this because this address asked to subscribe to People Growth Africa insights.',
      site: appUrl(),
    }),
  });
}

/**
 * Sent after a reset so an account holder finds out if someone else changed
 * their password. It deliberately carries no link.
 */
export async function sendPasswordChangedEmail(to: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'Your People Growth Africa password was changed',
    text: [
      'The password for this account was just changed, and every signed in device has been logged out.',
      '',
      'If this was you, nothing further is needed.',
      'If it was not you, reset the password again immediately and reply to this message so we can help.',
    ].join('\n'),
    html: renderEmail({
      preheader: 'Every signed in device has been logged out.',
      heading: 'Your password was changed',
      paragraphs: [
        'The password on this account has just been changed, and every signed in device has been logged out.',
        'If this was you, nothing further is needed.',
      ],
      notes: [
        'If it was not you, reset the password again immediately and reply to this message so we can help.',
      ],
      reason: 'You are getting this because the password on this account was just changed.',
      site: appUrl(),
    }),
  });
}

/**
 * A short receipt for an event place. Sent after the registration row is
 * committed, so the caller treats a failure here as nothing more than a missing
 * courtesy email: the place stays saved.
 *
 * The event is described from its slug because that is all the registration
 * carries; the manager sends the agenda and joining link separately, so this
 * message promises no date or link it cannot know.
 */
export async function sendRegistrationConfirmationEmail(
  to: string,
  name: string,
  eventSlug: string,
): Promise<boolean> {
  const eventName = eventSlug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const eventsLink = `${appUrl()}/events`;

  return sendEmail({
    to,
    tag: 'registrations',
    subject: `Registration confirmed: ${eventName}`,
    text: [
      `Hi ${name},`,
      '',
      `Your place is saved for ${eventName}.`,
      '',
      'Our team will email your joining link before the session. If you have a question in the meantime, reply to this message.',
      '',
      `See all events: ${eventsLink}`,
      '',
      'If you did not register, you can ignore this message.',
    ].join('\n'),
    html: renderEmail({
      preheader: `Your place is saved for ${eventName}.`,
      heading: 'Your place is saved',
      paragraphs: [
        `Hi ${name}, your registration for ${eventName} is confirmed.`,
        'Our team will email your joining link before the session. If you have a question in the meantime, reply to this message.',
      ],
      action: { label: 'See all events', url: eventsLink },
      notes: ['If you did not register for this event, you can ignore this message.'],
      reason: 'You are getting this because this address registered for a People Growth Africa event.',
      site: appUrl(),
    }),
  });
}

/**
 * Sent when someone tries to sign up with an address that already has an
 * account. The signup response is the same for every address; this notice is
 * how the real account holder learns about the attempt without handing the
 * caller an account-existence oracle.
 */
export async function sendExistingAccountEmail(to: string): Promise<boolean> {
  const loginLink = `${appUrl()}/auth#login`;
  return sendEmail({
    to,
    tag: 'signup-existing',
    subject: 'Someone tried to create a People Growth Africa account',
    text: [
      'Someone used this email address to try to create a People Growth Africa account.',
      '',
      'An account already exists for this address, so nothing changed. If it was you, log in or reset your password:',
      loginLink,
      '',
      'If it was not you, you can ignore this message.',
    ].join('\n'),
    html: renderEmail({
      preheader: 'No account was created; this address already has one.',
      heading: 'This address already has an account',
      paragraphs: [
        'Someone used this email address to try to create a People Growth Africa account. Nothing changed.',
        'If it was you, log in or reset your password below.',
      ],
      action: { label: 'Go to sign in', url: loginLink },
      notes: ['If it was not you, you can ignore this message.'],
      reason: 'You are getting this because a signup was attempted for this address.',
      site: appUrl(),
    }),
  });
}
