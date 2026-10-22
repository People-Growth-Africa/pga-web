export interface Author {
  name: string;
  initials: string;
  role: string;
  bio: string;
  avatar?: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /**
   * The search-result description, when the excerpt is too long to show whole.
   * Optional so a post added from the content sheet, which has no such cell,
   * simply falls back to its summary.
   */
  metaDescription?: string;
  /** `YYYY-MM-DD` of the last real edit, when one is recorded. */
  updated?: string;
  content: string;
  category: string;
  tags: string[];
  /**
   * The image shown on the page itself: hero backdrop, featured card,
   * list thumbnails. Optional so a post added from the content sheet without
   * one simply falls back to the site's default artwork.
   */
  image?: string | null;
  /**
   * The image used for sharing: og:image, twitter:image and the Article
   * `image` in JSON-LD.
   *
   * Deliberately separate from `image`, which is decoration. A stock photo
   * that happens to sit behind the headline is not the article's card, and
   * announcing one as the other makes every shared link preview something the
   * post is not. Optional: a post with no share image falls back to
   * /images/og-image.jpg (1200x630) rather than to the Unsplash URL.
   */
  shareImage?: string | null;
  date: string;
  author: Author;
  featured?: boolean;
  readTime: number;
}

export interface Category {
  id: string;
  label: string;
}

export const categories: Category[] = [
  { id: 'all', label: 'All Posts' },
  { id: 'hr-strategy', label: 'HR Strategy' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'culture', label: 'Culture & Engagement' },
  { id: 'talent', label: 'Talent Management' },
  { id: 'growth', label: 'Business Growth' },
];

/**
 * No built-in articles ship with the site.
 *
 * Every article on /blog is now checked in by a manager from the admin panel
 * (the posts table) or, historically, from the content sheet. The array stays
 * because it is what the merge rules and the build read; keeping it empty is how
 * the site says "there is no shipped article content" rather than deleting the
 * type that every reader of it depends on.
 */
export const blogPosts: BlogPost[] = [];

/** Get a post by slug */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

/** Filter posts by category */
export function getPostsByCategory(categoryId: string): BlogPost[] {
  if (categoryId === 'all') return blogPosts;
  return blogPosts.filter((p) => p.category === categoryId);
}

/** Search posts by query */
export function searchPosts(query: string): BlogPost[] {
  const q = query.toLowerCase().trim();
  if (!q) return blogPosts;
  return blogPosts.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** Get category label by id */
export function getCategoryLabel(categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.label ?? categoryId;
}
