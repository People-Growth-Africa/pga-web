/**
 * Which hosts show the account forms, and which show the coming soon page.
 *
 * The accounts feature is finished but not announced, so `/auth` answers the
 * public site with a coming soon page while the machines and previews used to
 * build, review and demonstrate it keep the real forms. Getting this backwards is
 * expensive in both directions, so the mapping is tested: a demonstration host
 * must not be shut, and the public domain must not quietly publish a signup form.
 *
 * The rule lives in `src/lib/accountGate.ts` and mirrors the API's
 * `isLocalOrPreview`, which is the list of hosts the API will accept credentialed
 * requests from. A host that is open here but refused there would render a form
 * that cannot submit, which is why the two lists are kept in step.
 *
 *   npm run test:auth:gate
 *
 * This file imports the TypeScript module directly; Node 24 strips the types.
 */
import { accountScreensOpen } from '../src/lib/accountGate.ts';

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

/** host, expected to be open, why it is in the list. */
const HOSTS = [
  ['www.peoplegrowthafrica.com', false, 'the public site'],
  ['peoplegrowthafrica.com', false, 'the public site without the www'],
  ['WWW.PeopleGrowthAfrica.com', false, 'the same host, written differently'],
  ['www.peoplegrowthafrica.com.', false, 'a trailing dot resolves to the same host'],
  ['example.com', false, 'a host nobody has opened on purpose'],
  ['localhost', true, 'development'],
  ['127.0.0.1', true, 'development'],
  ['::1', true, 'development over IPv6'],
  ['[::1]', true, 'development over IPv6 as the browser reports it'],
  ['pga-web-git-feature-dashboards-acme.vercel.app', true, 'a preview deployment'],
  ['pga-web-abc123-acme.vercel.app', true, 'a preview deployment'],
  ['pga-web.vercel.app', true, 'the project alias, which the API also trusts'],
];

console.log('\nAccount screen gate\n');

for (const [index, [host, expected, reason]] of HOSTS.entries()) {
  check(
    index + 1,
    `${host} ${expected ? 'shows the account forms' : 'shows the coming soon page'}`,
    accountScreensOpen(host) === expected,
    reason,
  );
}

const openHosts = HOSTS.filter(([, expected]) => expected).length;
check(
  HOSTS.length + 1,
  'The public site stays closed while every demonstration host stays open',
  !accountScreensOpen('www.peoplegrowthafrica.com') &&
    accountScreensOpen('localhost') &&
    accountScreensOpen('pga-web-git-feature-dashboards-acme.vercel.app'),
  `${openHosts} open hosts, ${HOSTS.length - openHosts} closed`,
);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.log('\nFailing checks:');
  for (const result of results.filter((entry) => !entry.passed)) {
    console.log(`  ${result.number}. ${result.description} (${result.detail})`);
  }
}
process.exit(failures > 0 ? 1 : 0);
