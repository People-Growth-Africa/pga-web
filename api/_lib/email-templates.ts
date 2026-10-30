import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_IDS,
  EMAIL_TEMPLATE_LABELS,
  SECURITY_TEMPLATE_IDS,
  isEmailTemplateId,
  type EmailTemplateContent,
  type EmailTemplateDefinition,
  type EmailTemplateId,
} from './email-template-content.js';

export type EmailTemplateVariables = Record<string, string | undefined>;

export async function emailTemplateCatalog(): Promise<EmailTemplateDefinition[]> {
  return Promise.all(EMAIL_TEMPLATE_IDS.map(async (id) => ({
    id,
    label: EMAIL_TEMPLATE_LABELS[id],
    securitySensitive: SECURITY_TEMPLATE_IDS.has(id),
    content: await resolveEmailTemplate(id),
  })));
}

export function templateDefinition(id: EmailTemplateId): EmailTemplateDefinition {
  return {
    id,
    label: EMAIL_TEMPLATE_LABELS[id],
    securitySensitive: SECURITY_TEMPLATE_IDS.has(id),
    content: structuredClone(DEFAULT_EMAIL_TEMPLATES[id]),
  };
}

export function isSecurityEmailTemplate(id: EmailTemplateId): boolean {
  return SECURITY_TEMPLATE_IDS.has(id);
}

export async function resolveEmailTemplate(
  id: EmailTemplateId,
  variables: EmailTemplateVariables = {},
  systemActionUrl?: string,
): Promise<EmailTemplateContent> {
  let override: Partial<EmailTemplateContent> | null = null;
  try {
    const db = await import('./db.js');
    const row = await db.getEmailTemplateOverride(id);
    if (row && row.content && typeof row.content === 'object' && !Array.isArray(row.content)) {
      override = row.content as Partial<EmailTemplateContent>;
    }
  } catch (error) {
    // Email delivery must keep working if this optional customization table is
    // not migrated yet or the database is temporarily unavailable.
    if (isMissingTemplateTable(error)) return interpolateContent(DEFAULT_EMAIL_TEMPLATES[id], variables, systemActionUrl, id);
    console.error('[email-template] override lookup failed; using defaults');
  }

  return interpolateContent(mergeTemplateOverride(id, override), variables, systemActionUrl, id);
}

function mergeTemplateOverride(
  id: EmailTemplateId,
  override: Partial<EmailTemplateContent> | null,
): EmailTemplateContent {
  const base = DEFAULT_EMAIL_TEMPLATES[id];
  return {
    ...base,
    ...override,
    paragraphs: Array.isArray(override?.paragraphs) ? override.paragraphs : base.paragraphs,
    notes: Array.isArray(override?.notes) ? override.notes : base.notes,
    links: Array.isArray(override?.links) ? override.links : base.links,
  };
}

function interpolateContent(
  content: EmailTemplateContent,
  variables: EmailTemplateVariables,
  systemActionUrl: string | undefined,
  id: EmailTemplateId,
): EmailTemplateContent {
  const interpolate = (value: string) => interpolateTemplate(value, variables);
  return {
    ...content,
    subject: interpolate(content.subject),
    preheader: interpolate(content.preheader),
    heading: interpolate(content.heading),
    paragraphs: content.paragraphs.map(interpolate),
    notes: content.notes.map(interpolate),
    actionLabel: interpolate(content.actionLabel),
    actionUrl: isSecurityEmailTemplate(id)
      ? systemActionUrl
      : content.actionUrl
        ? interpolate(content.actionUrl)
        : undefined,
    links: content.links.map((link) => ({ label: interpolate(link.label), url: interpolate(link.url) })),
  };
}

export function interpolateTemplate(value: string, variables: EmailTemplateVariables): string {
  return value.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, key: string) => variables[key] ?? '');
}

export function isMissingTemplateTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String(error.message) : '';
  const code = 'code' in error ? String(error.code) : '';
  return code === '42P01' || /email_template_overrides.*does not exist/i.test(message);
}

export { isEmailTemplateId };
