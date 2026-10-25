import { endpoint, sendJson } from '../http.js';
import { requireStaff } from '../staff.js';
import { parseInput, statsQuerySchema } from '../validation.js';
import {
  dailyCounts,
  getDashboardCounts,
  registrationCountsByEvent,
  type CategoryStats,
} from '../db.js';
import { fillDays, rangeWindow } from '../dates.js';

/**
 * GET /api/admin/stats?range=7|30|90|all
 *
 * Aggregates only. No name, email or phone leaves this endpoint, which is what
 * makes it safe to render on a dashboard rather than a data list. Open to every
 * staff role; the role check is in `requireStaff`.
 */

function withChange(stats: CategoryStats): CategoryStats & { change: number } {
  const change =
    stats.prev7 === 0
      ? stats.last7 > 0
        ? 100
        : 0
      : Math.round(((stats.last7 - stats.prev7) / stats.prev7) * 1000) / 10;
  return { ...stats, change };
}

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  await requireStaff(req, res);

  // Only the range is read: the rewrite that reaches this function also puts
  // `path` in the query string, and a strict schema would reject it.
  const parsed = parseInput(statsQuerySchema, { range: req.query?.range });
  const { from, to } = rangeWindow(parsed.range);

  const [counts, registrations, subscriptions, consultations, talent, employers, events] =
    await Promise.all([
      getDashboardCounts(),
      dailyCounts('registrations', from),
      dailyCounts('newsletter_subscribers', from, "status <> 'unsubscribed'"),
      dailyCounts('consultation_bookings', from),
      dailyCounts('users', from, "role = 'talent'"),
      dailyCounts('users', from, "role = 'employer'"),
      registrationCountsByEvent(from),
    ]);

  const days = new Map<
    string,
    {
      day: string;
      registrations: number;
      subscriptions: number;
      consultations: number;
      talent: number;
      employers: number;
    }
  >();
  const ensure = (day: string) => {
    let row = days.get(day);
    if (!row) {
      row = { day, registrations: 0, subscriptions: 0, consultations: 0, talent: 0, employers: 0 };
      days.set(day, row);
    }
    return row;
  };
  for (const row of registrations) ensure(row.day).registrations = row.total;
  for (const row of subscriptions) ensure(row.day).subscriptions = row.total;
  for (const row of consultations) ensure(row.day).consultations = row.total;
  for (const row of talent) ensure(row.day).talent = row.total;
  for (const row of employers) ensure(row.day).employers = row.total;

  const series =
    parsed.range === 'all'
      ? [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
      : fillDays([...days.values()], from, to, (day) => ({
          day,
          registrations: 0,
          subscriptions: 0,
          consultations: 0,
          talent: 0,
          employers: 0,
        }));

  sendJson(res, 200, {
    range: parsed.range,
    from,
    to,
    counts: {
      registrations: withChange(counts.registrations),
      subscriptions: withChange(counts.subscriptions),
      consultations: withChange(counts.consultations),
      talent: withChange(counts.talent),
      employers: withChange(counts.employers),
    },
    series,
    events,
  });
});
