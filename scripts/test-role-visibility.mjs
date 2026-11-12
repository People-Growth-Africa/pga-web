/**
 * Role visibility for the dashboard, tested without a browser and without a
 * database.
 *
 * The response filters are the enforcement point: `/api/admin/stats` and
 * `/api/admin/traffic` build their full body and pass it through these before
 * sending it. A key that a role may not see is therefore absent from the JSON,
 * not blanked out in the browser. This suite walks every dashboard role and
 * checks the keys that are present.
 *
 *   npm run test:role-visibility
 */
import {
  canViewBotAnalytics,
  canViewConsultationPipeline,
  filterStatsForViewer,
  filterTrafficForViewer,
} from '../api/_lib/dashboard-visibility.ts';

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

const statsBody = () => ({
  range: '30',
  from: '2026-01-01',
  to: '2026-01-30',
  counts: { registrations: { total: 1, last7: 1, prev7: 0, change: 100 } },
  consultationPipeline: {
    new: 4,
    contacted: 2,
    scheduled: 1,
    done: 3,
    newOlderThan48Hours: 1,
  },
  series: [],
  events: [],
});

const trafficBody = () => ({
  totals: { views: 120, uniques: 80 },
  previous: { views: 100, uniques: 70 },
  daily: [{ day: '2026-01-01', views: 10, uniques: 8, botViews: 2 }],
  pages: [{ label: '/', views: 10 }],
  referrers: [{ label: 'Direct / none', views: 4 }],
  countries: [{ label: 'NG', views: 10, humanViews: 8, suspectedBotViews: 2 }],
  devices: [{ label: 'mobile', views: 10 }],
  suspectedBots: { hits: 2, reasons: [{ reason: 'known_bot', hits: 2 }] },
});

const RESTRICTED_TRAFFIC_KEYS = ['suspectedBots', 'pages', 'referrers', 'countries', 'devices'];

/**
 * Every role that can open the dashboard, plus the two that cannot. The rules
 * are about roles, not grants: no `permissions` property is read anywhere.
 */
const CASES = [
  { label: 'super administrator', viewer: { role: 'admin', isSuperAdmin: true }, pipeline: true, bots: true },
  { label: 'administrator', viewer: { role: 'admin', isSuperAdmin: false }, pipeline: false, bots: true },
  { label: 'HR manager', viewer: { role: 'hr_manager', isSuperAdmin: false }, pipeline: true, bots: false },
  { label: 'project manager', viewer: { role: 'project_manager', isSuperAdmin: false }, pipeline: false, bots: false },
  { label: 'data administrator', viewer: { role: 'data_admin', isSuperAdmin: false }, pipeline: false, bots: false },
  { label: 'content manager', viewer: { role: 'content_manager', isSuperAdmin: false }, pipeline: false, bots: false },
  { label: 'talent', viewer: { role: 'talent', isSuperAdmin: false }, pipeline: false, bots: false },
];

let n = 0;
for (const testCase of CASES) {
  const { label, viewer, pipeline, bots } = testCase;
  const stats = filterStatsForViewer(statsBody(), viewer);
  check(
    ++n,
    `${label}: consultation pipeline ${pipeline ? 'is present' : 'is absent'}`,
    ('consultationPipeline' in stats) === pipeline,
    `keys: ${Object.keys(stats).join(', ')}`,
  );

  const traffic = filterTrafficForViewer(trafficBody(), viewer);
  const restrictedPresent = RESTRICTED_TRAFFIC_KEYS.filter((key) => key in traffic);
  check(
    ++n,
    `${label}: bot hits, reasons and traffic breakdown ${bots ? 'are present' : 'are absent'}`,
    bots ? restrictedPresent.length === RESTRICTED_TRAFFIC_KEYS.length : restrictedPresent.length === 0,
    restrictedPresent.length ? `leaked: ${restrictedPresent.join(', ')}` : 'no restricted keys',
  );

  check(
    ++n,
    `${label}: totals and the human series always remain`,
    traffic.totals?.views === 120 && Array.isArray(traffic.daily) && 'previous' in traffic,
  );

  check(
    ++n,
    `${label}: rule helpers agree with the filters`,
    canViewConsultationPipeline(viewer) === pipeline && canViewBotAnalytics(viewer) === bots,
  );
}

// A grant for consultation.update is not an input to these filters. Passing one
// along must change nothing: only the role and the super-administrator flag do.
const grantedProjectManager = {
  role: 'project_manager',
  isSuperAdmin: false,
  permissions: ['consultation.update'],
};
check(
  ++n,
  'A Manage consultations grant does not reveal the pipeline',
  !('consultationPipeline' in filterStatsForViewer(statsBody(), grantedProjectManager)),
);

check(
  ++n,
  'A data administrator still gets no traffic breakdown even when asking for bots',
  RESTRICTED_TRAFFIC_KEYS.every(
    (key) => !(key in filterTrafficForViewer(trafficBody(), { role: 'data_admin', isSuperAdmin: false })),
  ),
);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.log('\nFailing checks:');
  for (const result of results.filter((entry) => !entry.passed)) {
    console.log(`  ${result.number}. ${result.description} (${result.detail})`);
  }
}
process.exit(failures > 0 ? 1 : 0);
