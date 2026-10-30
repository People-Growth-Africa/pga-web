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
const { renderEmail, renderEmailText } = await import('../api/_lib/email-template.ts');
const { emailTemplateSaveSchema } = await import('../api/_lib/validation.ts');

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
console.log('Email template validation and rendering checks passed.');
