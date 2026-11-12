import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      try { return nextResolve(`${specifier.slice(0, -3)}.ts`, context); } catch { /* resolve normally */ }
    }
    return nextResolve(specifier, context);
  },
});
const { EMAIL_TEMPLATE_IDS, DEFAULT_EMAIL_TEMPLATES } = await import('../api/_lib/email-template-content.ts');
const { renderEmail, renderEmailText, renderLeadEmail } = await import('../api/_lib/email-template.ts');
const { emailTemplateSaveSchema } = await import('../api/_lib/validation.ts');
const { buildRegistrationEmailVariables } = await import('../api/_lib/registration-email.ts');
const { interpolateTemplate } = await import('../api/_lib/email-templates.ts');

const valid = {
  id: 'event_registration',
  content: {
    ...DEFAULT_EMAIL_TEMPLATES.event_registration,
    links: [{ label: 'Read more', url: 'https://example.com/learn?x=1&y=2' }],
  },
};

assert.equal(EMAIL_TEMPLATE_IDS.length, 9);
assert.equal(emailTemplateSaveSchema.safeParse(valid).success, true);
assert.equal(
  emailTemplateSaveSchema.safeParse({ ...valid, content: { ...valid.content, actionUrl: 'javascript:alert(1)' } }).success,
  false,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ ...valid, content: { ...valid.content, actionUrl: '//evil.example/path' } }).success,
  false,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ id: 'verification', content: { ...DEFAULT_EMAIL_TEMPLATES.verification, actionUrl: 'https://evil.example' } }).success,
  false,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ ...valid, content: { ...valid.content, extra: '<b>html</b>' } }).success,
  false,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ ...valid, content: { ...valid.content, links: Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, url: 'https://example.com' })) } }).success,
  false,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ ...valid, content: { ...valid.content, links: [{ label: 'x', url: 'https://user:pass@example.com' }] } }).success,
  false,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ ...valid, content: { ...valid.content, actionUrl: 'mailto:staff@example.com' } }).success,
  true,
);
assert.equal(
  emailTemplateSaveSchema.safeParse({ id: 'lead_notification', content: { ...DEFAULT_EMAIL_TEMPLATES.lead_notification, actionUrl: 'https://example.com' } }).success,
  false,
);

const registrationVariables = buildRegistrationEmailVariables(
  {
    slug: 'career-advancement',
    title: 'Career Advancement',
    event_start: '2026-11-15T19:00:00.000Z',
    event_end: '2026-11-15T21:00:00.000Z',
    location_text: 'Accra Centre',
    is_online: false,
  },
  [
    { questionId: 'name', label: 'Full name', type: 'short_text', value: 'Ada Okafor' },
    { questionId: 'interests', label: 'Areas of interest', type: 'checkboxes', value: ['Mentorship', 'Hiring'] },
    { questionId: 'notes', label: 'Additional notes', type: 'paragraph', value: '', skipped: true },
  ],
  'https://www.peoplegrowthafrica.com',
);
assert.deepEqual(registrationVariables, {
  eventName: 'Career Advancement',
  eventDate: '15 November 2026',
  eventTime: '8:00 PM–10:00 PM WAT',
  eventLocation: 'Accra Centre',
  eventFormat: 'In person',
  eventUrl: 'https://www.peoplegrowthafrica.com/events/career-advancement',
  registrationAnswers: 'Full name: Ada Okafor; Areas of interest: Mentorship, Hiring',
});

const onlineWithoutDetails = buildRegistrationEmailVariables(
  {
    slug: 'online-event',
    title: 'Online Event',
    event_start: null,
    event_end: null,
    location_text: null,
    is_online: true,
  },
  [],
  'https://www.peoplegrowthafrica.com',
);
assert.equal(onlineWithoutDetails.eventDate, 'Not specified');
assert.equal(onlineWithoutDetails.eventTime, 'Not specified');
assert.equal(onlineWithoutDetails.eventLocation, 'Online');
assert.equal(onlineWithoutDetails.registrationAnswers, '');

assert.equal(
  interpolateTemplate('{{eventName}} on {{eventDate}}: {{registrationAnswers}}', registrationVariables),
  'Career Advancement on 15 November 2026: Full name: Ada Okafor; Areas of interest: Mentorship, Hiring',
);
const unsafeVariables = {
  ...registrationVariables,
  registrationAnswers: '<script>alert(1)</script>',
};
const answerHtml = renderEmail({
  preheader: 'Registration details',
  heading: 'Your registration',
  paragraphs: [`Answers: ${interpolateTemplate('{{registrationAnswers}}', unsafeVariables)}`],
  reason: 'Reason',
  site: 'https://www.peoplegrowthafrica.com',
});
assert.match(answerHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(answerHtml, /<script>/);

const rendered = renderEmail({
  preheader: 'Preview',
  heading: '<script>alert(1)</script>',
  paragraphs: ['Hello'],
  action: { label: 'Go "now"', url: 'https://example.com/?a=1&b=2', style: 'soft-mint' },
  links: [{ label: '<img src=x>', url: 'https://example.com/learn' }],
  notes: ['Safe note'],
  reason: 'Reason',
  site: 'https://example.com',
});
assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(rendered, /Go &quot;now&quot;/);
assert.match(rendered, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
assert.match(rendered, /&lt;img src=x&gt;/);
assert.doesNotMatch(rendered, /<script>/);
assert.match(renderEmailText({ paragraphs: ['Hi'], action: { label: 'Open', url: 'https://example.com' }, links: [{ label: 'More', url: 'https://example.com/more' }], notes: ['Note'] }), /More:\nhttps:\/\/example.com\/more/);

// Zoho Mail Night Mode: every surface names its own background, text never
// inherits, the logo keeps a solid brand fill, and the old low-contrast muted
// grey is gone.
const solidGreen = renderEmail({
  preheader: 'Preview',
  heading: 'Solid button',
  paragraphs: ['Hello'],
  action: { label: 'Open', url: 'https://example.com', style: 'solid-green' },
  reason: 'Reason',
  site: 'https://example.com',
});
const leadHtml = renderLeadEmail({
  kind: 'Consultation',
  lines: ['Name: Ada Okafor', 'Email: ada@example.com', '', 'I need help with hiring.'],
  replyTo: 'team@example.com',
  site: 'https://example.com',
});
for (const html of [rendered, answerHtml, solidGreen, leadHtml]) {
  assert.match(html, /bgcolor="#F2EDE4"/);
  assert.match(html, /bgcolor="#FFFFFF"/);
  assert.match(html, /class="pg-body"/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /<meta name="color-scheme" content="light only" \/>/);
  assert.doesNotMatch(html, /background-color:\s*transparent/i);
  assert.doesNotMatch(html, /color:\s*#838B85/i);
  assert.doesNotMatch(html, /color:\s*#000000/i);
}
assert.match(solidGreen, /background-color:#14805E/);
assert.match(rendered, /bgcolor="#0F6E56"/);
assert.match(rendered, /border:1px solid #3E8A76/);
assert.match(leadHtml, /color:#A85E28/);
console.log('Email template validation and rendering checks passed.');
