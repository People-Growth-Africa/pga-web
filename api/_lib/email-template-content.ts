export const EMAIL_TEMPLATE_IDS = [
  'verification',
  'password_reset',
  'password_changed',
  'staff_invite_admin',
  'staff_invite_content',
  'newsletter_confirmation',
  'event_registration',
  'lead_notification',
  'existing_account',
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];
export const EMAIL_BUTTON_STYLES = ['solid-green', 'solid-deep-green', 'outline-green', 'soft-mint'] as const;
export type EmailButtonStyle = (typeof EMAIL_BUTTON_STYLES)[number];
export type EmailTemplateLink = { label: string; url: string };

export type EmailTemplateContent = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  notes: string[];
  actionLabel: string;
  /** Only templates that are not in SECURITY_TEMPLATE_IDS may store this. */
  actionUrl?: string;
  links: EmailTemplateLink[];
  buttonStyle: EmailButtonStyle;
};

export type EmailTemplateDefinition = {
  id: EmailTemplateId;
  label: string;
  securitySensitive: boolean;
  content: EmailTemplateContent;
};

export const SECURITY_TEMPLATE_IDS = new Set<EmailTemplateId>([
  'verification',
  'password_reset',
  'staff_invite_admin',
  'staff_invite_content',
  'newsletter_confirmation',
]);

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateId, string> = {
  verification: 'Confirm your email',
  password_reset: 'Reset password',
  password_changed: 'Password changed',
  staff_invite_admin: 'Staff invitation',
  staff_invite_content: 'Content desk invitation',
  newsletter_confirmation: 'Newsletter confirmation',
  event_registration: 'Event registration',
  lead_notification: 'Lead notification',
  existing_account: 'Existing account notice',
};

const buttonDefaults = {
  actionLabel: '',
  links: [] as EmailTemplateLink[],
  buttonStyle: 'solid-green' as const,
};

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplateContent> = {
  verification: {
    ...buttonDefaults,
    subject: 'Confirm your People Growth Africa email address',
    preheader: 'One tap confirms this address and your account is ready.',
    heading: 'Confirm your email address',
    paragraphs: ['Welcome to People Growth Africa. Confirm this address to finish setting up your account.'],
    notes: ['This link works once and expires in 24 hours.', 'If you did not create an account, you can ignore this message.'],
    actionLabel: 'Confirm email address',
  },
  password_reset: {
    ...buttonDefaults,
    subject: 'Reset your People Growth Africa password',
    preheader: 'The link works once and expires in an hour.',
    heading: 'Reset your password',
    paragraphs: ['Someone asked to reset the password for this email address. Choose a new one to get back in:'],
    notes: ['This link works once and expires in 1 hour.', 'If this was not you, you can ignore this message. Your password is unchanged.'],
    actionLabel: 'Choose a new password',
  },
  password_changed: {
    ...buttonDefaults,
    subject: 'Your People Growth Africa password was changed',
    preheader: 'Every signed in device has been logged out.',
    heading: 'Your password was changed',
    paragraphs: ['The password on this account has just been changed, and every signed in device has been logged out.', 'If this was you, nothing further is needed.'],
    notes: ['If it was not you, reset the password again immediately and reply to this message so we can help.'],
    actionLabel: '',
  },
  staff_invite_admin: {
    ...buttonDefaults,
    subject: 'You have been invited to the People Growth Africa admin',
    preheader: 'Choose a password for your staff account.',
    heading: 'Your staff account is ready',
    paragraphs: ['Hi {{name}}, a staff account has been created for you. Choose a password to activate it.'],
    notes: ['This link works once and expires in 24 hours.', 'If you were not expecting this, you can ignore this message.'],
    actionLabel: 'Choose a password',
  },
  staff_invite_content: {
    ...buttonDefaults,
    subject: 'You have been invited to the People Growth Africa content desk',
    preheader: 'Choose a password for your staff account.',
    heading: 'Your content desk account is ready',
    paragraphs: ['Hi {{name}}, a content manager account has been created for you. Choose a password to activate it.'],
    notes: ['This link works once and expires in 24 hours.', 'If you were not expecting this, you can ignore this message.'],
    actionLabel: 'Choose a password',
  },
  newsletter_confirmation: {
    ...buttonDefaults,
    subject: 'Confirm your subscription to People Growth Africa insights',
    preheader: 'One tap and our insights will start arriving.',
    heading: 'Confirm your subscription',
    paragraphs: ['Thanks for asking for People Growth Africa insights. One tap below and you are on the list.'],
    notes: ['This link works once and expires in 48 hours.', 'If you did not ask for this, ignore this message and nothing more will be sent.'],
    actionLabel: 'Confirm subscription',
  },
  event_registration: {
    ...buttonDefaults,
    subject: 'Registration confirmed: {{eventName}}',
    preheader: 'Your place is saved for {{eventName}}.',
    heading: 'Your place is saved',
    paragraphs: ['Hi {{name}}, your registration for {{eventName}} is confirmed.', 'Our team will email your joining link before the session. If you have a question in the meantime, reply to this message.'],
    notes: ['If you did not register for this event, you can ignore this message.'],
    actionLabel: 'See all events',
    actionUrl: 'https://www.peoplegrowthafrica.com/events',
  },
  lead_notification: {
    ...buttonDefaults,
    subject: '{{kind}}: {{email}}',
    preheader: '{{kind}} from {{email}}',
    heading: '{{kind}}',
    paragraphs: ['Sent automatically to the team inbox. Answering this message goes straight back to the person who filled in the form.'],
    notes: [],
    actionLabel: 'Reply to {{email}}',
    actionUrl: 'mailto:{{email}}',
  },
  existing_account: {
    ...buttonDefaults,
    subject: 'Someone tried to create a People Growth Africa account',
    preheader: 'No account was created; this address already has one.',
    heading: 'This address already has an account',
    paragraphs: ['Someone used this email address to try to create a People Growth Africa account. Nothing changed.', 'If it was you, log in or reset your password below.'],
    notes: ['If it was not you, you can ignore this message.'],
    actionLabel: 'Go to sign in',
    actionUrl: 'https://www.peoplegrowthafrica.com/auth#login',
  },
};

export function isEmailTemplateId(value: string): value is EmailTemplateId {
  return (EMAIL_TEMPLATE_IDS as readonly string[]).includes(value);
}
