import type { VercelRequest, VercelResponse } from '@vercel/node';

import { logAudit } from '../audit.js';
import {
  listAuditLogs,
  listAuditLogsForExport,
  type AuditLogFilter,
  type AuditLogRow,
} from '../db.js';
import { csvRows } from '../csv.js';
import { endpoint, sendJson } from '../http.js';
import { requirePermission, requireSuperAdmin } from '../staff.js';
import { auditLogQuerySchema, parseInput } from '../validation.js';

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function filterFromRequest(req: VercelRequest): AuditLogFilter {
  const query = req.query ?? {};
  const parsed = parseInput(auditLogQuerySchema, {
    ...(str(query.from) ? { from: str(query.from) } : {}),
    ...(str(query.to) ? { to: str(query.to) } : {}),
    ...(str(query.actor) ? { actor: str(query.actor) } : {}),
    ...(str(query.role) ? { role: str(query.role) } : {}),
    ...(str(query.action) ? { action: str(query.action) } : {}),
    ...(str(query.entityType) ? { entityType: str(query.entityType) } : {}),
    page: str(query.page) ?? '1',
  });
  return {
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
    ...(parsed.actor ? { actor: parsed.actor } : {}),
    ...(parsed.role ? { role: parsed.role } : {}),
    ...(parsed.action ? { action: parsed.action } : {}),
    ...(parsed.entityType ? { entityType: parsed.entityType } : {}),
    page: parsed.page,
    pageSize: 50,
  };
}

function csvCell(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value) ?? '';
}

function sendCsv(res: VercelResponse, rows: AuditLogRow[]): void {
  const fields: (keyof AuditLogRow)[] = [
    'id',
    'created_at',
    'actor_id',
    'actor_email',
    'actor_role',
    'action',
    'entity_type',
    'entity_id',
    'entity_label',
    'before',
    'after',
    'ip',
    'user_agent',
    'request_id',
  ];
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csvRows([fields, ...rows.map((row) => fields.map((field) => csvCell(row[field])))]));
}

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const requested = `${req.url ?? ''} ${typeof req.query?.path === 'string' ? req.query.path : ''}`;
  const exporting = requested.includes('audit-log-export');
  const filter = filterFromRequest(req);

  if (exporting) {
    const { user } = await requireSuperAdmin(req, res);
    const rows = await listAuditLogsForExport(filter);
    await logAudit({
      req,
      actor: { id: user.id, email: user.email, role: user.role },
      action: 'audit_log.export',
      entity: { type: 'audit_log', label: 'Audit log export' },
      after: {
        dataset: 'audit_logs',
        filters: {
          from: filter.from ?? null,
          to: filter.to ?? null,
          actor: filter.actor ?? null,
          role: filter.role ?? null,
          action: filter.action ?? null,
          entityType: filter.entityType ?? null,
        },
        rowCount: rows.length,
      },
    });
    sendCsv(res, rows);
    return;
  }

  await requirePermission(req, res, 'audit_log.view');
  const result = await listAuditLogs(filter);
  sendJson(res, 200, { ...result, page: filter.page, pageSize: filter.pageSize });
});
