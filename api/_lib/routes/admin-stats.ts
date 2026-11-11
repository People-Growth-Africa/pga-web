import { endpoint, sendJson } from '../http.js';
import { requireAdminDashboard } from '../staff.js';
import { parseInput, statsQuerySchema } from '../validation.js';
import {
  dailyCounts,
  findSessionUserById,
  getDashboardCounts,
  getConsultationPipelineCounts,
  registrationCountsByEvent,
  type CategoryStats,
} from '../db.js';
import { filterStatsForViewer, type DashboardViewer } from '../dashboard-visibility.js';
import { fillDays, previousWindow, rangeWindow } from '../dates.js';

/**
 * GET /api/admin/stats?range=7|30|90|all
 *
 * Aggregates only. No name, email or phone leaves this endpoint, which is what
 * makes it safe to render on a dashboard rather than a data list. Open to the
 * `requireAdminData` allowlist only - admin, project manager and HR manager.
 */

function withChange(
  stats: CategoryStats,
  previousFrom: string | null,
): CategoryStats & { change: number | null } {
  // No comparison is a statement of its own. A previous period with no rows,
  // or a dataset that only began after that period started, cannot produce a
  // percentage: "+100%" against nothing reads as growth that never happened.
  const hasCompletePrevious =
    previousFrom !== null &&
    stats.previous !== null &&
    stats.previous > 0 &&
    (stats.historyStart === null || stats.historyStart <= previousFrom);

  const change = hasCompletePrevious
    ? Math.round(((stats.current - (stats.previous ?? 0)) / (stats.previous ?? 1)) * 1000) / 10
    : null;
  return { ...stats, change };
}

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const session = await requireAdminDashboard(req, res);

  // Only the range is read: the rewrite that reaches this function also puts
  // `path` in the query string, and a strict schema would reject it.
  const parsed = parseInput(statsQuerySchema, { range: req.query?.range });
  const { from, to } = rangeWindow(parsed.range);
  const previous = parsed.range === 'all' ? null : previousWindow(from, to);

  const [counts, registrations, subscriptions, consultations, talent, employers, events] =
    await Promise.all([
      getDashboardCounts({ from, to }, previous),
      dailyCounts('registrations', from),
      dailyCounts('newsletter_subscribers', from, "status <> 'unsubscribed'"),
      dailyCounts('consultation_bookings', from),
      dailyCounts('users', from, "role = 'talent'"),
      dailyCounts('users', from, "role = 'employer'"),
      registrationCountsByEvent(from),
    ]);
  const consultationPipeline = await getConsultationPipelineCounts();

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

  const user = await findSessionUserById(session.userId);
  const viewer: DashboardViewer = {
    role: session.role,
    isSuperAdmin: user?.is_super_admin === true,
  };

  sendJson(
    res,
    200,
    filterStatsForViewer(
      {
        range: parsed.range,
        from,
        to,
        counts: {
          registrations: withChange(counts.registrations, previous?.from ?? null),
          subscriptions: withChange(counts.subscriptions, previous?.from ?? null),
          consultations: withChange(counts.consultations, previous?.from ?? null),
          talent: withChange(counts.talent, previous?.from ?? null),
          employers: withChange(counts.employers, previous?.from ?? null),
        },
        consultationPipeline,
        series,
        events,
      },
      viewer,
    ),
  );
});
