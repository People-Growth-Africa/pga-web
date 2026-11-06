import { endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireAdmin } from '../staff.js';
import { parseInput, emailTemplateSaveSchema } from '../validation.js';
import { emailTemplateCatalog, templateDefinition } from '../email-templates.js';
import { saveEmailTemplateOverride } from '../db.js';
import { auditActorForUser, prepareAuditWrite } from '../audit.js';

export default endpoint({ methods: ['GET', 'PUT'], csrf: true }, async (req, res) => {
  const session = await requireAdmin(req, res);
  if (req.method === 'GET') {
    sendJson(res, 200, { templates: await emailTemplateCatalog() });
    return;
  }

  const data = parseInput(emailTemplateSaveSchema, parseJsonBody(req));
  const definition = templateDefinition(data.id);
  const content = { ...data.content };
  // Security destinations are supplied by the send flow and never stored.
  if (definition.securitySensitive) delete content.actionUrl;
  const previous = (await emailTemplateCatalog()).find((template) => template.id === data.id)?.content;
  if (!previous) throw new Error(`Missing email template definition: ${data.id}`);
  const audit = prepareAuditWrite({
    req,
    actor: await auditActorForUser(session.userId),
    action: 'email_template.update',
    entity: { type: 'email_template', id: data.id, label: definition.label },
    before: { subject: previous.subject, paragraphs: previous.paragraphs },
    after: { subject: content.subject, paragraphs: content.paragraphs },
  });
  await saveEmailTemplateOverride({
    templateId: data.id,
    content,
    updatedBy: session.userId,
    audit,
  });
  sendJson(res, 200, { ok: true, message: `${definition.label} template saved.` });
});
