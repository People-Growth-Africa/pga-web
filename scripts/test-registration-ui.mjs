import { randomBytes } from 'node:crypto';
import { loadEnvFiles, startApiServer } from './api-server.mjs';

const prefix = `test-registration-ui-${Date.now().toString(36)}`;
const pastSlug = `${prefix}-past`;
const futureSlug = `${prefix}-future`;
const externalSlug = `${prefix}-external`;
const externalUrl = 'https://example.test/register';

function check(description, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${description}${detail ? ` (${detail})` : ''}`);
  if (!passed) process.exitCode = 1;
}

async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Try the next installed browser.
    }
  }
  const paths = [
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['ProgramFiles(x86)'] &&
      `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.ProgramFiles &&
      `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);

  for (const executablePath of paths) {
    try {
      return await chromium.launch({ executablePath, headless: true });
    } catch {
      // Try the next installed browser.
    }
  }
  return chromium.launch({ headless: true });
}

async function main() {
  loadEnvFiles({ quiet: true });
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to create temporary event fixtures.');
  }
  process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  let server;
  let browser;

  try {
    await sql.query(
      `INSERT INTO posts (slug, title, excerpt, body, type, status, published_at, event_start, is_online, registration_url)
       VALUES
         ($1, 'Cutoff UI past event', 'Test event', 'Test body', 'event', 'published', now(), now() - interval '30 minutes', true, null),
         ($2, 'Cutoff UI future event', 'Test event', 'Test body', 'event', 'published', now(), now() + interval '30 days', true, null),
         ($3, 'Cutoff UI external event', 'Test event', 'Test body', 'event', 'published', now(), now() + interval '30 days', true, $4)`,
      [pastSlug, futureSlug, externalSlug, externalUrl],
    );

    server = await startApiServer({ quiet: true });
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });

    await page.goto(`${server.origin}/events/${pastSlug}`);
    const hero = page.locator('main section').first();
    const closedButton = hero.getByRole('button', { name: 'Registration closed' });
    await closedButton.waitFor({ timeout: 20_000 });
    check('Past event detail disables registration at 360px', await closedButton.isDisabled());
    check(
      'Past event detail offers no registration link',
      (await hero.getByRole('link', { name: /register/i }).count()) === 0,
    );

    await page.goto(`${server.origin}/events/${futureSlug}`);
    const openButton = page.getByRole('button', { name: 'Register free' });
    await openButton.waitFor({ timeout: 20_000 });
    check('Future event detail keeps first-party registration available', await openButton.isEnabled());

    const externalFallback = await page.request.get(`${server.origin}/events/${externalSlug}`);
    const externalFallbackHtml = await externalFallback.text();
    check(
      'Server-rendered event fallback omits off-site registration links',
      !externalFallbackHtml.includes(`href="${externalUrl}"`) &&
        !externalFallbackHtml.includes('Register for this event'),
    );
    const publicFeedResponse = await page.request.get(`${server.origin}/api/posts`);
    const publicFeed = await publicFeedResponse.json();
    const externalPost = publicFeed.posts.find((post) => post.slug === externalSlug);
    check(
      'Public event API omits off-site URLs but identifies externally registered events',
      publicFeedResponse.ok() &&
        externalPost?.registrationUrl === null &&
        externalPost?.hasExternalRegistration === true,
    );

    await page.goto(`${server.origin}/events/${externalSlug}`);
    const unavailableButton = page.getByRole('button', { name: 'Registration unavailable' }).first();
    await unavailableButton.waitFor({ timeout: 20_000 });
    check('External registration is unavailable in the public detail UI', await unavailableButton.isDisabled());

    await page.goto(`${server.origin}/events`);
    const pastCard = page.locator('article').filter({ hasText: 'Cutoff UI past event' });
    const cardStatus = pastCard.getByRole('button', { name: 'Registration closed' });
    await cardStatus.waitFor({ timeout: 20_000 });
    check('Event card replaces its registration action with the closed state', await cardStatus.isDisabled());
  } finally {
    await browser?.close();
    await server?.close();
    await sql.query('DELETE FROM posts WHERE slug IN ($1, $2, $3)', [pastSlug, futureSlug, externalSlug]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
