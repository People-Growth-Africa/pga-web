import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { VercelResponse } from '@vercel/node';

/**
 * The built page every request-time renderer starts from.
 *
 * `/blog`, `/events`, `/blog/<slug>` and `/events/<slug>` have no file at build
 * time for anything published after it, so the platform rewrites them to the
 * function, which fills their place. All four do the same three things: take
 * `dist/spa-fallback.html`, replace the marked head block, put crawler-readable
 * content in front of the (still empty) app container, and send it. Keeping
 * that in one module is what stops the four from drifting into four different
 * documents.
 */

/** The window the build leaves for page-specific tags. */
export const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;

/** The container the browser app mounts into. */
export const ROOT_DIV = '<div id="root"></div>';

/** Where the build leaves the shell, and what to look for if it is not there. */
const SHELL_CANDIDATES = ['dist/spa-fallback.html', 'dist/index.html'];

let shellCache: string | null = null;

/**
 * The SPA shell, read once per instance.
 *
 * `vercel.json` bundles dist/spa-fallback.html into the function
 * (`functions.includeFiles`), because Vercel serves static output from the CDN
 * and it is not otherwise on the function's filesystem. Locally the API server
 * serves dist itself, so the same read works there.
 */
export async function readShell(): Promise<string> {
  if (shellCache !== null) return shellCache;

  for (const candidate of SHELL_CANDIDATES) {
    try {
      const html = await readFile(path.join(process.cwd(), candidate), 'utf8');
      if (SEO_BLOCK.test(html)) {
        shellCache = html;
        return html;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    'The SPA shell could not be read. Build the site first, and make sure vercel.json includes dist/spa-fallback.html in the function bundle.',
  );
}

/** The shell with one page's head tags in place of the fallback ones. */
export function withHead(shell: string, head: string): string {
  return shell.replace(SEO_BLOCK, `<!--seo:start-->\n    ${head}\n    <!--seo:end-->`);
}

/**
 * The shell with readable content in front of the app.
 *
 * The content sits outside `#root` on purpose. The page it describes is not one
 * the build rendered, so the browser app has no matching markup to hydrate; a
 * crawler only needs the text in the response. `src/main.tsx` removes this
 * element before it mounts, which leaves the app the empty container it
 * expects and keeps the readable copy from sitting in the live DOM.
 */
export function withContent(shell: string, content: string): string {
  if (!shell.includes(ROOT_DIV)) {
    throw new Error(`The SPA shell has no ${ROOT_DIV} to put content in front of.`);
  }
  return shell.replace(ROOT_DIV, `${content}\n    ${ROOT_DIV}`);
}

export function sendHtml(
  res: VercelResponse,
  status: number,
  html: string,
  seconds?: number,
): void {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Cache-Control',
    seconds ? `public, max-age=0, s-maxage=${seconds}` : 'no-store, max-age=0',
  );
  res.send(html);
}
