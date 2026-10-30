import { endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireAdmin } from '../staff.js';
import { parseInput, emailTemplateSaveSchema } from '../validation.js';
import { emailTemplateCatalog, templateDefinition } from '../email-templates.js';
import { saveEmailTemplateOverride } from '../db.js';
import { recordAudit } from '../audit.js';

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
  await saveEmailTemplateOverride({
    templateId: data.id,
    content,
    updatedBy: session.userId,
  });
  await recordAudit('email_template_updated', {
    userId: session.userId,
    detail: data.id,
  });
  sendJson(res, 200, { ok: true, message: `${definition.label} template saved.` });
});
