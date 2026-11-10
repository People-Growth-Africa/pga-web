import type { VercelResponse } from '@vercel/node';

import { ApiError, endpoint, MAX_ADMIN_BODY_BYTES, parseJsonBody, sendJson } from '../http.js';
import { requireAdminData, requireAllPermissions, requirePermission, requireSuperAdmin } from '../staff.js';
import { parseInput, dataMutationSchema, dataQuerySchema } from '../validation.js';
import {
  countConsultations,
  countRegistrations,
  countSubscriptions,
  countUserAccounts,
  listConsultations,
  listConsultationsForExport,
  listRegistrations,
  listRegistrationsForExport,
  listRegistrationEventCounts,
  listSubscriptions,
  listSubscriptionsForExport,
  listUserAccounts,
  listUserAccountsForExport,
  permanentlyDeleteDataRecord,
  setDataRecordDeleted,
  updateConsultationField,
  listStaffAccounts,
  type DataFilter,
  type DeletableDataType,
  type UserAccountFilter,
} from '../db.js';
import { auditActorForUser, logAudit, prepareAuditWrite } from '../audit.js';
import { csvRows } from '../csv.js';
import { formatAnswersForCsv } from '../registration-form.js';
import { todayIso } from '../dates.js';
import { createBestEffortNotification } from '../notifications.js';
import { SECURITY_ALERT_EVENTS, SECURITY_ALERT_THRESHOLDS } from '../security-alert-config.js';
import { scheduleBestEffort } from '../best-effort.js';
import { hasEffectivePermission } from '../access.js';

/**
 * GET /api/admin/data?type=registrations|subscriptions|consultations|users
 * GET /api/admin/data-export  (the same filters, as CSV)
 *
 * Lists require `admin.data.read`; CSV routes additionally require `export.data`.
 * Existing data-role defaults retain both permissions, and future grants cannot
 * bypass the data-read permission. Every response is no-store because the rows
 * carry names, emails and phone numbers.
 */

const PAGE_SIZE = 25;

function sendCsv(res: VercelResponse, filename: string, rows: (string | number | null | undefined)[][]): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csvRows(rows));
}

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export default endpoint({ methods: ['GET', 'POST'], csrf: true }, async (req, res) => {
  const query = req.query ?? {};
  const requested = `${req.url ?? ''} ${typeof query.path === 'string' ? query.path : ''}`;
  const exporting = requested.includes('data-export');
  if (req.method === 'POST') {
    if (exporting) throw new ApiError(405, 'method_not_allowed', 'This action is not available here.');
    const body = parseInput(dataMutationSchema, parseJsonBody(req, MAX_ADMIN_BODY_BYTES));
    if (
      body.action === 'consultation_status' ||
      body.action === 'consultation_assign' ||
      body.action === 'consultation_note'
    ) {
      const session = await requirePermission(req, res, 'consultation.update');
      let change:
        | { type: 'status'; status: 'new' | 'contacted' | 'scheduled' | 'done' }
        | { type: 'assignment'; assignedTo: string | null }
        | { type: 'note'; internalNotes: string };
      let action: 'consultation.status_change' | 'consultation.assignment' | 'consultation.note_edit';
      if (body.action === 'consultation_status') {
        change = { type: 'status', status: body.status };
        action = 'consultation.status_change';
      } else if (body.action === 'consultation_assign') {
        if (body.assignedTo) {
          const staff = (await listStaffAccounts()).find(
            (account) => account.id === body.assignedTo && account.disabled_at === null,
          );
          if (!staff || !(await hasEffectivePermission(staff.id, staff.role, 'consultation.update'))) {
            throw new ApiError(400, 'invalid_assignee', 'Choose an active staff member with consultation access.');
          }
        }
        change = { type: 'assignment', assignedTo: body.assignedTo };
        action = 'consultation.assignment';
      } else {
        change = { type: 'note', internalNotes: body.internalNotes };
        action = 'consultation.note_edit';
      }
      const result = await updateConsultationField({
        id: body.id,
        actorId: session.userId,
        change,
        audit: prepareAuditWrite({
          req,
          actor: await auditActorForUser(session.userId),
          action,
          entity: { type: 'consultation', id: body.id },
        }),
      });
      if (!result.changed) {
        sendJson(res, 200, { ok: true, changed: false });
        return;
      }
      if (
        change.type === 'assignment' &&
        change.assignedTo &&
        change.assignedTo !== result.previousAssignee
      ) {
        scheduleBestEffort(
          () => createBestEffortNotification({ event: 'consultation.assigned', assigneeId: change.assignedTo! }),
          'notification',
        );
      }
      sendJson(res, 200, { ok: true, changed: true });
      return;
    }
    const session = body.action === 'purge'
      ? (await requireSuperAdmin(req, res)).session
      : await requirePermission(req, res, 'admin.data.manage');
    const entityType = body.type === 'registrations'
      ? 'registration'
      : body.type === 'subscriptions'
        ? 'subscription'
        : 'consultation';
    const action = `${entityType}.${body.action}` as
      | 'registration.delete' | 'registration.restore' | 'registration.purge'
      | 'subscription.delete' | 'subscription.restore' | 'subscription.purge'
      | 'consultation.delete' | 'consultation.restore' | 'consultation.purge';
    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(session.userId),
      action,
      entity: { type: entityType, id: body.id },
      before: { id: body.id },
      after: { id: body.id, deleted: body.action === 'delete' },
    });
    const result = body.action === 'purge'
      ? await permanentlyDeleteDataRecord({ type: body.type as DeletableDataType, id: body.id, audit })
      : await setDataRecordDeleted({
          type: body.type as DeletableDataType,
          id: body.id,
          actorId: session.userId,
          deleted: body.action === 'delete',
          audit,
        });
    if (!result) throw new ApiError(404, 'not_found', 'That record could not be found in this list.');
    sendJson(res, 200, { ok: true, action: body.action, id: body.id });
    return;
  }
  const session = exporting
    ? await requireAllPermissions(req, res, ['admin.data.read', 'export.data'])
    : await requireAdminData(req, res);
  const parsed = parseInput(dataQuerySchema, {
    type: query.type,
    page: str(query.page) ?? '1',
    ...(str(query.search) ? { search: str(query.search) } : {}),
    ...(str(query.from) ? { from: str(query.from) } : {}),
    ...(str(query.to) ? { to: str(query.to) } : {}),
    ...(str(query.event) ? { event: str(query.event) } : {}),
    ...(str(query.role) ? { role: str(query.role) } : {}),
    ...(str(query.deleted) ? { deleted: str(query.deleted) } : {}),
    ...(str(query.status) ? { status: str(query.status) } : {}),
    ...(str(query.owner) ? { owner: str(query.owner) } : {}),
  });

  const filter: DataFilter = {
    ...(parsed.search ? { search: parsed.search } : {}),
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
    // Only registrations have an event column; a stray event parameter on the
    // other tabs is ignored rather than sent to a table that lacks it.
    ...(parsed.type === 'registrations' && parsed.event ? { eventSlug: parsed.event } : {}),
    ...(!exporting && parsed.type !== 'users' && parsed.deleted === 'true' ? { deletedOnly: true } : {}),
    ...(parsed.type === 'consultations' && parsed.status ? { status: parsed.status } : {}),
    ...(parsed.type === 'consultations' && parsed.owner
      ? { ownerId: parsed.owner }
      : {}),
  };
  const assignableStaff = parsed.type === 'consultations' &&
    await hasEffectivePermission(session.userId, session.role, 'consultation.update')
    ? (await Promise.all(
        (await listStaffAccounts())
          .filter((account) => account.disabled_at === null)
          .map(async (account) => ({
            account,
            allowed: await hasEffectivePermission(account.id, account.role, 'consultation.update'),
          })),
      ))
        .filter(({ allowed }) => allowed)
        .map(({ account }) => ({ id: account.id, name: account.name, email: account.email }))
    : [];
  const userFilter: UserAccountFilter = {
    ...(parsed.search ? { search: parsed.search } : {}),
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
    ...(parsed.role ? { role: parsed.role } : {}),
  };
  const auditExport = async (rowCount: number) => {
    await logAudit({
      req,
      actor: await auditActorForUser(session.userId),
      action: 'data.export',
      entity: { type: parsed.type, label: `${parsed.type} export` },
      after: {
        dataset: parsed.type,
        filters: {
          event: parsed.event ?? null,
          from: parsed.from ?? null,
          to: parsed.to ?? null,
          search: parsed.search ? 'provided' : null,
          role: parsed.type === 'users' ? parsed.role ?? null : null,
          status: parsed.type === 'consultations' ? parsed.status ?? null : null,
          owner: parsed.type === 'consultations' ? parsed.owner ?? null : null,
        },
        rowCount,
      },
    });
    if (rowCount > SECURITY_ALERT_THRESHOLDS.largeExportRows || parsed.type === 'users') {
      scheduleBestEffort(
        () => createBestEffortNotification({
          event: SECURITY_ALERT_EVENTS.export,
          dataset: parsed.type,
          rowCount,
          sensitive: parsed.type === 'users',
        }),
        'security-alert',
      );
    }
  };

  if (parsed.type === 'registrations') {
    if (exporting) {
      const rows = await listRegistrationsForExport(filter);
      await auditExport(rows.length);
      // Because the table no longer shows the answers, every form question
      // becomes its own column: the questions in first-appearance order, an
      // empty cell when a row has no answer for it. csvRows still escapes and
      // the audit above still records the export.
      const seen = new Set<string>();
      const questions: string[] = [];
      for (const row of rows) {
        if (!Array.isArray(row.answers)) continue;
        for (const answer of row.answers as { label?: unknown }[]) {
          const label = typeof answer.label === 'string' ? answer.label.trim() : '';
          if (label && !seen.has(label)) {
            seen.add(label);
            questions.push(label);
          }
        }
      }
      const answerFor = (row: (typeof rows)[number], label: string): string => {
        if (!Array.isArray(row.answers)) return '';
        const found = (row.answers as { label?: unknown; value?: unknown; skipped?: boolean }[]).find(
          (answer) => typeof answer.label === 'string' && answer.label.trim() === label,
        );
        if (!found || found.skipped) return '';
        const value = found.value;
        return Array.isArray(value)
          ? value.filter((part) => typeof part === 'string' && part !== '').join(', ')
          : typeof value === 'string'
            ? value
            : String(value ?? '');
      };
      sendCsv(res, `registrations-${parsed.event ?? 'all-events'}-${todayIso()}.csv`, [
        [
          'Event',
          'Name',
          'Email',
          'Phone',
          'Organization',
          'Notes',
          'Answers',
          ...questions,
          'Registered at',
        ],
        ...rows.map((row) => [
          row.event_slug,
          row.name,
          row.email,
          row.phone,
          row.organization,
          row.notes,
          formatAnswersForCsv(row.answers),
          ...questions.map((label) => answerFor(row, label)),
          row.created_at,
        ]),
      ]);
      return;
    }

    const [rows, total, events] = await Promise.all([
      listRegistrations({ ...filter, limit: PAGE_SIZE, offset: (parsed.page - 1) * PAGE_SIZE }),
      countRegistrations(filter),
      listRegistrationEventCounts(),
    ]);
    sendJson(res, 200, { type: parsed.type, rows, total, page: parsed.page, pageSize: PAGE_SIZE, events });
    return;
  }

  if (parsed.type === 'subscriptions') {
    if (exporting) {
      const rows = await listSubscriptionsForExport(filter);
      await auditExport(rows.length);
      sendCsv(res, `subscriptions-${todayIso()}.csv`, [
        ['Email', 'Status', 'Source', 'Subscribed at'],
        ...rows.map((row) => [row.email, row.status, row.source, row.created_at]),
      ]);
      return;
    }

    const [rows, total] = await Promise.all([
      listSubscriptions({ ...filter, limit: PAGE_SIZE, offset: (parsed.page - 1) * PAGE_SIZE }),
      countSubscriptions(filter),
    ]);
    sendJson(res, 200, { type: parsed.type, rows, total, page: parsed.page, pageSize: PAGE_SIZE });
    return;
  }

  if (parsed.type === 'users') {
    if (exporting) {
      const rows = await listUserAccountsForExport(userFilter);
      await auditExport(rows.length);
      sendCsv(res, `user-accounts-${todayIso()}.csv`, [
        [
          'Name',
          'Email',
          'Role',
          'Company',
          'Field',
          'Country',
          'Availability',
          'Looking for',
          'Email verified',
          'Joined',
        ],
        ...rows.map((row) => [
          row.name,
          row.email,
          row.role === 'talent' ? 'Talent' : 'Employer',
          row.company,
          row.field,
          row.country,
          row.availability,
          Array.isArray(row.needs) ? row.needs.join('; ') : '',
          row.email_verified ? 'Yes' : 'No',
          row.created_at,
        ]),
      ]);
      return;
    }

    const [rows, total] = await Promise.all([
      listUserAccounts({ ...userFilter, limit: PAGE_SIZE, offset: (parsed.page - 1) * PAGE_SIZE }),
      countUserAccounts(userFilter),
    ]);
    sendJson(res, 200, {
      type: parsed.type,
      rows,
      total,
      page: parsed.page,
      pageSize: PAGE_SIZE,
      assignableStaff,
    });
    return;
  }

  if (exporting) {
    const rows = await listConsultationsForExport(filter);
    await auditExport(rows.length);
    sendCsv(res, `consultations-${todayIso()}.csv`, [
      [
        'Name',
        'Email',
        'Phone',
        'Organisation',
        'Service',
        'Format',
        'Preferred date',
        'Preferred slot',
        'Notes',
        'Status',
        'Booked at',
      ],
      ...rows.map((row) => [
        row.name,
        row.email,
        row.phone,
        row.organisation,
        row.service,
        row.meeting_format,
        row.preferred_date,
        row.preferred_slot,
        row.notes,
        row.status,
        row.created_at,
      ]),
    ]);
    return;
  }

  const [rows, total] = await Promise.all([
    listConsultations({ ...filter, limit: PAGE_SIZE, offset: (parsed.page - 1) * PAGE_SIZE }),
    countConsultations(filter),
  ]);
  sendJson(res, 200, { type: parsed.type, rows, total, page: parsed.page, pageSize: PAGE_SIZE });
});
