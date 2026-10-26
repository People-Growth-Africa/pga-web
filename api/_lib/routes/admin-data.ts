import type { VercelResponse } from '@vercel/node';

import { endpoint, sendJson } from '../http.js';
import { requireAdminData } from '../staff.js';
import { parseInput, dataQuerySchema } from '../validation.js';
import {
  countConsultations,
  countRegistrations,
  countSubscriptions,
  listConsultations,
  listConsultationsForExport,
  listRegistrations,
  listRegistrationsForExport,
  listRegistrationEventCounts,
  listSubscriptions,
  listSubscriptionsForExport,
  type DataFilter,
} from '../db.js';
import { recordAudit } from '../audit.js';
import { csvRows } from '../csv.js';
import { todayIso } from '../dates.js';

/**
 * GET /api/admin/data?type=registrations|subscriptions|consultations
 * GET /api/admin/data-export  (the same filters, as CSV)
 *
 * Only admin, project manager and HR manager may read and export these lists.
 * The allowlist is explicit in `requireAdminData`, so content managers and any
 * future role are refused by default. Every response is no-store because the
 * rows carry names, emails and phone numbers.
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

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const session = await requireAdminData(req, res);
  const query = req.query ?? {};
  const parsed = parseInput(dataQuerySchema, {
    type: query.type,
    page: str(query.page) ?? '1',
    ...(str(query.search) ? { search: str(query.search) } : {}),
    ...(str(query.from) ? { from: str(query.from) } : {}),
    ...(str(query.to) ? { to: str(query.to) } : {}),
    ...(str(query.event) ? { event: str(query.event) } : {}),
  });

  const filter: DataFilter = {
    ...(parsed.search ? { search: parsed.search } : {}),
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
    // Only registrations have an event column; a stray event parameter on the
    // other tabs is ignored rather than sent to a table that lacks it.
    ...(parsed.type === 'registrations' && parsed.event ? { eventSlug: parsed.event } : {}),
  };
  // The function can arrive with the endpoint in req.url or in the `path`
  // query produced by the /api rewrite; accept either.
  const requested = `${req.url ?? ''} ${typeof query.path === 'string' ? query.path : ''}`;
  const exporting = requested.includes('data-export');

  if (exporting) {
    await recordAudit('csv_export', {
      userId: session.userId,
      detail: [
        `type=${parsed.type}`,
        `event=${parsed.event ?? 'all'}`,
        `from=${parsed.from ?? 'any'}`,
        `to=${parsed.to ?? 'any'}`,
        `search=${parsed.search ? 'yes' : 'no'}`,
      ].join(' '),
    });
  }

  if (parsed.type === 'registrations') {
    if (exporting) {
      const rows = await listRegistrationsForExport(filter);
      sendCsv(res, `registrations-${parsed.event ?? 'all-events'}-${todayIso()}.csv`, [
        ['Event', 'Name', 'Email', 'Phone', 'Organization', 'Notes', 'Registered at'],
        ...rows.map((row) => [
          row.event_slug,
          row.name,
          row.email,
          row.phone,
          row.organization,
          row.notes,
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

  if (exporting) {
    const rows = await listConsultationsForExport(filter);
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
