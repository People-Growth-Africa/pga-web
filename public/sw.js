// People Growth Africa service worker
//
// Caching strategy (production):
// - Navigations and hashed build assets (/assets/*) are NETWORK-FIRST, so a
//   deploy reaches returning visitors on their very next load. The cache is
//   only used as an offline fallback. Each public route now ships its own HTML
//   (scripts/prerender.mjs), and because that HTML is fetched network-first and
//   the cache name changes with every deploy, the worker can never hand a
//   visitor yesterday's page for a URL that has since been prerendered.
// - Other static files (images, fonts, icons, manifest) use
//   stale-while-revalidate: served instantly from cache, refreshed in the
//   background for the next visit.
// - The cache name is versioned with the deployed bundle hash (passed as the
//   `v` query on the registration URL in index.html), so every deploy starts
//   a fresh cache and old caches are removed on activate.
// In dev (registered without a version) the worker only provides the offline
// navigation fallback and leaves every other request untouched, so Vite HMR
// and module reloads are never served stale from cache.

const VERSION = new URLSearchParams(self.location.search).get('v') || 'dev';
const IS_DEV = VERSION === 'dev';
const CACHE_NAME = `pga-${VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/logo-black.png',
  '/images/logo-white.png',
];

// Files eligible for stale-while-revalidate. JS/CSS are deliberately excluded:
// in production they live under /assets/ (network-first), and excluding them
// keeps dev module URLs out of the cache.
const STATIC_FILE_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isCacheable(response) {
  return Boolean(response && response.status === 200 && response.type === 'basic');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin requests (analytics, etc.) untouched

  // Crawler files bypass the worker completely. A sitemap or robots.txt served
  // from a cache (or, worse, replaced by an HTML shell) is a wrong answer to a
  // machine that cannot tell it is looking at a stale copy, so these always go
  // to the network.
  if (url.pathname === '/sitemap.xml' || url.pathname === '/robots.txt') return;

  // Network-first: pages and Vite's hashed bundles, so a deploy is picked up
  // on the very next load even for returning visitors.
  const networkFirst = request.mode === 'navigate' || url.pathname.startsWith('/assets/');

  if (IS_DEV && !networkFirst) return; // dev: bypass the worker for everything else

  event.respondWith(
    (async () => {
      if (networkFirst) {
        try {
          const fresh = await fetch(request);
          if (isCacheable(fresh)) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('/index.html');
          return Response.error();
        }
      }

      // Stale-while-revalidate for the remaining static files.
      const cached = await caches.match(request);
      if (cached) {
        fetch(request)
          .then(async (fresh) => {
            if (isCacheable(fresh)) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, fresh.clone());
            }
          })
          .catch(() => {});
        return cached;
      }

      try {
        const fresh = await fetch(request);
        if (isCacheable(fresh) && STATIC_FILE_RE.test(url.pathname)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        return Response.error();
      }
    })()
  );
});
