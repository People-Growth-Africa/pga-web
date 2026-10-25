import { endpoint, sendJson } from '../http.js';
import { requireStaff } from '../staff.js';
import { parseInput, statsQuerySchema } from '../validation.js';
import { trafficDaily, trafficTop, trafficTotals } from '../db.js';
import { previousWindow, rangeWindow } from '../dates.js';

/**
 * GET /api/admin/traffic?range=7|30|90|all
 *
 * Aggregates only. The raw daily rows never leave the server, and the visitor
 * hashes are not part of any response.
 */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  await requireStaff(req, res);

  const parsed = parseInput(statsQuerySchema, { range: req.query?.range });
  const { from, to } = rangeWindow(parsed.range);
  const previous = parsed.range === 'all' ? null : previousWindow(from, to);
  // All time can span years; the totals stay all time, but the chart shows the
  // last year so the SVG does not carry thousands of points.
  const chartFrom =
    parsed.range === 'all'
      ? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
      : from;

  const [totals, daily, pages, referrers, countries, devices, previousTotals] = await Promise.all([
    trafficTotals(from, to),
    trafficDaily(chartFrom, to),
    trafficTop('path', from, to),
    trafficTop('referrer_host', from, to),
    trafficTop('country', from, to),
    trafficTop('device', from, to),
    previous ? trafficTotals(previous.from, previous.to) : Promise.resolve(null),
  ]);

  sendJson(res, 200, {
    range: parsed.range,
    from,
    to,
    totals,
    previous: previousTotals,
    daily,
    pages,
    referrers: referrers.map((row) => ({
      ...row,
      label: row.label === '' ? 'Direct' : row.label,
    })),
    countries,
    devices,
  });
});
