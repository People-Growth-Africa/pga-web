import { StaticRouter } from 'react-router';
import SiteShell from './SiteShell';

/**
 * The app, rendered at a URL by the build. Never shipped to the browser.
 *
 * scripts/prerender.mjs builds this file with Vite's SSR mode and renders it
 * once per public route. It is the same SiteShell the browser hydrates, so the
 * shipped HTML is the app rather than a hand-written approximation of it.
 *
 * The metadata for each route lives in src/lib/pageMeta.ts, which is built as
 * its own entry (see vite.ssr.config.ts) and imported by the same script.
 */
export default function PrerenderApp({ url }: { url: string }) {
  return (
    <StaticRouter location={url}>
      <SiteShell />
    </StaticRouter>
  );
}
