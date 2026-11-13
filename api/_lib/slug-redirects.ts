export type SlugRouteType = 'blog' | 'event';

export type SlugRedirectEdge = {
  sourceType: SlugRouteType;
  sourceSlug: string;
  targetType: SlugRouteType;
  targetSlug: string;
  postId: string;
  hasMore: boolean;
};

export type SlugRedirectResolution = {
  type: SlugRouteType;
  slug: string;
  postId: string;
  cycleDetected: boolean;
  depthExceeded: boolean;
};

export const MAX_SLUG_REDIRECT_DEPTH = 8;

export function resolveSlugRedirectChain(
  type: SlugRouteType,
  slug: string,
  edges: readonly SlugRedirectEdge[],
): SlugRedirectResolution | null {
  const bySource = new Map(edges.map((edge) => [`${edge.sourceType}/${edge.sourceSlug}`, edge]));
  const visited = new Set([`${type}/${slug}`]);
  let currentType = type;
  let currentSlug = slug;
  let lastPostId: string | null = null;

  for (let depth = 0; depth < MAX_SLUG_REDIRECT_DEPTH; depth += 1) {
    const edge = bySource.get(`${currentType}/${currentSlug}`);
    if (!edge) {
      return lastPostId
        ? { type: currentType, slug: currentSlug, postId: lastPostId, cycleDetected: false, depthExceeded: false }
        : null;
    }

    currentType = edge.targetType;
    currentSlug = edge.targetSlug;
    lastPostId = edge.postId;
    const targetKey = `${currentType}/${currentSlug}`;
    if (visited.has(targetKey)) {
      return { type: currentType, slug: currentSlug, postId: lastPostId, cycleDetected: true, depthExceeded: false };
    }
    visited.add(targetKey);

    if (depth + 1 === MAX_SLUG_REDIRECT_DEPTH) {
      return {
        type: currentType,
        slug: currentSlug,
        postId: lastPostId,
        cycleDetected: false,
        depthExceeded: edge.hasMore,
      };
    }
  }

  return null;
}

export function hasSlugConflict(input: {
  type: SlugRouteType;
  slug: string;
  postId: string | null;
  posts: readonly { id: string; slug: string }[];
  redirects: readonly { type: SlugRouteType; oldSlug: string; postId: string }[];
}): boolean {
  return (
    input.posts.some((post) => post.slug === input.slug && post.id !== input.postId) ||
    input.redirects.some(
      (redirect) =>
        redirect.type === input.type &&
        redirect.oldSlug === input.slug &&
        redirect.postId !== input.postId,
    )
  );
}
