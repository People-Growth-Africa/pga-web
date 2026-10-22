import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AnimateOnScroll from '../components/AnimateOnScroll';
import ContentImage from '../components/ContentImage';
import UpdateBody from '../components/UpdateBody';
import SEO from '../components/SEO';
import { updateMeta } from '../lib/pageMeta';
import {
  UPDATES_PATH,
  fetchUpdates,
  formatUpdateDate,
  updateCanonicalUrl,
  updatePath,
  type UpdatePost,
} from '../lib/updates';

/**
 * /updates/:slug - one published post.
 *
 * The post is found inside the same cached feed the list page reads, so a slug
 * that is not there is a slug that is not published. There is no separate
 * "fetch by slug" call that could answer for a draft: the only query behind the
 * feed filters on status in SQL, so a draft row has no path to a response at
 * all. This page shows its own 404 rather than the router's, because a visitor
 * following a link to something unpublished deserves the same treatment as one
 * following a link to something that never existed.
 *
 * The body is rendered by `SafeContent`, which turns a safe markdown subset
 * into React elements and never calls `dangerouslySetInnerHTML`. A post body is
 * text a person typed into a form, and it is treated exactly like that.
 */

export default function UpdateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<UpdatePost[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setPosts(await fetchUpdates(controller.signal));
    })();
    return () => controller.abort();
  }, []);

  const post = useMemo(
    () => (slug && posts ? (posts.find((candidate) => candidate.slug === slug) ?? null) : null),
    [slug, posts],
  );

  const more = useMemo(() => {
    if (!post) return [];
    return posts
      ?.filter((candidate) => candidate.slug !== post.slug && candidate.categorySlug === post.categorySlug)
      .slice(0, 3) ?? [];
  }, [post, posts]);

  // Still reading the feed: do not flash a 404 at someone on a slow connection.
  if (posts === null) return <LoadingArticle />;

  if (!post) return <NotFoundArticle slug={slug ?? ''} />;

  const published = formatUpdateDate(post.publishedAt);
  const canonical = updateCanonicalUrl(post.slug);

  return (
    <>
      <SEO meta={updateMeta(post)} />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative bg-deep-green pt-[140px] pb-[70px] overflow-hidden">
        {post.coverImageUrl && (
          <div className="absolute inset-0 z-0">
            <img
              src={post.coverImageUrl}
              alt=""
              className="w-full h-full object-cover opacity-20"
              loading="eager"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-deep-green/80 to-deep-green z-[1]" />
        <div className="relative z-[2] max-w-[800px] mx-auto px-6 text-center">
          <AnimateOnScroll>
            <Link
              to={UPDATES_PATH}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white font-[family-name:var(--font-body)] text-sm mb-6 transition-colors"
            >
              ← All updates
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
              <span className="inline-flex px-3.5 py-1.5 bg-brand-green/20 text-mint font-[family-name:var(--font-body)] text-[0.78rem] font-semibold rounded-full uppercase tracking-wider">
                {post.category}
              </span>
              {published && (
                <span className="font-[family-name:var(--font-body)] text-[0.85rem] text-white/60">
                  {published}
                </span>
              )}
            </div>
            <h1
              className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.15]"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}
            >
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="font-[family-name:var(--font-body)] text-white/70 leading-relaxed mt-5 max-w-[620px] mx-auto">
                {post.excerpt}
              </p>
            )}
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Body ─────────────────────────────────────── */}
      <section className="py-16 bg-white">
        <div className="max-w-[720px] mx-auto px-6">
          {post.coverImageUrl && (
            <AnimateOnScroll>
              <div className="rounded-[20px] overflow-hidden mb-10 aspect-[16/9] bg-mint">
                <ContentImage
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="w-full h-full"
                  eager
                />
              </div>
            </AnimateOnScroll>
          )}

          <AnimateOnScroll delay={0.1}>
            <article className="prose-custom">
              <UpdateBody body={post.body} />
            </article>
          </AnimateOnScroll>

          {/* The optional link is a button, not a link inside the body: it is a
              call to leave the page, so it should look like one. */}
          {post.linkUrl && (
            <AnimateOnScroll delay={0.15}>
              <div className="mt-10 pt-8 border-t border-charcoal/8">
                <a
                  href={post.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-deep-green text-white font-semibold rounded-full hover:bg-terracotta transition-colors"
                >
                  {post.linkLabel || 'Visit the link'}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <path d="M15 3h6v6M10 14 21 3" />
                  </svg>
                </a>
              </div>
            </AnimateOnScroll>
          )}

          {/* Share */}
          <AnimateOnScroll delay={0.2}>
            <div className="mt-10 pt-8 border-t border-charcoal/8">
              <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-4">
                Share this update
              </p>
              <div className="flex gap-3">
                <ShareButton
                  label="Share on LinkedIn"
                  href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(canonical)}&title=${encodeURIComponent(post.title)}`}
                >
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect x="2" y="9" width="4" height="12" />
                  <circle cx="4" cy="4" r="2" />
                </ShareButton>
                <ShareButton
                  label="Share on X"
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(canonical)}&text=${encodeURIComponent(post.title)}`}
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </ShareButton>
                <ShareButton
                  label="Share on Facebook"
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}`}
                >
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </ShareButton>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(canonical);
                  }}
                  className="w-10 h-10 rounded-full bg-mint flex items-center justify-center hover:bg-brand-green hover:text-white text-deep-green transition-colors cursor-pointer border-none"
                  aria-label="Copy link"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── More from this category ──────────────────── */}
      {more.length > 0 && (
        <section className="py-14 bg-cream">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateOnScroll className="mb-8">
              <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal">
                More {post.category.toLowerCase()}
              </h2>
            </AnimateOnScroll>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              {more.map((related, index) => (
                <AnimateOnScroll key={related.slug} delay={index * 0.1}>
                  <Link
                    to={updatePath(related.slug)}
                    className="block h-full bg-white rounded-[20px] overflow-hidden shadow-card hover:-translate-y-1.5 hover:shadow-elevated transition-all duration-300 group"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-mint">
                      <ContentImage
                        src={related.coverImageUrl}
                        alt={related.title}
                        className="w-full h-full transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-6">
                      <h3 className="font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold text-charcoal leading-snug mb-2 group-hover:text-deep-green transition-colors">
                        {related.title}
                      </h3>
                      {related.excerpt && (
                        <p className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/55 leading-relaxed line-clamp-2">
                          {related.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function ShareButton({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-10 h-10 rounded-full bg-mint flex items-center justify-center hover:bg-brand-green hover:text-white text-deep-green transition-colors"
      aria-label={label}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
    </a>
  );
}

function LoadingArticle() {
  return (
    <>
      <SEO title="Update | People Growth Africa" description="An update from People Growth Africa." />
      <section className="min-h-[60vh] bg-deep-green pb-[80px] pt-[160px]">
        <div className="mx-auto max-w-[800px] px-6" aria-busy="true">
          <p role="status" className="sr-only">
            Loading update…
          </p>
          <div className="mx-auto h-4 w-32 rounded-full bg-white/20" aria-hidden="true" />
          <div className="mx-auto mt-6 h-9 w-4/5 rounded-full bg-white/15" aria-hidden="true" />
        </div>
      </section>
    </>
  );
}

/**
 * A 404 for an unpublished or mistyped slug. Drafts land here by design: the
 * feed they would have been found in does not contain them, so this page cannot
 * tell a draft apart from a typo, and should not.
 */
function NotFoundArticle({ slug }: { slug: string }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  return (
    <>
      <SEO
        title="Update Not Found"
        description="This update could not be found. See the latest news, announcements and opportunities from People Growth Africa."
      />
      <section className="min-h-screen flex items-center justify-center bg-white pt-24">
        <div className="text-center px-6">
          <h1 className="font-[family-name:var(--font-heading)] text-6xl font-bold text-charcoal mb-4">
            404
          </h1>
          <p className="font-[family-name:var(--font-body)] text-xl text-charcoal/60 mb-8">
            This update could not be found.
          </p>
          <Link
            to={UPDATES_PATH}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-deep-green text-white font-semibold rounded-full hover:bg-terracotta transition-colors"
          >
            ← Back to Updates
          </Link>
        </div>
      </section>
    </>
  );
}
