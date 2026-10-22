import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import AnimateOnScroll from '../components/AnimateOnScroll';
import ContentImage from '../components/ContentImage';
import SEO from '../components/SEO';
import { staticPageMeta } from '../lib/pageMeta';
import { fetchUpdates, formatUpdateDate, updatePath, type UpdatePost } from '../lib/updates';

/**
 * /updates - everything the team has published, newest first.
 *
 * The list comes from /api/updates, so it is the same for every visitor and
 * turns over within the feed's cache window rather than waiting for a deploy.
 * Only published posts ever reach this page; a draft has no row in the response
 * to find, which is why there is no code here that could leak one.
 *
 * The category chips are generated from the posts actually on screen, not from
 * the full category list. A category with nothing published would render a chip
 * that leads to an empty grid, which is a dead end rather than a filter.
 */

/** The chip a visitor has picked. */
const ALL = 'all';

export default function UpdatesPage() {
  const [posts, setPosts] = useState<UpdatePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(ALL);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setPosts(await fetchUpdates(controller.signal));
      setLoading(false);
    })();
    return () => controller.abort();
  }, []);

  /** One chip per category that has at least one post, in the order they appear. */
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const post of posts) {
      if (!seen.has(post.categorySlug)) seen.set(post.categorySlug, post.category);
    }
    return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  }, [posts]);

  const visible = useMemo(
    () => (activeCategory === ALL ? posts : posts.filter((post) => post.categorySlug === activeCategory)),
    [posts, activeCategory],
  );

  return (
    <>
      <SEO meta={staticPageMeta('/updates')} />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative bg-deep-green pt-[140px] pb-[70px] overflow-hidden">
        <div className="absolute top-[-60px] right-[-60px] w-[260px] h-[260px] rounded-full bg-brand-green/10" />
        <div className="absolute bottom-[-40px] left-[-40px] w-[180px] h-[180px] rounded-full bg-terracotta/10" />
        <div className="relative z-[1] max-w-[800px] mx-auto px-6 text-center">
          <AnimateOnScroll>
            <span className="inline-flex px-4 py-1.5 bg-white/10 text-mint font-[family-name:var(--font-body)] text-[0.75rem] font-semibold rounded-full uppercase tracking-wider mb-5">
              From the team
            </span>
            <h1
              className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.15] mb-5"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}
            >
              Updates
            </h1>
            <p className="font-[family-name:var(--font-body)] text-white/75 leading-relaxed max-w-[560px] mx-auto">
              News, announcements, events, resources and opportunities from People Growth Africa -
              published here as it happens.
            </p>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Filter + grid ────────────────────────────── */}
      <section className="py-14 bg-cream/40">
        <div className="max-w-[1200px] mx-auto px-6">
          {categories.length > 1 && (
            <AnimateOnScroll className="mb-9">
              <div className="flex flex-wrap gap-2.5 justify-center">
                <FilterChip
                  label="All"
                  active={activeCategory === ALL}
                  onClick={() => setActiveCategory(ALL)}
                />
                {categories.map((category) => (
                  <FilterChip
                    key={category.slug}
                    label={category.name}
                    active={activeCategory === category.slug}
                    onClick={() => setActiveCategory(category.slug)}
                  />
                ))}
              </div>
            </AnimateOnScroll>
          )}

          {loading ? (
            <LoadingGrid />
          ) : visible.length === 0 ? (
            <EmptyState filtered={activeCategory !== ALL} onClear={() => setActiveCategory(ALL)} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {visible.map((post, index) => (
                <UpdateCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="relative bg-deep-green py-16 text-center overflow-hidden">
        <div className="relative z-[1] max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-white text-2xl mb-4">
              Want to talk any of this through?
            </h2>
            <p className="font-[family-name:var(--font-body)] text-white/75 mb-8 max-w-[450px] mx-auto">
              Book a free 30-minute consultation and we will look at your people systems together.
            </p>
            <Link
              to="/consultation"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-terracotta text-white font-semibold rounded-full hover:bg-brand-green transition-all duration-300"
            >
              Book Your Free Consultation →
            </Link>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex px-4 py-2 rounded-full font-[family-name:var(--font-body)] text-[0.82rem] font-medium transition-colors cursor-pointer border-none ${
        active
          ? 'bg-deep-green text-white shadow-card'
          : 'bg-white text-charcoal/60 hover:bg-mint hover:text-deep-green'
      }`}
    >
      {label}
    </button>
  );
}

function UpdateCard({ post, index }: { post: UpdatePost; index: number }) {
  const published = formatUpdateDate(post.publishedAt);

  return (
    <AnimateOnScroll delay={index * 0.05}>
      <Link
        to={updatePath(post.slug)}
        className="block h-full bg-white rounded-[20px] overflow-hidden shadow-card hover:-translate-y-1.5 hover:shadow-elevated transition-all duration-300 group"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-mint">
          <ContentImage
            src={post.coverImageUrl}
            alt={post.title}
            className="w-full h-full transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        <div className="p-7">
          <div className="flex flex-wrap items-center gap-2.5 mb-3.5">
            <span className="inline-flex px-3 py-1 bg-mint text-deep-green font-[family-name:var(--font-body)] text-[0.75rem] font-semibold rounded-full uppercase tracking-wider">
              {post.category}
            </span>
            {published && (
              <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                {published}
              </span>
            )}
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-[1.2rem] font-semibold text-charcoal leading-snug mb-3 group-hover:text-deep-green transition-colors">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/60 leading-relaxed line-clamp-3">
              {post.excerpt}
            </p>
          )}
          {post.linkUrl && (
            <p className="mt-4 font-[family-name:var(--font-body)] text-[0.8rem] font-semibold text-deep-green">
              Has an external link →
            </p>
          )}
        </div>
      </Link>
    </AnimateOnScroll>
  );
}

/** Shapes rather than a spinner, so the grid does not jump when it settles. */
function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7" aria-busy="true">
      <p role="status" className="sr-only">
        Loading updates…
      </p>
      {[0, 1, 2].map((index) => (
        <div key={index} className="bg-white rounded-[20px] overflow-hidden shadow-card">
          <div className="aspect-[16/10] bg-mint/60" />
          <div className="p-7">
            <div className="h-4 w-24 rounded-full bg-mint/70 mb-4" />
            <div className="h-5 w-4/5 rounded-full bg-charcoal/8 mb-3" />
            <div className="h-4 w-full rounded-full bg-charcoal/6 mb-2" />
            <div className="h-4 w-2/3 rounded-full bg-charcoal/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="text-center py-16 bg-white rounded-[20px] shadow-card">
      <div className="w-16 h-16 rounded-full bg-mint flex items-center justify-center mx-auto mb-5">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-deep-green"
          aria-hidden="true"
        >
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V9" />
          <path d="M14 8h4M14 12h4M8 8h2v8H8z" />
        </svg>
      </div>
      <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-2">
        {filtered ? 'Nothing in that category yet' : 'No updates just yet'}
      </h2>
      <p className="font-[family-name:var(--font-body)] text-charcoal/60 mb-6 max-w-[420px] mx-auto">
        {filtered
          ? 'Try another category, or switch back to everything.'
          : 'New posts will appear here as soon as they are published. Our latest writing is over on the blog.'}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-2 px-7 py-3 bg-deep-green text-white font-semibold rounded-full hover:bg-terracotta transition-colors cursor-pointer border-none"
        >
          Show all updates
        </button>
      ) : (
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 px-7 py-3 bg-deep-green text-white font-semibold rounded-full hover:bg-terracotta transition-colors"
        >
          Browse the blog →
        </Link>
      )}
    </div>
  );
}
