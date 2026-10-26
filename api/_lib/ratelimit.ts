import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { ApiError } from './http.js';
import { counterKey } from './security.js';
import { recordAuthEvent } from './audit.js';

/**
 * Rate limiting for credential endpoints. Upstash is used when it is configured
 * (shared across every serverless instance); otherwise a per instance counter
 * still slows down a single attacker, and the log says so.
 */

const limiters = new Map<string, Ratelimit>();
let redis: Redis | null = null;
let warnedAboutFallback = false;

function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis ??= new Redis({ url, token });
  return redis;
}

function upstashLimiter(name: string, limit: number, windowSeconds: number): Ratelimit | null {
  const client = redisClient();
  if (!client) return null;
  const cacheKey = `${name}:${limit}:${windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      prefix: `pga:${name}`,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

type Counter = { count: number; resetAt: number };
const memoryCounters = new Map<string, Counter>();

function memoryAllow(
  key: string,
  limit: number,
  windowSeconds: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (memoryCounters.size > 5000) {
    for (const [existingKey, counter] of memoryCounters) {
      if (counter.resetAt <= now) memoryCounters.delete(existingKey);
    }
  }
  const counter = memoryCounters.get(key);
  if (!counter || counter.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: windowSeconds };
  }
  counter.count += 1;
  return {
    allowed: counter.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((counter.resetAt - now) / 1000)),
  };
}

export type RateLimitCheck = {
  /** Namespaces the counter, for example "login-ip". */
  name: string;
  /** What is being counted: an IP address, an email address or a token hash. */
  identifier: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Counts this attempt and throws a 429 carrying Retry-After when the budget for
 * `identifier` is spent. Callers must pass something they derived server side,
 * never a value the client chose.
 */
export async function enforceRateLimit(options: RateLimitCheck): Promise<void> {
  const { name, limit, windowSeconds } = options;
  // The limiter only needs something stable to count, so an email address or IP
  // is pseudonymised here and never stored raw in Redis or in memory.
  const identifier = counterKey(options.identifier);
  const limiter = upstashLimiter(name, limit, windowSeconds);

  let allowed: boolean;
  let retryAfterSeconds = windowSeconds;

  if (limiter) {
    try {
      const result = await limiter.limit(identifier);
      allowed = result.success;
      retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    } catch {
      // Credential endpoints fail closed. A limiter outage must not turn into an
      // unlimited password guessing window.
      console.error('[auth] rate limiter unavailable; refusing credential request');
      throw new ApiError(
        503,
        'rate_limit_unavailable',
        'Sign-in and password changes are paused for a moment. Try again shortly.',
      );
    }
  } else {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        process.env.VERCEL_ENV === 'production'
          ? '[auth] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set in production; rate limits are per instance and will not stop a distributed attack.'
          : '[auth] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set, so rate limits are counted per serverless instance rather than globally.',
      );
    }
    const decision = memoryAllow(`${name}:${identifier}`, limit, windowSeconds);
    allowed = decision.allowed;
    retryAfterSeconds = decision.retryAfterSeconds;
  }

  if (!allowed) {
    // A refused attempt is worth a row of its own: it is the earliest sign of
    // someone hammering the endpoints. For the per IP buckets the counter key
    // is derived exactly like an audit IP hash, so these rows line up with the
    // login_failed rows from the same source. Everything else is stored
    // without an address, because the key is a pseudonym for an email, a token
    // or a user id rather than an IP.
    await recordAuthEvent(`rate_limited:${name}`, {
      ipHash: name.endsWith('-ip') ? identifier : null,
    });

    const error = new ApiError(
      429,
      'rate_limited',
      'Too many attempts from here. Wait a moment and try again.',
    );
    // Tells a client that backs off automatically exactly how long to wait.
    error.headers = { 'Retry-After': String(Math.min(retryAfterSeconds, 3600)) };
    throw error;
  }
}
