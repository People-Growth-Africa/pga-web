/**
 * Submit one URL to IndexNow and print what happened.
 *
 *   npm run indexnow:test -- /blog/some-published-slug
 *   npm run indexnow:test -- https://www.peoplegrowthafrica.com/events/some-published-slug
 *
 * This is the manual check for the key and the endpoint: it sends exactly one
 * URL, bypasses the production-only rule (that rule exists for automatic
 * announcements, not for a person testing), and prints the HTTP status. The key
 * is read but never printed - not in the URL, not in an error, not in a stack
 * trace. Only the canonical host is accepted, so a typo cannot announce a
 * preview deployment or somebody else's domain.
 */
import { loadEnvFiles } from './api-server.mjs';
import { INDEXNOW_HOST, INDEXNOW_SITE, sendIndexNow } from '../api/_lib/indexnow.ts';

const PUBLIC_PATH = /^\/(blog|events)(\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

function usage(message) {
  console.error(`${message}\n\nUsage: npm run indexnow:test -- <path or ${INDEXNOW_SITE} URL>`);
  process.exit(1);
}

/** A path or a canonical URL, or a reason why neither. */
function toPath(argument) {
  if (argument.startsWith('/')) {
    if (!PUBLIC_PATH.test(argument)) {
      usage(`"${argument}" is not a public blog or event path. Drafts, admin and API paths are never submitted.`);
    }
    return argument;
  }

  let url;
  try {
    url = new URL(argument);
  } catch {
    usage(`"${argument}" is neither a path nor a URL.`);
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== INDEXNOW_HOST) {
    usage(`Only https://${INDEXNOW_HOST} URLs can be submitted; got ${url.hostname}.`);
  }
  if (url.search || url.hash) {
    usage('Submit the canonical URL without a query string or fragment.');
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!PUBLIC_PATH.test(path)) {
    usage(`"${path}" is not a public blog or event path.`);
  }
  return path;
}

loadEnvFiles({ quiet: true });

const argument = process.argv[2];
if (!argument) usage('Which URL should be submitted?');

const path = toPath(argument);
const url = `${INDEXNOW_SITE}${path}`;

console.log(`Submitting ${url}`);

try {
  const status = await sendIndexNow([url]);
  console.log(`IndexNow answered ${status}.`);

  if (status === 200) console.log('Accepted.');
  else if (status === 202) console.log('Accepted, pending key validation.');
  else if (status === 400) console.log('Rejected: the request was malformed.');
  else if (status === 403) console.log('Rejected: the key was not valid for this host. Check that /<key>.txt is deployed and matches INDEXNOW_KEY.');
  else if (status === 422) console.log('Rejected: the URL does not belong to the host, or the key is missing.');
  else if (status === 429) console.log('Rate limited. Try again later.');
  else console.log('Unexpected answer; the IndexNow endpoint may be unavailable.');

  process.exit(status === 200 || status === 202 ? 0 : 1);
} catch (error) {
  // The message cannot contain the key: the request URL and body are never in
  // it, and the key is only read inside the module that sends the request.
  console.error(`The request failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
