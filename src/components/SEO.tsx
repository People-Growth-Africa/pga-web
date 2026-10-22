import { useEffect } from 'react';
import {
  DEFAULT_IMAGE,
  ORG_ID,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  buildBreadcrumbSchema,
  buildPageSchema,
  buildTitle,
  canonicalUrl,
  type PageMeta,
} from '../lib/pageMeta';

export { ORG_ID, SITE_URL };

/**
 * The facts an article node can carry, for pages that predate `PageMeta`.
 * Blog posts, events and the four public pages now pass `meta` instead, which is
 * built from the same module the prerenderer reads.
 */
interface ArticleDetails {
  /** `YYYY-MM-DD` */
  publishedAt?: string;
  author?: string;
  section?: string;
}

/** ISO 8601 instants, including Lagos' +01:00 offset. */
interface EventDetails {
  startDate: string;
  endDate?: string;
  location?: string;
}

interface SEOProps {
  /** The shared description of this page. Takes precedence over the props below. */
  meta?: PageMeta;
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  article?: ArticleDetails;
  event?: EventDetails;
}

/** Build the same shape from the older prop style, for the client-only pages. */
function buildMetaFromLegacy({
  title = SITE_NAME,
  description = '',
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  article,
  event,
}: Omit<SEOProps, 'meta'>): PageMeta {
  const path = url && /^https?:\/\//.test(url) ? url.replace(SITE_URL, '') || '/' : url;
  const currentPath =
    path ?? (window.location.pathname.length > 1 ? window.location.pathname.replace(/\/+$/, '') : '/');

  // The older pages describe an article with a publish date only. There is no
  // separate "last changed" fact for them, so the publish date stands in: a
  // dateModified that silently claims an edit never made is worse than none.
  const articleMeta =
    type === 'article' || article?.publishedAt
      ? {
          publishedAt: article?.publishedAt ?? '',
          modifiedAt: article?.publishedAt ?? '',
          // An older page that names its own author keeps a Person node; one
          // that does not is the organisation itself, as on the blog.
          author: article?.author
            ? { '@type': 'Person' as const, name: article.author }
            : { '@type': 'Organization' as const, name: SITE_NAME, '@id': ORG_ID },
          section: article?.section,
        }
      : undefined;

  return {
    path: currentPath,
    title: buildTitle(title),
    description,
    image,
    type,
    ...(articleMeta ? { article: articleMeta } : {}),
    ...(event ? { event } : {}),
  };
}

/** Write one page's metadata into the document. */
function applyPageMeta(page: PageMeta) {
  document.title = page.title;

  const setMetaTag = (attrName: string, attrVal: string, content: string) => {
    let element = document.querySelector(`meta[${attrName}="${attrVal}"]`) as HTMLMetaElement | null;
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attrName, attrVal);
      document.head.appendChild(element);
    }
    element.content = content;
  };

  const url = canonicalUrl(page.path);
  const image = absoluteUrl(page.image);

  setMetaTag('name', 'description', page.description);
  setMetaTag('property', 'og:title', page.title);
  setMetaTag('property', 'og:description', page.description);
  setMetaTag('property', 'og:type', page.type);
  setMetaTag('property', 'og:site_name', SITE_NAME);
  setMetaTag('property', 'og:url', url);
  setMetaTag('property', 'og:image', image);
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', page.title);
  setMetaTag('name', 'twitter:description', page.description);
  setMetaTag('name', 'twitter:image', image);

  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  // Page-level structured data only. The Organization entity ("#organization")
  // is declared once, statically, in index.html; every node here points at it by
  // @id instead of declaring a second, competing Organization.
  const writeSchema = (id: string, value: Record<string, unknown> | null) => {
    let node = document.querySelector<HTMLScriptElement>(`script#${id}`);
    if (!value) {
      node?.remove();
      return;
    }
    if (!node) {
      node = document.createElement('script');
      node.type = 'application/ld+json';
      node.id = id;
      document.head.appendChild(node);
    }
    node.textContent = JSON.stringify(value);
  };

  writeSchema('page-schema', buildPageSchema(page));
  writeSchema('breadcrumb-schema', buildBreadcrumbSchema(page));
}

/**
 * The `<head>` of the page now on screen.
 *
 * The build writes the same values into the HTML it ships (see
 * src/lib/pageMeta.ts and scripts/prerender.mjs), so for a public page this
 * effect is a confirmation rather than a change. It still has to run: a visitor
 * moving between routes inside the app never reloads, and those pages need their
 * own title, canonical and structured data.
 */
export default function SEO({ meta, ...legacy }: SEOProps) {
  const publishedAt = legacy.article?.publishedAt;
  const authorName = legacy.article?.author;
  const section = legacy.article?.section;
  const eventStart = legacy.event?.startDate;
  const eventEnd = legacy.event?.endDate;
  const eventLocation = legacy.event?.location;

  useEffect(() => {
    applyPageMeta(meta ?? buildMetaFromLegacy(legacy));
    // The legacy props are pulled apart into primitives so the effect depends on
    // the values rather than on a new object literal on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    meta,
    legacy.title,
    legacy.description,
    legacy.image,
    legacy.url,
    legacy.type,
    publishedAt,
    authorName,
    section,
    eventStart,
    eventEnd,
    eventLocation,
  ]);

  return null;
}
