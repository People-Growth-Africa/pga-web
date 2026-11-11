import { endpoint, sendJson } from '../http.js';
import { requireAdminDashboard } from '../staff.js';
import { parseInput, trafficQuerySchema } from '../validation.js';
import { findSessionUserById, trafficAnalytics } from '../db.js';
import { canViewBotAnalytics, filterTrafficForViewer } from '../dashboard-visibility.js';
import { previousWindow, rangeWindow } from '../dates.js';

/**
 * GET /api/admin/traffic?range=7|30|90|all&hideBots=true|false
 *
 * Raw hits and pseudonymous identifiers never leave the server. All counts are
 * estimated because the prior collector retained only filtered aggregates.
 */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const session = await requireAdminDashboard(req, res);

  const parsed = parseInput(trafficQuerySchema, {
    range: req.query?.range,
    hideBots: req.query?.hideBots,
  });
  const { from, to } = rangeWindow(parsed.range);
  const previous = parsed.range === 'all' ? null : previousWindow(from, to);
  const chartFrom =
    parsed.range === 'all'
      ? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
      : from;
  // Roles that may not see bot analytics always get the human-only view, even
  // if the query string asks otherwise; the filter below then drops the bot
  // figures, the flag reasons and the traffic breakdown from the response.
  const user = await findSessionUserById(session.userId);
  const viewer = { role: session.role, isSuperAdmin: user?.is_super_admin === true };
  const maySeeBots = canViewBotAnalytics(viewer);
  const hideBots = maySeeBots ? parsed.hideBots === 'true' : true;

  const [traffic, previousTraffic] = await Promise.all([
    trafficAnalytics(from, to, hideBots, chartFrom),
    previous
      ? trafficAnalytics(previous.from, previous.to, hideBots)
      : Promise.resolve(null),
  ]);

  sendJson(
    res,
    200,
    filterTrafficForViewer(
      {
        range: parsed.range,
        from,
        to,
        hideBots,
        ...traffic,
        previous: previousTraffic?.totals ?? null,
      },
      viewer,
    ),
  );
});
