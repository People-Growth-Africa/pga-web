# Client JavaScript and main-thread optimization

## Goal

Reduce browser startup work on the public site without changing routes, page
content, metadata, or the prerendering pipeline. Validate the result against the
production-site baseline using three isolated Lighthouse mobile and desktop runs
on the local production preview.

## Design

First use `rollup-plugin-visualizer` to identify the current client bundle's
largest contributors and report the top ten before changing application code.
Keep the visualizer available only through an opt-in build flag; it must not
alter the normal build output.

Keep the Home route eager. Split other client route modules with `React.lazy`
and a `Suspense` boundary whose fallback preserves the existing site shell and
reserves page space. Keep the server-rendered route components eager so
`renderToString` continues to write complete route markup. The browser and SSR
trees must retain compatible boundary structure so hydration reuses that markup
rather than replacing it with a loading state.

Use the visualizer evidence to define manual vendor chunks for React/router and
large third-party libraries. Lazy-load interaction-only modules only when the
call sites prove they are not needed during initial rendering. Defer analytics
after page load or first interaction without changing analytics behavior, and
leave service-worker registration and offline behavior intact. Existing
`/assets/` network-first caching and the registration URL's bundle-hash version
must work with the generated chunk names.

## Verification

After each major implementation stage, run the production build and
`npm run test:seo`; keep `npm run lint` at or below the existing 13 warnings.
Confirm prerendered pages still contain their content and SEO checks still
pass. Run Lighthouse on the local production preview with cache disabled and the
service worker unregistered/bypassed, three times per profile, and report
medians for category scores, FCP, LCP, TBT, CLS, unused JavaScript, and long
tasks. Report raw and gzip chunk sizes, changed files, remaining main-thread
work, and service-worker/prerender risks.

## Constraints

- No URL, route, metadata, structured data, visual design, or feature changes.
- Keep Home eager and preserve server-side prerender content.
- Do not rewrite or remove prerendering.
- Do not commit any changes.
