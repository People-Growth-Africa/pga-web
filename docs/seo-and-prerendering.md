# How public pages become HTML

The site is still a Vite + React SPA, but every public page now ships real HTML
from the build. `/`, `/blog`, `/events`, `/consultation`, every blog post and
every event page are rendered in Node and written into `dist`; the browser
hydrates that markup instead of painting it from an empty shell.

## The pieces

| Piece | What it does |
| --- | --- |
| [`src/lib/pageMeta.ts`](../src/lib/pageMeta.ts) | One source of truth for a page's title, description, canonical, share tags and JSON-LD. Also lists the pages to prerender and the private client-only routes. |
| [`src/SiteShell.tsx`](../src/SiteShell.tsx) | The routes, providers and layout, with no router of its own. The browser mounts it inside `BrowserRouter`; the build mounts it inside `StaticRouter`. |
| [`src/entry-server.tsx`](../src/entry-server.tsx) | That tree at a URL, as a component for the build to render. Never shipped. |
| [`vite.ssr.config.ts`](../vite.ssr.config.ts) | Builds `dist-ssr/server.js` and `dist-ssr/meta.js`. |
| [`scripts/prerender.mjs`](../scripts/prerender.mjs) | Renders each page into `dist`, writes the private shells and `spa-fallback.html`, and writes `dist/sitemap.xml`. |
| [`scripts/generate-static-files.mjs`](../scripts/generate-static-files.mjs) | Writes `robots.txt`, `llms.txt` and `llms-full.txt` before the build. |

`npm run build` runs them in order: static text files → typecheck → client build
→ SSR build → prerender.

## Adding a page

A route is only prerendered if it is listed in `prerenderPages()`. Add a
`PageMeta` for it there (or in `STATIC_PAGES`), and it is written to
`dist/<path>/index.html` and listed in the sitemap automatically. A route left
out still works, but it is served the empty shell at `/spa-fallback.html`, so it
is invisible to a crawler that does not run JavaScript.

Private routes (accounts, dashboards, password and subscription flows) are
listed in `PRIVATE_ROUTES`: they get a shell with `<meta name="robots" content="noindex">`
and an `X-Robots-Tag: noindex` header in `vercel.json`. They are deliberately not
disallowed in `robots.txt` — a blocked crawler cannot read a noindex.

## Head tags and hydration

`index.html` contains an empty `<!--seo:start-->…<!--seo:end-->` block with
neutral defaults. The prerender replaces it with the page's own tags. The
`SEO` component applies the same values from the same module when you navigate
inside the app, so the two never disagree.

The build marks its HTML with `data-prerendered` on `<html>`. `src/lib/firstPaint.ts`
reads it so entrance animations start in their finished state on that first
paint: the content is already visible and must not be faded in from `opacity: 0`.

## Verifying

```bash
npm run build
npm run test:seo   # 988 checks over dist: head tags, JSON-LD, sitemap, shells, vercel.json
```

`test:seo` reads the built files, not the source, so a page that stops being
prerendered fails there even if it still renders in a browser.
