import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { canonicalUrl, blogMeta } from '../lib/pageMeta';

import AnimateOnScroll from '../components/AnimateOnScroll';
import ContentImage from '../components/ContentImage';
import SafeContent from '../components/SafeContent';
import PostBody from '../components/PostBody';
import SEO from '../components/SEO';
import NewsletterSignup from '../components/NewsletterSignup';
import { useContent } from '../hooks/useContent';
import { useLivePosts } from '../hooks/useLivePosts';
import { COPIED_FEEDBACK_MS, copyText } from '../lib/clipboard';
import { isSafeHttpUrl } from '../lib/content';
import {
  findBlog,
  mergeBlogCategories,
  mergeBlogPosts,
} from '../lib/contentMerge';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { status: contentStatus, entries } = useContent();
  const live = useLivePosts();

  // Copying says so out loud: the button turns into a tick and a short-lived
  // "Link copied" appears beside the row, then both go back on their own.
  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const allPosts = useMemo(() => mergeBlogPosts(entries, live.posts), [entries, live.posts]);
  const categories = useMemo(() => mergeBlogCategories(allPosts), [allPosts]);
  const post = useMemo(
    () => (slug ? findBlog(slug, entries, live.posts) : undefined),
    [slug, entries, live.posts],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const related = useMemo(() => {
    if (!post) return [];
    const others = allPosts.filter((candidate) => candidate.slug !== post.slug);
    const sameCategory = others.filter((candidate) => candidate.category === post.category);
    const rest = others.filter((candidate) => candidate.category !== post.category);
    return [...sameCategory, ...rest].slice(0, 3);
  }, [post, allPosts]);

  // A sheet post is known once /api/content answers and a manager's post once
  // /api/posts does, so a deep link waits for both instead of showing the 404
  // page first. Built-in posts never wait.
  if (!post && (contentStatus === 'loading' || live.status === 'loading')) {
    return (
      <>
        <SEO title="Article | People Growth Africa" description="An article from People Growth Africa." />
        <section className="min-h-[60vh] bg-deep-green pb-[80px] pt-[160px]">
          <div className="mx-auto max-w-[800px] px-6" aria-busy="true">
            <p role="status" className="sr-only">
              Loading article…
            </p>
            <div className="mx-auto h-4 w-32 rounded-full bg-white/20" aria-hidden="true" />
            <div className="mx-auto mt-6 h-9 w-4/5 rounded-full bg-white/15" aria-hidden="true" />
          </div>
        </section>
      </>
    );
  }

  if (!post) {
    return (
      <>
        <SEO
          title="Article Not Found"
          description="This article could not be found. Browse the People Growth Africa knowledge hub for HR, compliance, and people management insights."
        />
        <section className="min-h-screen flex items-center justify-center bg-white pt-24">
          <div className="text-center px-6">
            <h1 className="font-[family-name:var(--font-heading)] text-6xl font-bold text-charcoal mb-4">404</h1>
            <p className="font-[family-name:var(--font-body)] text-xl text-charcoal/60 mb-8">This article could not be found.</p>
            <Link to="/blog" className="inline-flex items-center gap-2 px-8 py-3.5 bg-deep-green text-white font-semibold rounded-full hover:bg-terracotta transition-colors">
              ← Back to Blog
            </Link>
          </div>
        </section>
      </>
    );
  }

  const categoryLabel = categories.find((c) => c.id === post.category)?.label ?? post.category;
  // The manager's optional link out, which the editor describes as a button at
  // the end of the post. Only an http(s) URL is rendered: the value is stored as
  // written, and a `javascript:` one here would be a script in the page.
  const externalLinkUrl = isSafeHttpUrl(post.linkUrl ?? null) ? post.linkUrl : null;
  const externalLink = externalLinkUrl
    ? { url: externalLinkUrl, label: post.linkLabel?.trim() || 'Read more' }
    : null;
  const formattedDate = new Date(post.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // Always the canonical URL, never `window.location`: the build renders this
  // page without a window, and a share link that depends on one would ship an
  // empty `url=` to every crawler and scraper that reads the prerendered HTML.
  const shareUrl = canonicalUrl(`/blog/${post.slug}`);

  async function copyShareLink() {
    try {
      await copyText(shareUrl);
    } catch {
      return; // The browser refused the copy: leave the button as it was.
    }
    setLinkCopied(true);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setLinkCopied(false), COPIED_FEEDBACK_MS);
  }

  // Simple markdown-ish renderer for the content
  const renderContent = (content: string) => {
    const lines = content.trim().split('\n');
    const elements: React.ReactNode[] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (inList && listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc pl-6 mb-6 space-y-2">
            {listItems}
          </ul>,
        );
        listItems = [];
        inList = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      // H2
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={i} className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mt-10 mb-4">
            {trimmed.slice(3)}
          </h2>,
        );
        continue;
      }

      // H3
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={i} className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mt-8 mb-3">
            {trimmed.slice(4)}
          </h3>,
        );
        continue;
      }

      // List items
      if (trimmed.startsWith('- ')) {
        inList = true;
        listItems.push(
          <li key={i} className="font-[family-name:var(--font-body)] text-base text-charcoal/70 leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }} />
          </li>,
        );
        continue;
      }

      // Numbered items
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
      if (numMatch) {
        inList = true;
        listItems.push(
          <li key={i} className="font-[family-name:var(--font-body)] text-base text-charcoal/70 leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: formatInline(numMatch[2]) }} />
          </li>,
        );
        continue;
      }

      // Regular paragraph
      flushList();
      elements.push(
        <p key={i} className="font-[family-name:var(--font-body)] text-base text-charcoal/70 leading-[1.8] mb-4">
          <span dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
        </p>,
      );
    }
    flushList();
    return elements;
  };

  return (
    <>
      <SEO meta={blogMeta(post)} />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative bg-deep-green pt-[140px] pb-[80px] overflow-hidden">
        {(post.detailImage ?? post.image) && (
          <div className="absolute inset-0 z-0">
            <img
              src={post.detailImage ?? post.image ?? undefined}
              alt=""
              className="w-full h-full object-cover opacity-20"
              loading="eager"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-deep-green/80 to-deep-green z-[1]" />
        <div className="relative z-[2] max-w-[800px] mx-auto px-6 text-center">
          <AnimateOnScroll>
            <Link to="/blog" className="inline-flex items-center gap-2 text-white/70 hover:text-white font-[family-name:var(--font-body)] text-sm mb-6 transition-colors">
              ← Back to Blog
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
              <span className="inline-flex px-3.5 py-1.5 bg-brand-green/20 text-mint font-[family-name:var(--font-body)] text-[0.78rem] font-semibold rounded-full uppercase tracking-wider">
                {categoryLabel}
              </span>
              <span className="font-[family-name:var(--font-body)] text-[0.85rem] text-white/60">{formattedDate}</span>
              <span className="font-[family-name:var(--font-body)] text-[0.85rem] text-white/60">{post.readTime} min read</span>
            </div>
            <h1 className="font-[family-name:var(--font-heading)] font-semibold text-white leading-[1.15] mb-6"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
              {post.title}
            </h1>
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center font-[family-name:var(--font-heading)] font-semibold text-terracotta text-base">
                {post.author.initials}
              </div>
              <div className="text-left">
                <div className="font-[family-name:var(--font-body)] font-semibold text-base text-white">{post.author.name}</div>
                <div className="font-[family-name:var(--font-body)] text-[0.9rem] text-white/65">{post.author.role}</div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Article ───────────────────────────────────── */}
      <section className="py-16 bg-white">
        <div className="max-w-[720px] mx-auto px-6">
          <AnimateOnScroll>
            {/* Featured image on larger screens */}
            <div className="rounded-[20px] overflow-hidden mb-10 aspect-[16/9] bg-mint">
              <ContentImage
                src={post.detailImage || post.image || '/images/og-image.jpg'}
                alt={post.title}
                className="w-full h-full"
                eager
              />
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.1}>
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-8">
              {post.tags.map((tag) => (
                <span key={tag} className="inline-flex px-3 py-1 bg-mint/50 text-deep-green font-[family-name:var(--font-body)] text-[0.75rem] font-medium rounded-full">
                  {tag}
                </span>
              ))}
            </div>

            {/* Article body. Built-in posts go through the existing renderer;
                sheet bodies use the older subset renderer; a manager-written
                post uses the same renderer as the editor's preview, so what the
                manager approved is what the reader gets. All three build React
                nodes - the body is never parsed as HTML. */}
            <article className="prose-custom">
              {post.origin === 'sheet' ? (
                <SafeContent body={post.content} />
              ) : post.origin === 'live' ? (
                <PostBody body={post.content} />
              ) : (
                renderContent(post.content)
              )}
            </article>
          </AnimateOnScroll>

          {/* Where the article came from, or the page it refers to. Only a
              manager sets this, from the External link field in the editor. */}
          {externalLink ? (
            <AnimateOnScroll delay={0.11}>
              <div className="mt-10">
                <a
                  href={externalLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-green text-white font-[family-name:var(--font-body)] font-semibold text-[0.95rem] rounded-full hover:bg-deep-green transition-colors"
                >
                  {externalLink.label}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </AnimateOnScroll>
          ) : null}

          {/* Share */}
          <AnimateOnScroll delay={0.12}>
            <div className="mt-12 pt-8 border-t border-charcoal/8">
              <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-4">Share this article</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-mint flex items-center justify-center text-[#0A66C2] hover:bg-[#0A66C2] hover:text-white transition-colors"
                  aria-label="Share on LinkedIn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-mint flex items-center justify-center text-black hover:bg-black hover:text-white transition-colors"
                  aria-label="Share on X"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-mint flex items-center justify-center text-[#1877F2] hover:bg-[#1877F2] hover:text-white transition-colors"
                  aria-label="Share on Facebook"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
                {/* Instagram publishes no web share endpoint. On a phone the OS
                    share sheet includes it, so hand the link to the sheet;
                    elsewhere copy it, which is all a browser can do here. */}
                <button
                  onClick={() => {
                    if (navigator.share) {
                      void navigator.share({ title: post.title, url: shareUrl }).catch(() => {});
                    } else {
                      void copyShareLink();
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-mint flex items-center justify-center text-[#E1306C] hover:bg-[#E1306C] hover:text-white transition-colors"
                  aria-label="Share on Instagram"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
                    <circle cx="12" cy="12" r="4.2" />
                    <circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${post.title} ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-mint flex items-center justify-center text-[#25D366] hover:bg-[#25D366] hover:text-white transition-colors"
                  aria-label="Share on WhatsApp"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.8l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4Z" />
                    <path d="M9.3 7.4c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3l-1.8-.9c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.8-1.3-1.6-1.5-1.9-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.3 0-.5l-.7-1.8c-.2-.5-.4-.4-.6-.4h-.2Z" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => void copyShareLink()}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    linkCopied
                      ? 'bg-brand-green text-white'
                      : 'bg-mint text-deep-green hover:bg-brand-green hover:text-white'
                  }`}
                  aria-label={linkCopied ? 'Link copied' : 'Copy link'}
                >
                  {linkCopied ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  )}
                </button>
                <span
                  role="status"
                  className={
                    linkCopied
                      ? 'self-center font-[family-name:var(--font-body)] text-sm font-semibold text-brand-green'
                      : 'sr-only'
                  }
                >
                  {linkCopied ? 'Link copied' : ''}
                </span>
              </div>
            </div>
          </AnimateOnScroll>

          {/* The reader who has just finished the article is the one most likely
              to want the next one. Same form and confirmation flow as /blog. */}
          <AnimateOnScroll delay={0.15}>
            <NewsletterSignup variant="article" />
          </AnimateOnScroll>

          {/* Author Bio */}
          <AnimateOnScroll delay={0.2}>
            <div className="mt-10 bg-mint/30 rounded-[20px] p-8 flex flex-col sm:flex-row items-start gap-5">
              <div className="w-16 h-16 rounded-full bg-mint flex items-center justify-center font-[family-name:var(--font-heading)] font-bold text-deep-green text-xl shrink-0">
                {post.author.initials}
              </div>
              <div>
                <p className="font-[family-name:var(--font-body)] text-[0.8rem] font-semibold text-charcoal/40 uppercase tracking-wider mb-1">About the Author</p>
                <h3 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-1">{post.author.name}</h3>
                <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-brand-green font-medium mb-2">{post.author.role}</p>
                <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/60 leading-relaxed">{post.author.bio}</p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Related Posts ─────────────────────────────── */}
      {related.length > 0 && (
        <section className="py-16 bg-cream">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateOnScroll className="mb-10">
              <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal">Related Articles</h2>
            </AnimateOnScroll>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              {related.map((rel, i) => (
                <AnimateOnScroll key={rel.id} delay={i * 0.1}>
                  <Link to={`/blog/${rel.slug}`} className="block bg-white rounded-[20px] overflow-hidden shadow-card hover:-translate-y-1.5 hover:shadow-elevated transition-all duration-300 group">
                    <div className="aspect-[16/10] overflow-hidden bg-mint">
                      <ContentImage src={rel.image || null} alt={rel.title} className="w-full h-full transition-transform duration-500 group-hover:scale-105" />
                    </div>
                    <div className="p-6">
                      <span className="inline-flex px-3 py-1 bg-mint text-deep-green font-[family-name:var(--font-body)] text-[0.72rem] font-semibold rounded-full uppercase tracking-wider mb-3">
                        {categories.find((c) => c.id === rel.category)?.label}
                      </span>
                      <h3 className="font-[family-name:var(--font-heading)] text-[1.1rem] font-semibold text-charcoal leading-snug mb-2 group-hover:text-deep-green transition-colors">
                        {rel.title}
                      </h3>
                      <p className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/55 leading-relaxed line-clamp-2">{rel.excerpt}</p>
                      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-charcoal/6">
                        <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/40">{rel.readTime} min read</span>
                        <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/40">
                          {new Date(rel.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ───────────────────────────────────────── */}
      <section className="relative bg-deep-green py-20 text-center overflow-hidden">
        <div className="absolute top-[-40px] right-[-40px] w-[200px] h-[200px] rounded-full bg-terracotta/10" />
        <div className="relative z-[1] max-w-[1200px] mx-auto px-6">
          <AnimateOnScroll>
            <h2 className="font-[family-name:var(--font-heading)] font-semibold text-white text-2xl mb-4">
              Ready to Fix Your People Practices?
            </h2>
            <p className="font-[family-name:var(--font-body)] text-white/75 mb-8 max-w-[450px] mx-auto">
              Tell us where you are now, and we will show you what your people systems could look like.
            </p>
            <a href="mailto:hello@peoplegrowthafrica.com" className="inline-flex items-center gap-2 px-8 py-3.5 bg-terracotta text-white font-semibold rounded-full hover:bg-brand-green transition-all duration-300">
              Book Your Free Consultation →
            </a>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}

/** Format inline markdown: bold, italic, inline code */
function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-charcoal">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-mint/50 px-1.5 py-0.5 rounded text-[0.85em]">$1</code>');
}
