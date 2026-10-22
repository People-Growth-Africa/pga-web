import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { DATABASE_CONFIGURED } from '../db-gate.js';
import {
  renderIndexHead,
  renderIndexList,
  type IndexRow,
  type IndexType,
} from '../index-page.js';
import { readShell, sendHtml, withContent, withHead } from '../shell.js';
import { POSTS_CACHE_SECONDS } from './posts.js';

/**
 * GET /blog and GET /events, from the rewrite in vercel.json.
 *
 * The list is built-in records plus published rows. The built-in half comes from
 * dist/seo-index.json, written by scripts/prerender.mjs from src/data on every
 * build: the two compile units cannot import each other, so the build hands the
 * function a list instead of the function keeping a second copy of it.
 *
 * Drafts cannot appear for the same reason they cannot appear anywhere public:
 * `listPublishedPosts` filters on status in SQL, and it is the only query used.
 *
 * The page still works with no database configured - it lists the built-in
 * records and nothing else - so the handler is not behind the database gate.
 */

const INDEX_FILE = 'dist/seo-index.json';

let builtInCache: IndexRow[] | null = null;

/** The built-in rows the build recorded, or none if the file is missing. */
async function readBuiltIns(): Promise<IndexRow[]> {
  if (builtInCache !== null) return builtInCache;

  try {
    const raw = await readFile(path.join(process.cwd(), INDEX_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const entries =
      typeof parsed === 'object' && parsed !== null && 'entries' in parsed
        ? (parsed as { entries?: unknown }).entries
        : null;

    builtInCache = Array.isArray(entries)
      ? entries.filter((entry): entry is IndexRow => {
          if (typeof entry !== 'object' || entry === null) return false;
          const row = entry as Record<string, unknown>;
          return (
            (row.type === 'blog' || row.type === 'event') &&
            typeof row.slug === 'string' &&
            typeof row.title === 'string'
          );
        })
      : [];
  } catch {
    // A missing or malformed file must not take the section down: the published
    // rows are still served, and the build's own test catches the malformed case.
    builtInCache = [];
  }

  return builtInCache;
}

function asType(value: unknown): IndexType | null {
  return value === 'blog' || value === 'event' ? value : null;
}

export default async function indexPage(req: VercelRequest, res: VercelResponse): Promise<void> {
  const type = asType(req.query.type);
  const shell = await readShell();

  if (!type) {
    sendHtml(
      res,
      404,
      withHead(
        shell,
        '<title>Page not found | People Growth Africa</title>\n    <meta name="robots" content="noindex, nofollow" />',
      ),
    );
    return;
  }

  const builtIn = await readBuiltIns();

  let published: IndexRow[] = [];
  if (DATABASE_CONFIGURED) {
    const { listPublishedPosts } = await import('../db.js');
    const rows = await listPublishedPosts(type);
    published = rows.map((row) => ({
      type: row.type === 'event' ? 'event' : 'blog',
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      date: row.type === 'event' ? row.event_start : (row.published_at?.slice(0, 10) ?? null),
      ...(row.category_name ? { category: row.category_name } : {}),
    }));
  }

  // A built-in post always has its own prerendered page, which wins over the
  // route rewrite. If a row shares its slug it can never be served, so listing
  // it twice would only advertise a duplicate.
  const seen = new Set(builtIn.map((row) => `${row.type}:${row.slug}`));
  const rows = [
    ...builtIn.filter((row) => row.type === type),
    ...published.filter((row) => !seen.has(`${row.type}:${row.slug}`)),
  ];

  const html = withContent(withHead(shell, renderIndexHead(type)), renderIndexList(type, rows));

  sendHtml(res, 200, html, POSTS_CACHE_SECONDS);
}
