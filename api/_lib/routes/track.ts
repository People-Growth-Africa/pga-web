import { createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';

import { clientIp, endpoint, headerValue, parseJsonBody } from '../http.js';
import { parseInput, trackSchema } from '../validation.js';
import { enforceRateLimit } from '../ratelimit.js';
import { recordPageView } from '../db.js';

/**
 * POST /api/track
 *
 * One page view. Deliberately cheap: nothing is returned, no cookie is set, and
 * a path that is not a known public route is dropped. The IP and user agent are
 * used to count a daily unique visitor and are then discarded; only a salted
 * hash is kept, and that is deleted after two days by the cron job.
 */

const PUBLIC_EXACT = new Set([
  '/',
  '/events',
  '/blog',
  '/consultation',
  '/book',
  '/auth',
  '/auth/verify',
  '/forgot-password',
  '/newsletter/confirm',
  '/privacy',
  '/terms',
]);
const PUBLIC_PREFIXES = ['/events/', '/blog/'];

const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|curl\/|wget\/|python-requests|go-http-client|scrapy|monitor|uptime/i;

function publicPath(raw: string): { path: string; utmSource: string } | null {
  let url: URL;
  try {
    url = new URL(raw, 'https://www.peoplegrowthafrica.com');
  } catch {
    return null;
  }
  if (url.origin !== 'https://www.peoplegrowthafrica.com') return null;
  let path = url.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path.startsWith('/admin') || path.startsWith('/api')) return null;
  if (!PUBLIC_EXACT.has(path) && !PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return null;
  }
  const utmSource = (url.searchParams.get('utm_source') ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80);
  return { path: path.slice(0, 300), utmSource };
}

function referrerHost(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === 'peoplegrowthafrica.com' || host === 'localhost' || host === '127.0.0.1') {
      return '';
    }
    if (host.endsWith('.vercel.app')) return '';
    return host.slice(0, 100);
  } catch {
    return '';
  }
}

function deviceOf(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function countryOf(req: VercelRequest): string {
  const raw = headerValue(req.headers['x-vercel-ip-country'])?.toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(raw) ? raw : 'ZZ';
}

export default endpoint({ methods: ['POST'] }, async (req, res) => {
  const userAgent = headerValue(req.headers['user-agent']) ?? '';
  const doNotTrack =
    headerValue(req.headers.dnt) === '1' || headerValue(req.headers['sec-gpc']) === '1';
  if (doNotTrack || !userAgent || BOT_PATTERN.test(userAgent)) {
    res.status(204).end();
    return;
  }

  // A request with no salt cannot produce uniques that are safe to store. It is
  // dropped with the same empty answer rather than writing a guessable hash.
  const salt = process.env.TRAFFIC_HASH_SALT ?? process.env.JWT_SECRET;
  if (!salt) {
    res.status(204).end();
    return;
  }

  const data = parseInput(trackSchema, parseJsonBody(req));
  const target = publicPath(data.path);
  if (!target) {
    res.status(204).end();
    return;
  }

  const ip = clientIp(req);
  await enforceRateLimit({ name: 'track-ip', identifier: ip, limit: 120, windowSeconds: 3600 });

  const date = new Date().toISOString().slice(0, 10);
  const visitorHash = createHash('sha256')
    .update([ip, userAgent, salt, date].join('|'))
    .digest('hex');

  await recordPageView({
    date,
    path: target.path,
    referrerHost: referrerHost(data.referrer),
    utmSource: target.utmSource || (data.utmSource ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80),
    country: countryOf(req),
    device: deviceOf(userAgent),
    visitorHash,
  });

  res.status(204).end();
});
