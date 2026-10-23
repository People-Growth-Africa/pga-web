/**
 * Submit URLs to IndexNow from the command line.
 *
 *   npm run indexnow                          every public URL in the sitemap
 *   npm run indexnow -- /blog/slug            only the URLs you name
 *
 * The sitemap is the source of truth for "every public URL": read from public/
 * or dist/ when a build has written one, fetched from the live site otherwise.
 * Only URLs on the canonical host are ever sent, so a local or preview sitemap
 * cannot announce itself. The key is public by design - the protocol
 * authenticates by fetching /<key>.txt, which public/ serves.
 */
import { readFile } from 'node:fs/promises';

const KEY = '21c72e17a6e74e4b98a2470e0d5885cf';
const HOST = 'www.peoplegrowthafrica.com';
const SITE = `https://${HOST}`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** A built sitemap may be in either place before the live one is tried. */
const SITEMAP_FILES = ['public/sitemap.xml', 'dist/sitemap.xml'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The canonical form of a URL on this host, or null for anything else. */
function canonical(value) {
  let url;
  try {
    url = new URL(value, SITE);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.host !== HOST) return null;
  // A query string or fragment does not change which page is served.
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** Canonical URLs in document order, one each. */
function fromSitemap(xml) {
  const urls = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const url = canonical(match[1].replace(/&amp;/g, '&'));
    if (url !== null && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** The sitemap text: a built copy if there is one, the live site otherwise. */
async function readSitemap() {
  for (const path of SITEMAP_FILES) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const response = await fetch(`${SITE}/sitemap.xml`);
  if (!response.ok) fail(`Could not read the sitemap: ${response.status} ${response.statusText}`);
  return response.text();
}

const args = process.argv.slice(2);
let urlList;

if (args.length > 0) {
  const rejected = args.filter((arg) => canonical(arg) === null);
  if (rejected.length > 0) fail(`Not a ${SITE} URL: ${rejected.join(', ')}`);
  urlList = [...new Set(args.map(canonical))];
} else {
  urlList = fromSitemap(await readSitemap());
}

if (urlList.length === 0) fail('Nothing to submit.');

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList,
  }),
  signal: AbortSignal.timeout(15_000),
});

const count = `${urlList.length} URL${urlList.length === 1 ? '' : 's'}`;
console.log(`${response.status} ${response.statusText} - ${count}`);

if (response.status !== 200 && response.status !== 202) {
  if (response.status === 403) console.error(`Is ${SITE}/${KEY}.txt deployed?`);
  process.exit(1);
}
