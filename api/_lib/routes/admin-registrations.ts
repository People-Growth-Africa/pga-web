import type { VercelResponse } from '@vercel/node';

import { endpoint, sendJson } from '../http.js';
import { requireAdminData } from '../staff.js';
import { recordAudit } from '../audit.js';
import { csvRows } from '../csv.js';
import { formatAnswersForCsv } from '../registration-form.js';
import { parseInput, registrationListQuerySchema } from '../validation.js';
import {
  countRegistrations,
  listRegistrations,
  listRegistrationsForExport,
  listRegistrationEventCounts,
  type RegistrationFilter,
  type RegistrationRow,
} from '../db.js';

/**
 * GET /api/admin/registrations        - paginated list, filter and search
 * GET /api/admin/registrations-export - the same filter, as CSV
 *
 * Both begin with `requireAdminData`, whose allowlist is admin, project manager
 * and HR manager only, so a talent, employer, content-manager session - or no
 * session at all - is refused before a row is read. The
 * responses carry names, emails and phone numbers, and `sendJson` marks them
 * no-store; the CSV does the same.
 */

const PAGE_SIZE = 25;

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function sendCsv(res: VercelResponse, rows: RegistrationRow[], eventSlug?: string): void {
  const header = ['Event', 'Name', 'Email', 'Phone', 'Organization', 'Notes', 'Answers', 'Registered at'];
  const body = [header, ...rows.map((row) => [
    row.event_slug,
    row.name,
    row.email,
    row.phone,
    row.organization,
    row.notes,
    formatAnswersForCsv(row.answers),
    row.created_at,
  ])];
  const today = new Date().toISOString().slice(0, 10);
  const label = eventSlug ?? 'all-events';

  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="registrations-${label}-${today}.csv"`);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csvRows(body));
}

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const session = await requireAdminData(req, res);

  const query = req.query ?? {};
  const parsePage = (raw: string | undefined) => {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : 1;
  };

  const filters: RegistrationFilter = {};
  const eventSlug = str(query.event);
  const searchText = str(query.search);
  if (eventSlug) filters.eventSlug = eventSlug;
  if (searchText) filters.search = searchText;

  // Validate the query with the same schema the list endpoint uses; page is
  // ignored for the export, which returns everything matching the filters.
  const parsed = parseInput(registrationListQuerySchema, {
    ...(eventSlug ? { event: eventSlug } : {}),
    ...(searchText ? { search: searchText } : {}),
    page: parsePage(str(query.page)),
  });
  const filter: RegistrationFilter = {
    ...(parsed.event ? { eventSlug: parsed.event } : {}),
    ...(parsed.search ? { search: parsed.search } : {}),
  };

  const requested = `${req.url ?? ''} ${typeof query.path === 'string' ? query.path : ''}`;

  if (requested.includes('registrations-export')) {
    await recordAudit('csv_export', {
      userId: session.userId,
      detail: `type=registrations event=${filter.eventSlug ?? 'all'} search=${filter.search ? 'yes' : 'no'}`,
    });
    const rows = await listRegistrationsForExport(filter);
    sendCsv(res, rows, filter.eventSlug);
    return;
  }

  const page = parsed.page ?? 1;
  const [registrations, total, events] = await Promise.all([
    listRegistrations({ ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countRegistrations(filter),
    listRegistrationEventCounts(),
  ]);

  sendJson(res, 200, {
    registrations,
    total,
    page,
    pageSize: PAGE_SIZE,
    events,
  });
});
