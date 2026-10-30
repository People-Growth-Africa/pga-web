import { Resend } from 'resend';

import { renderEmail, renderEmailText, renderLeadEmail } from './email-template.js';
import { resolveEmailTemplate } from './email-templates.js';
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
  const template = await resolveEmailTemplate('verification', {}, link);
  return sendEmail({
    to,
    subject: template.subject,
    text: renderEmailText({ ...template, action: { label: template.actionLabel, url: link } }),
    html: renderEmail({
      ...template,
      action: { label: template.actionLabel, url: link, style: template.buttonStyle },
      reason: 'You are getting this because this address was used to create a People Growth Africa account.',
      site: appUrl(),
    }),
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/forgot-password?token=${encodeURIComponent(token)}`;
  const template = await resolveEmailTemplate('password_reset', {}, link);
  return sendEmail({
    to,
    subject: template.subject,
    text: renderEmailText({ ...template, action: { label: template.actionLabel, url: link } }),
    html: renderEmail({
      ...template,
      action: { label: template.actionLabel, url: link, style: template.buttonStyle },
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
  const template = await resolveEmailTemplate(content ? 'staff_invite_content' : 'staff_invite_admin', { name }, link);
  return sendEmail({
    to,
    tag: 'staff',
    subject: template.subject,
    text: renderEmailText({ ...template, action: { label: template.actionLabel, url: link } }),
    html: renderEmail({
      ...template,
      action: { label: template.actionLabel, url: link, style: template.buttonStyle },
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
  const template = await resolveEmailTemplate('lead_notification', { kind: input.kind, email: input.replyTo });
  await sendEmail({
    to: LEAD_INBOX,
    tag: 'leads',
    replyTo: input.replyTo,
    subject: template.subject,
    text: [...input.lines, '', ...template.paragraphs, '', `${template.actionLabel}:`, template.actionUrl ?? `mailto:${input.replyTo}`, ...template.links.flatMap((link) => ['', `${link.label}:`, link.url]), ...template.notes.flatMap((note) => ['', note])].join('\n'),
    html: renderLeadEmail({
      kind: input.kind,
      lines: input.lines,
      replyTo: input.replyTo,
      site: appUrl(),
      template,
    }),
  });
}

/**
 * Double opt in: a newsletter signup only counts once the link in this message
 * is opened. Nothing else is ever sent to a pending address.
 */
export async function sendNewsletterConfirmationEmail(to: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const template = await resolveEmailTemplate('newsletter_confirmation', {}, link);
  return sendEmail({
    to,
    tag: 'newsletter',
    subject: template.subject,
    text: renderEmailText({ ...template, action: { label: template.actionLabel, url: link } }),
    html: renderEmail({
      ...template,
      action: { label: template.actionLabel, url: link, style: template.buttonStyle },
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
  const template = await resolveEmailTemplate('password_changed');
  return sendEmail({
    to,
    subject: template.subject,
    text: renderEmailText(template),
    html: renderEmail({
      ...template,
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
  const template = await resolveEmailTemplate('event_registration', { name, eventName });
  const action = template.actionUrl
    ? { label: template.actionLabel, url: template.actionUrl, style: template.buttonStyle }
    : undefined;

  return sendEmail({
    to,
    tag: 'registrations',
    subject: template.subject,
    text: renderEmailText({ ...template, action: action ? { label: action.label, url: action.url } : undefined }),
    html: renderEmail({
      ...template,
      action,
      links: [...template.links, ...(action ? [] : [{ label: template.actionLabel, url: eventsLink }])],
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
  const template = await resolveEmailTemplate('existing_account');
  return sendEmail({
    to,
    tag: 'signup-existing',
    subject: template.subject,
    text: renderEmailText(template),
    html: renderEmail({
      ...template,
      action: template.actionUrl
        ? { label: template.actionLabel, url: template.actionUrl, style: template.buttonStyle }
        : undefined,
      reason: 'You are getting this because a signup was attempted for this address.',
      site: appUrl(),
    }),
  });
}
