import type { VercelRequest, VercelResponse } from '@vercel/node';

import { findPublishedPostBySlug, type PostType } from '../db.js';
import {
  renderFallbackArticle,
  renderGoneHead,
  renderMissingHead,
  renderPostHead,
  type PagePost,
} from '../post-page.js';
import { isRemovedContent } from '../removed-content.js';
import { POSTS_CACHE_SECONDS } from './posts.js';
import { readShell, sendHtml, withContent, withHead } from '../shell.js';

/**
 * GET /blog/<slug> and /events/<slug>, for slugs the build did not prerender.
 *
 * The site is a single-page app, so a route that was not written at build time
 * is answered by `spa-fallback.html` - a document with an empty `#root` and the
 * home page's head. That is fine for a dashboard and wrong for an article: a
 * crawler would see a page whose title says something else entirely, and no
 * article at all. This handler sends the same shell with that post's title,
 * description, canonical, Open Graph, Twitter and JSON-LD in the head, and the
 * article itself - heading, date or schedule, and the full body - in a readable
 * block in front of the app container.
 *
 * It only ever sees slugs that no static file matched. Vercel checks the
 * filesystem before rewrites, so every built-in post and event keeps being
 * served as its prerendered HTML and never reaches this code. That also means
 * this page is not hydrated: `src/main.tsx` removes the readable block before it
 * mounts, and the app renders its own copy from /api/posts.
 *
 * The body is plain text with the editor's tiny markup subset, rendered here by
 * `renderBodyHtml` and never parsed as HTML, so a post cannot smuggle a script
 * into a response.
 */

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

  const notFound = () => {
    sendHtml(res, 404, withHead(shell, renderMissingHead()));
  };

  if (!type || !slug) {
    notFound();
    return;
  }

  const row = await findPublishedPostBySlug(slug);
  // A slug only belongs on its own route: /blog/<an-event> is a 404, not a
  // duplicate of the event page under a URL that claims it is an article.
  if (!row || row.type !== type) {
    // A page that was withdrawn on purpose answers 410, not 404: the URL is not
    // waiting for anything, and the crawler can drop it. Checked after the
    // database so a slug that is published again renders its real page, never
    // this answer.
    if (isRemovedContent(type, slug)) {
      sendHtml(res, 410, withHead(shell, renderGoneHead()));
      return;
    }
    notFound();
    return;
  }

  const post: PagePost = {
    type: row.type,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category_name,
    coverImageUrl: row.cover_image_url,
    eventStart: row.event_start,
    eventEnd: row.event_end,
    locationText: row.location_text,
    isOnline: row.is_online,
    registrationUrl: row.registration_url ?? null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };

  const html = withContent(withHead(shell, renderPostHead(post)), renderFallbackArticle(post));

  sendHtml(res, 200, html, POSTS_CACHE_SECONDS);
}
