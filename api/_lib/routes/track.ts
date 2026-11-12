import { createHash, createHmac, randomUUID } from 'node:crypto';
import { clientIp, endpoint, headerValue, parseJsonBody } from '../http.js';
import { parseInput, trackSchema } from '../validation.js';
import { recordTrafficHit, type TrafficHitInput } from '../db.js';
import { normalizeReferrerHost } from '../referrers.js';

function normalizedPath(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw, 'https://www.peoplegrowthafrica.com');
  } catch {
    return '/';
  }
  let path = url.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path.slice(0, 300) || '/';
}

function referrerHost(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === 'peoplegrowthafrica.com' || host === 'localhost' || host === '127.0.0.1') {
      return '';
    }
    if (host.endsWith('.vercel.app')) return '';
    return normalizeReferrerHost(host);
  } catch {
    return '';
  }
}

function deviceOf(userAgent: string): string {
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function countryOf(value: string | undefined): string {
  const raw = value?.toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(raw) ? raw : 'ZZ';
}

function utmSourceOf(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
}

function hashes(ip: string, userAgent: string): { ipHash: string | null; visitorHash: string | null } {
  const salt = process.env.TRAFFIC_HASH_SALT ?? process.env.AUDIT_HASH_SECRET ?? process.env.JWT_SECRET;
  if (!salt) return { ipHash: null, visitorHash: null };
  const date = new Date().toISOString().slice(0, 10);
  return {
    ipHash: createHmac('sha256', salt).update(ip || 'unknown').digest('hex').slice(0, 32),
    visitorHash: createHash('sha256')
      .update([ip || 'unknown', userAgent, salt, date].join('|'))
      .digest('hex'),
  };
}

export function trafficHitInput(input: {
  hitId: string;
  path: string;
  referrer?: string;
  utmSource?: string;
  ip: string;
  userAgent: string;
  country?: string;
  javascriptExecuted: boolean;
}): TrafficHitInput {
  const { ipHash, visitorHash } = hashes(input.ip, input.userAgent);
  return {
    hitId: input.hitId,
    path: normalizedPath(input.path),
    referrerHost: referrerHost(input.referrer),
    utmSource: utmSourceOf(input.utmSource),
    country: countryOf(input.country),
    device: deviceOf(input.userAgent),
    ipHash,
    visitorHash,
    userAgent: input.userAgent.slice(0, 500),
    javascriptExecuted: input.javascriptExecuted,
  };
}

export default endpoint({ methods: ['POST'] }, async (req, res) => {
  const data = parseInput(trackSchema, parseJsonBody(req));
  const userAgent = headerValue(req.headers['user-agent']) ?? '';
  const hitId = data.hitId ?? randomUUID();

  await recordTrafficHit(
    trafficHitInput({
      hitId,
      path: data.path,
      referrer: data.referrer,
      utmSource: data.utmSource,
      ip: clientIp(req),
      userAgent,
      country: headerValue(req.headers['x-vercel-ip-country']),
      javascriptExecuted: true,
    }),
  );
  res.status(204).end();
});
