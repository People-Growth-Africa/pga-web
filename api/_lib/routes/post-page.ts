import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { findPublishedPostBySlug, type PostType } from '../db.js';
import { renderMissingHead, renderPostHead, type PagePost } from '../post-page.js';
import { POSTS_CACHE_SECONDS } from './posts.js';

/**
 * GET /blog/<slug> and /events/<slug>, for slugs the build did not prerender.
 *
 * The site is a single-page app, so a route that was not written at build time
 * is answered by `spa-fallback.html` - a document with an empty `#root` and the
 * home page's head. That is fine for a dashboard and wrong for an article: a
 * crawler would see a page whose title says something else entirely. This
 * handler sends the same shell with that post's title, description, canonical,
 * Open Graph, Twitter and JSON-LD already in it, and answers 404 for a slug that
 * is not published.
 *
 * It only ever sees slugs that no static file matched. Vercel checks the
 * filesystem before rewrites, so every built-in post and event keeps being
 * served as its prerendered HTML and never reaches this code.
 *
 * The body is still rendered by the browser, from /api/posts. This adds the head
 * and the status code; it deliberately does not attempt to render the article,
 * because two renderers would eventually disagree.
 */

/** Vercel checks nothing about a rewrite source being a file; this is why. */
const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;

/** Where the build leaves the shell, and what to look for if it is not there. */
const SHELL_CANDIDATES = ['dist/spa-fallback.html', 'dist/index.html'];

let shellCache: string | null = null;

/**
 * The SPA shell, read once per instance.
 *
 * `vercel.json` bundles dist/spa-fallback.html into this function
 * (`functions.includeFiles`), because Vercel serves static output from the CDN
 * and it is not otherwise on the function's filesystem. Locally the API server
 * serves dist itself, so the same read works there.
 */
async function readShell(): Promise<string> {
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

function sendHtml(res: VercelResponse, status: number, html: string, seconds?: number): void {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Cache-Control',
    seconds ? `public, max-age=0, s-maxage=${seconds}` : 'no-store, max-age=0',
  );
  res.send(html);
}

function asType(value: unknown): PostType | null {
  return value === 'blog' || value === 'event' ? value : null;
}

function asSlug(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 120) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}

export default async function postPage(req: VercelRequest, res: VercelResponse): Promise<void> {
  const type = asType(req.query.type);
  const slug = asSlug(req.query.slug);

  const shell = await readShell();

  if (!type || !slug) {
    sendHtml(res, 404, shell.replace(SEO_BLOCK, `<!--seo:start-->\n    ${renderMissingHead()}\n    <!--seo:end-->`));
    return;
  }

  const row = await findPublishedPostBySlug(slug);
  // A slug only belongs on its own route: /blog/<an-event> is a 404, not a
  // duplicate of the event page under a URL that claims it is an article.
  if (!row || row.type !== type) {
    sendHtml(res, 404, shell.replace(SEO_BLOCK, `<!--seo:start-->\n    ${renderMissingHead()}\n    <!--seo:end-->`));
    return;
  }

  const post: PagePost = {
    type: row.type,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category_name,
    coverImageUrl: row.cover_image_url,
    eventStart: row.event_start,
    eventEnd: row.event_end,
    locationText: row.location_text,
    isOnline: row.is_online,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };

  const html = shell.replace(
    SEO_BLOCK,
    `<!--seo:start-->\n    ${renderPostHead(post)}\n    <!--seo:end-->`,
  );

  sendHtml(res, 200, html, POSTS_CACHE_SECONDS);
}
