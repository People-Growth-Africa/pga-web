import { useState, useMemo, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AnimateOnScroll from '../components/AnimateOnScroll';
import SEO from '../components/SEO';
import FormsUnavailableNotice, { FormAvailabilityPending } from '../components/FormsUnavailableNotice';
import { useFormsAvailability } from '../hooks/useFormsAvailability';
import { authRequest } from '../lib/authClient';
import { blogPosts, categories, getFeaturedPost, type BlogPost } from '../data/posts';

const POSTS_PER_PAGE = 6;

/** 'sent' only ever means the server answered; nothing is faked here. */
type NewsletterState = 'idle' | 'sending' | 'sent' | 'error';

export default function BlogList() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterState, setNewsletterState] = useState<NewsletterState>('idle');
  const [newsletterNotice, setNewsletterNotice] = useState('');
  // The newsletter writes to the same database the lead forms do, so it asks
  // the same question on load and says so before anyone types an address.
  const formsAvailability = useFormsAvailability();

  const featured = getFeaturedPost();

  const filteredPosts = useMemo(() => {
    let posts = blogPosts.filter((p) => p.id !== featured.id);
    if (activeCategory !== 'all') {
      posts = posts.filter((p) => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return posts;
  }, [activeCategory, searchQuery, featured.id]);

  const visiblePosts = filteredPosts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPosts.length;

  const handleFilterByTag = (tag: string) => {
    // Map common tags to their category IDs
    const tagToCategory: Record<string, string> = {
      'HR Strategy': 'hr-strategy',
      'HR Audit': 'hr-strategy',
      'HR Systems': 'hr-strategy',
      'SMEs': 'hr-strategy',
      'Formalisation': 'hr-strategy',
      'Best Practices': 'hr-strategy',
      'OKRs': 'hr-strategy',
      'Performance Management': 'hr-strategy',
      'Leadership': 'leadership',
      'Startups': 'leadership',
      'Management': 'leadership',
      'Career Development': 'leadership',
      'Compliance': 'compliance',
      'Nigerian Labour Law': 'compliance',
      'Legal': 'compliance',
      'Employment Contracts': 'compliance',
      'Culture': 'culture',
      'Culture & Engagement': 'culture',
      'Growth': 'culture',
      'Scaling': 'culture',
      'Values': 'culture',
      'Talent Management': 'talent',
      'Recruitment': 'talent',
      'Hiring': 'talent',
      'Africa': 'talent',
      'Retention': 'talent',
      'Employee Engagement': 'talent',
      'Business Growth': 'growth',
    };
    const cat = tagToCategory[tag] || 'all';
    setActiveCategory(cat);
    setVisibleCount(POSTS_PER_PAGE);
    // Scroll to grid
    setTimeout(() => {
      document.getElementById('blog-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
  };

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!email || newsletterState === 'sending') return;

    setNewsletterState('sending');
    setNewsletterNotice('');

    const result = await authRequest<{ ok: boolean; message?: string; already?: boolean }>(
      '/api/newsletter/subscribe',
      { body: { email } },
    );

    if (result.ok) {
      setNewsletterState('sent');
      setNewsletterNotice(
        result.data.message ?? 'Check your inbox to confirm your subscription.',
      );
      // An address that is already subscribed stays in the box: clearing it
      // would suggest another email was sent to it.
      if (result.data.already !== true) setNewsletterEmail('');
      return;
    }

    setNewsletterState('error');
    setNewsletterNotice(result.failure.fields?.email ?? result.failure.error);
  };

  return (
    <>
      <SEO
        title="Blog | People Growth Africa"
        description="Insights, guides, and expert perspectives on HR, people management, and building high-performing teams across African businesses."
      />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative bg-deep-green pt-[160px] pb-[100px] overflow-hidden">
        <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full bg-terracotta/8" />
        <div className="absolute bottom-[-80px] left-[-60px] w-[300px] h-[300px] rounded-full bg-brand-green/8" />
        <div className="relative z-[1] max-w-[1200px] mx-auto px-6 text-center">
          <AnimateOnScroll>
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-terracotta mb-4">Our Blog</p>
            <h1 className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.15] mb-5 max-w-[700px] mx-auto"
              style={{ fontSize: 'clamp(2.4rem, 5vw, 3.8rem)' }}>
              Insights for Growing<br />African Businesses
            </h1>
            <p className="font-[family-name:var(--font-body)] text-[1.1rem] text-white/75 max-w-[560px] mx-auto leading-relaxed mb-10">
              Practical, plain-spoken guidance on HR, people management and building strong teams in African businesses.
            </p>
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.1}>
            <form onSubmit={handleSearch} className="flex max-w-[520px] mx-auto bg-white/10 border border-white/15 rounded-full overflow-hidden backdrop-blur-sm">
              <input
                type="text"                  placeholder="Search articles…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(POSTS_PER_PAGE); }}
                className="flex-1 px-6 py-4 bg-transparent border-none outline-none text-white font-[family-name:var(--font-body)] text-base placeholder:text-white/50"
                aria-label="Search blog articles"
              />
              <button type="submit" className="px-7 py-4 bg-brand-green border-none text-white font-[family-name:var(--font-body)] font-semibold text-sm cursor-pointer hover:bg-terracotta transition-colors flex items-center gap-2 whitespace-nowrap">
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Search
              </button>
            </form>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Category Filters ──────────────────────────── */}
      <section className="pt-12 bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* One row you flick through on a phone; the centered wrap returns at md. */}
          <AnimateOnScroll className="flex flex-nowrap md:flex-wrap justify-start md:justify-center gap-3 overflow-x-auto md:overflow-visible scrollbar-none [&::-webkit-scrollbar]:hidden -mx-6 px-6 md:mx-0 md:px-0">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setVisibleCount(POSTS_PER_PAGE); setTimeout(() => { document.getElementById('blog-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100); }}
                className={`inline-flex shrink-0 items-center px-6 py-2.5 rounded-full border-[1.5px] font-[family-name:var(--font-body)] text-[0.88rem] font-medium cursor-pointer transition-all duration-300 whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-deep-green border-deep-green text-white'
                    : 'bg-transparent border-charcoal/12 text-charcoal/65 hover:border-brand-green hover:text-brand-green'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Featured Post ─────────────────────────────── */}
      <section className="py-[60px]">
        <div className="max-w-[1200px] mx-auto px-6">
          <Link to={`/blog/${featured.slug}`} className="block group">
            <AnimateOnScroll>
              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
                <div className="relative rounded-[20px] overflow-hidden aspect-[16/10] bg-mint">
                  <img
                    src={featured.image}
                    alt={featured.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="eager"
                  />
                  <span className="absolute top-5 left-5 inline-flex items-center gap-1.5 px-4 py-2 bg-terracotta text-white font-[family-name:var(--font-body)] text-[0.75rem] font-semibold uppercase tracking-wider rounded-full">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Featured
                  </span>
                </div>
                <div className="py-3">
                  <div className="flex flex-wrap items-center gap-4 mb-4">
                    <span className="inline-flex px-3.5 py-1.5 bg-mint text-deep-green font-[family-name:var(--font-body)] text-[0.78rem] font-semibold rounded-full uppercase tracking-wider">
                      {categories.find((c) => c.id === featured.category)?.label}
                    </span>
                    <span className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/50">{new Date(featured.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <span className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/50 before:content-['·'] before:mr-4">{featured.readTime} min read</span>
                  </div>
                  <h2 className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.2] mb-4 group-hover:text-deep-green transition-colors"
                    style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>
                    {featured.title}
                  </h2>
                  <p className="font-[family-name:var(--font-body)] text-base text-charcoal/60 leading-relaxed mb-7">{featured.excerpt}</p>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 rounded-full bg-mint flex items-center justify-center font-[family-name:var(--font-heading)] font-semibold text-deep-green text-sm">
                      {featured.author.initials}
                    </div>
                    <div>
                      <div className="font-[family-name:var(--font-body)] font-semibold text-[0.9rem] text-charcoal">{featured.author.name}</div>
                      <div className="font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/50">{featured.author.role}</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-2 font-[family-name:var(--font-body)] font-semibold text-[0.95rem] text-brand-green group-hover:gap-3 group-hover:text-terracotta transition-all">
                    Read Full Article
                    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </div>
              </div>
            </AnimateOnScroll>
          </Link>
        </div>
      </section>

      {/* ── Blog Grid ─────────────────────────────────── */}
      <section id="blog-grid" className="py-10 pb-[100px] bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-4">
            <h2 className="font-[family-name:var(--font-heading)] text-[1.8rem] font-semibold text-charcoal">Latest Articles</h2>
            <span className="font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/50">
              Showing {filteredPosts.length} article{filteredPosts.length !== 1 ? 's' : ''}
            </span>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            <AnimatePresence mode="popLayout">
              {visiblePosts.map((post, i) => (
                <BlogCard key={post.id} post={post} index={i} onTagClick={handleFilterByTag} />
              ))}
            </AnimatePresence>
          </div>

          {filteredPosts.length === 0 && (
            <div className="text-center py-20">
              <p className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-2">No articles found</p>
              <p className="font-[family-name:var(--font-body)] text-base text-charcoal/50">Try adjusting your search or category filter.</p>
            </div>
          )}

          {hasMore && (
            <div className="text-center mt-12">
              <button
                onClick={() => setVisibleCount((c) => c + POSTS_PER_PAGE)}
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-deep-green text-deep-green font-[family-name:var(--font-body)] font-semibold rounded-full hover:bg-deep-green hover:text-white transition-all duration-300"
              >
                Load More Articles
                <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Newsletter ─────────────────────────────────── */}
      <section className="py-[100px] bg-cream relative overflow-hidden">
        <div className="absolute top-[-60px] right-[-60px] w-[300px] h-[300px] rounded-full bg-terracotta/8" />
        <div className="absolute bottom-[-40px] left-[-40px] w-[200px] h-[200px] rounded-full bg-brand-green/6" />
        <div className="relative z-[1] max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll className="max-w-[680px] mx-auto text-center">
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-brand-green mb-3">Stay in the Loop</p>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-charcoal leading-[1.15] mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}>
              Get HR Insights<br />Delivered to Your Inbox
            </h2>
            <p className="font-[family-name:var(--font-body)] text-[1.05rem] text-charcoal/60 leading-relaxed mb-9 max-w-[500px] mx-auto">
              Join 2,000+ business leaders across Africa receiving practical people management tips, regulatory updates, and growth strategies every two weeks.
            </p>
            {formsAvailability !== 'available' ? (
              formsAvailability === 'unavailable' ? (
                <FormsUnavailableNotice className="max-w-[480px] mx-auto text-left" />
              ) : (
                <FormAvailabilityPending className="text-center" />
              )
            ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-[480px] mx-auto">
              <input
                type="email"
                placeholder="Enter your email address"
                value={newsletterEmail}
                onChange={(e) => {
                  setNewsletterEmail(e.target.value);
                  // A new address is a new attempt, so the last answer goes away.
                  if (newsletterState !== 'idle') {
                    setNewsletterState('idle');
                    setNewsletterNotice('');
                  }
                }}
                required
                className="flex-1 px-6 py-4 border-[1.5px] border-charcoal/12 rounded-full font-[family-name:var(--font-body)] text-base bg-white text-charcoal outline-none focus:border-brand-green transition-colors placeholder:text-charcoal/40"
                aria-label="Email address for newsletter"
              />
              <button type="submit" disabled={newsletterState === 'sending'} className={`px-8 py-4 border-none rounded-full font-[family-name:var(--font-body)] text-[0.95rem] font-semibold cursor-pointer transition-all duration-300 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70 ${
                newsletterState === 'sent'
                  ? 'bg-brand-green text-white'
                  : 'bg-deep-green text-white hover:bg-terracotta hover:-translate-y-0.5'
              }`}>
                {newsletterState === 'sending' ? 'Sending…' : newsletterState === 'sent' ? 'Thanks ✓' : 'Subscribe'}
              </button>
            </form>
            )}
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/40 mt-4">No spam. The newsletter and nothing else, every two weeks.</p>
            {/* Mounted from the start so a screen reader announces the server's answer when it lands. */}
            <p
              role="status"
              aria-live="polite"
              className={`font-[family-name:var(--font-body)] text-[0.85rem] mt-2 min-h-[1.25rem] ${
                newsletterState === 'error' ? 'text-terracotta' : 'text-deep-green'
              }`}
            >
              {newsletterNotice}
            </p>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}

/* ── Blog Card ──────────────────────────────────────────────────── */

function BlogCard({ post, index, onTagClick }: { post: BlogPost; index: number; onTagClick?: (tag: string) => void }) {
  const categoryLabel = categories.find((c) => c.id === post.category)?.label ?? post.category;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
    >
      <Link to={`/blog/${post.slug}`} className="block bg-white rounded-[20px] overflow-hidden shadow-card hover:-translate-y-1.5 hover:shadow-elevated transition-all duration-300 group">
        <div className="relative aspect-[16/10] overflow-hidden bg-mint">
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div className="p-7">
          <div className="flex flex-wrap gap-2 mb-3.5">
            <span className="inline-flex px-3 py-1 bg-mint text-deep-green font-[family-name:var(--font-body)] text-[0.75rem] font-semibold rounded-full uppercase tracking-wider">
              {categoryLabel}
            </span>
            {post.tags.slice(0, 2).map((tag) => (
              <button
                key={tag}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick?.(tag); }}
                className="inline-flex px-3 py-1 bg-cream/60 text-charcoal/50 font-[family-name:var(--font-body)] text-[0.7rem] font-medium rounded-full hover:bg-mint hover:text-deep-green transition-colors cursor-pointer border-none"
              >
                {tag}
              </button>
            ))}
          </div>
          <h3 className="font-[family-name:var(--font-heading)] text-[1.2rem] font-semibold text-charcoal leading-snug mb-3 group-hover:text-deep-green transition-colors">
            {post.title}
          </h3>
          <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/60 leading-relaxed mb-5 line-clamp-3">
            {post.excerpt}
          </p>
          <div className="flex items-center justify-between pt-4 border-t border-charcoal/6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-mint flex items-center justify-center font-[family-name:var(--font-heading)] font-semibold text-deep-green text-[0.7rem]">
                {post.author.initials}
              </div>
              <span className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold text-charcoal">{post.author.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">{post.readTime} min</span>
              <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                {new Date(post.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
