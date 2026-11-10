import { next } from '@vercel/functions';

type RequestContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

const SCANNER_PATH =
  /(^|\/)(wp-admin|wp-login\.php|xmlrpc\.php|\.env|\.git|phpmyadmin|administrator)(\/|$)|^\/admin(?:\.php)?\/?$|^\/admin\/(?:login\.php|wp-admin|phpmyadmin)/i;
const PRIVATE_PATH =
  /^\/(?:admin|content|api|auth|forgot-password|talent|employer)(?:\/|$)/i;
const STATIC_ASSET_PATH =
  /(?:^|\/)[^/]+\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|otf|pdf|png|svg|txt|webm|webp|woff2?|xml)$/i;

function isStaffSession(request: Request): boolean {
  const cookies = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)(?:__Host-pga-admin|pga_admin_session|__Host-pga-content|pga_content_session)=/.test(cookies);
}

function isTrackablePath(path: string): boolean {
  return !STATIC_ASSET_PATH.test(path) && (SCANNER_PATH.test(path) || !PRIVATE_PATH.test(path));
}

function captureHit(request: Request, hitId: string): Promise<void> {
  const url = new URL(request.url);
  const hit = {
    hitId,
    path: `${url.pathname}${url.search}`,
    referrer: request.headers.get('referer') ?? undefined,
    utmSource: url.searchParams.get('utm_source') ?? undefined,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    country: request.headers.get('x-vercel-ip-country') ?? undefined,
  };
  const secret =
    process.env.TRAFFIC_CAPTURE_SECRET ??
    process.env.TRAFFIC_HASH_SALT ??
    process.env.AUDIT_HASH_SECRET ??
    process.env.JWT_SECRET;
  if (!secret) return Promise.resolve();
  const canonical = [
    hit.hitId,
    hit.path,
    hit.referrer ?? '',
    hit.utmSource ?? '',
    hit.ip ?? '',
    hit.userAgent ?? '',
    hit.country ?? '',
  ].join('\n');
  const keyPromise = crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signaturePromise = keyPromise.then(async (key) => {
    const bytes = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)),
    );
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
  return signaturePromise.then((signature) => {
    const body = JSON.stringify({ ...hit, signature });
    return fetch(new URL('/api/traffic-hit', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  })
    .then((response) => {
      if (!response.ok) throw new Error(`capture returned ${response.status}`);
    })
    .catch(() => undefined);
}

export default function middleware(request: Request, context: RequestContext): Response {
  const url = new URL(request.url);
  const scanner = SCANNER_PATH.test(url.pathname);
  const isHtmlNavigation = /(text\/html|application\/xhtml\+xml)/i.test(
    request.headers.get('accept') ?? '',
  );
  if (
    request.method !== 'GET' ||
    !isTrackablePath(url.pathname) ||
    isStaffSession(request) ||
    (!scanner && !isHtmlNavigation)
  ) {
    return next();
  }

  const hitId = crypto.randomUUID();
  context.waitUntil(Promise.resolve().then(() => captureHit(request, hitId)).catch(() => undefined));
  const response = next();
  response.headers.append(
    'Set-Cookie',
    `pga_traffic_hit=${hitId}; Path=/; Max-Age=120; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`,
  );
  return response;
}

export const config = {
  matcher: ['/((?!api/).*)'],
};
