# Client Main-Thread Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce initial JavaScript work on the public site and verify improvements with isolated three-run Lighthouse medians.

**Architecture:** Use a temporary/opt-in bundle visualization to establish evidence before edits. Keep Home and all SSR route rendering eager, but let the browser dynamically load non-home route components inside hydration-compatible Suspense boundaries. Split only measured vendor groups, defer non-critical analytics without changing routing or tracking behavior, and preserve the existing network-first service-worker handling of hashed assets.

**Tech Stack:** React 19, React Router 7, Vite 8/Rolldown, TypeScript, `rollup-plugin-visualizer`, Lighthouse CLI, Chrome.

## Global Constraints

- No URL, route, metadata, structured data, visual design, or feature changes.
- Keep Home eager and preserve server-side prerender content.
- Do not rewrite or remove prerendering.
- Do not commit any changes.
- All 146 SEO checks must still pass.
- Lint warnings must not increase beyond 13.
- Run Lighthouse on local production preview only, with the service worker bypassed/unregistered and browser cache disabled; run each profile three times and report medians.

---

### Task 1: Capture the bundle composition baseline

**Files:**
- Modify: `package.json` and `package-lock.json` (add visualizer as a development-only dependency).
- Modify: `vite.config.ts` (enable visualizer only when `ANALYZE=1`).

**Interfaces:**
- Produces an opt-in `stats.json` raw module report for the normal client build.
- Does not add the analyzer plugin to SSR or default builds.

- [ ] Install the analyzer as a dev dependency: `npm install --save-dev rollup-plugin-visualizer`.
- [ ] Configure the client Vite build to include `visualizer({ filename: 'dist/stats.json', open: false, gzipSize: true, brotliSize: true })` only when `process.env.ANALYZE === '1'`.
- [ ] Build and verify SEO before touching route imports:

  ```powershell
  $env:ANALYZE = '1'
  npm run build
  npm run test:seo
  Remove-Item Env:ANALYZE
  ```

  Expected: build succeeds; `npm run test:seo` reports all 146 checks passed; `dist/stats.json` exists.
- [ ] Read the raw module report and report the ten largest client bundle modules/packages with rendered and compressed size. These module sizes are measured before final chunk minification and are not additive. Save no report into source control.
- [ ] Run `npm run lint`; record warning count and confirm it is no more than 13.

### Task 2: Split browser routes while preserving SSR and hydration

**Files:**
- Modify: `src/SiteShell.tsx`.
- Modify: `src/App.tsx` to provide browser-side lazy route components.
- Modify: `src/entry-server.tsx` to provide eager server-side route components.
- Create: `src/routeComponents.ts` for the shared, type-only route component map.
- Inspect, do not modify unless evidence requires it: `scripts/prerender.mjs`, `src/lib/firstPaint.ts`, `src/components/Layout.tsx`, `src/components/PageTransition.tsx`.

**Interfaces:**
- SSR imports eager route components only in `entry-server.tsx`, outside the browser entry graph.
- The browser uses `React.lazy` for Events, event detail, blog list, blog post, consultation, auth/signup, verification, newsletter confirmation, password reset, talent/employer dashboard, and admin route components.
- Home remains eager.
- A `Suspense` boundary wraps route rendering in both builds; its fallback retains `Layout` and reserves the main content area while a client chunk loads.

- [ ] Keep existing eager imports for the SSR branch and create default-export lazy imports for browser-only route components. Select the eager/lazy component at build time with `import.meta.env.SSR`; do not change route paths, guards, or route element conditions.
- [ ] Place a shared `Suspense` boundary around `Routes` inside `PageTransition` in the same tree for SSR and browser. The fallback must preserve the existing site `Layout` and have a reserved main region so loading a client-only route does not shift the header or footer.
- [ ] Build and run `npm run test:seo`. Expected: all 146 checks pass, and `dist/index.html` plus the consultation prerender still contain rendered page content rather than the fallback.
- [ ] Run `npm run lint`. Expected: no more than 13 warnings.
- [ ] Rebuild with the visualizer flag and confirm Home’s entry graph does not include unrelated route/admin page modules. Confirm each lazy route has a generated hashed chunk.

### Task 3: Split measured vendor code

**Files:**
- Modify: `vite.config.ts`.
- Inspect: the Task 1 visualization and Task 2 chunk graph.

**Interfaces:**
- Build output uses separate, content-hashed chunks for React/React DOM, router, and only the heavy libraries identified in the visualization.
- Do not create a vendor chunk for a library unless the visualizer shows it is a significant shared or initial-load contributor.

- [ ] Use the supported Vite 8 `build.rolldownOptions.output.codeSplitting` configuration to group React/React DOM, React Router, and measured heavy dependencies into separate cacheable chunks. Do not mix application routes into these groups.
- [ ] Build and run `npm run test:seo`; expected: all 146 checks pass and no asset/import resolution errors occur in prerender or client output.
- [ ] Run `npm run lint`; expected: no more than 13 warnings.
- [ ] Compare the generated client chunk sizes with Task 1; confirm every chunk is under 500 KB raw and record raw/gzip sizes.

### Task 4: Defer analytics without losing page tracking

**Files:**
- Modify: `src/App.tsx`.
- Inspect: `index.html` service-worker registration and `public/sw.js`; do not change them unless tests show a regression.

**Interfaces:**
- Analytics mounts after the initial page load/idle window, then remains mounted to observe subsequent SPA navigation.
- Existing service-worker registration, version query, precache, and fetch strategy stay unchanged.

- [ ] Move analytics mounting behind a small load/idle gate in `App.tsx`; clean up pending event listeners/timers if the component unmounts. Do not defer the React app entry or service-worker registration.
- [ ] Build and run `npm run test:seo`; expected: all 146 checks pass.
- [ ] Run `npm run lint`; expected: no more than 13 warnings.
- [ ] In browser validation, confirm the home page and an SPA navigation still send analytics after the idle gate, and confirm the worker registers with the hashed bundle version and fetches every generated JS chunk.

### Task 5: Measure local production output and report

**Files:**
- No application files are expected to change in this task.
- Build output only: `dist/`.

**Interfaces:**
- Report before/after median mobile and desktop Lighthouse results, bundle sizes, and any remaining bottleneck.

- [ ] Run `npm run build` and `npm run test:seo`; expected: build passes and all 146 checks pass.
- [ ] Start `npm run preview -- --host 127.0.0.1`.
- [ ] Run Chrome Lighthouse against `http://127.0.0.1:4173/` with the same Chrome executable and flags as the baseline. For every run, disable browser cache and bypass/unregister the service worker. Capture three independent mobile runs and three independent desktop runs.
- [ ] Compute medians for performance score, FCP, LCP, TBT, CLS, unused JavaScript, and long-task count. Report raw and gzip size for every client JS chunk.
- [ ] Compare results to baseline: mobile TBT < 300 ms, mobile FCP < 1.8 s, and performance > 85 on both profiles are the targets. If a target is missed, use the audit evidence to identify remaining main-thread work rather than making visual or feature changes.
- [ ] Run `git status --short` and confirm no generated audit reports, temporary bundles, or unrelated files are included; do not commit.

## Plan self-review

- Spec coverage: visualization/top-ten baseline (Task 1); route splitting and SSR-safe hydration (Task 2); vendor splitting (Task 3); analytics and service worker (Task 4); build, SEO, lint, isolated three-run Lighthouse measurements and final report (Task 5).
- Placeholder scan: no TODO/TBD or unspecified implementation tasks.
- Type consistency: route components remain default-export components matching existing route imports; server selection is the eager component, browser selection is a React lazy component; no new public route interfaces are introduced.
