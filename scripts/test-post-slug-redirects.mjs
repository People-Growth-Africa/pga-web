import assert from 'node:assert/strict';
import {
  MAX_SLUG_REDIRECT_DEPTH,
  hasSlugConflict,
  resolveSlugRedirectChain,
} from '../api/_lib/slug-redirects.ts';

const plainSlug = resolveSlugRedirectChain('blog', 'current-post', []);
assert.equal(plainSlug, null);

const oneChange = resolveSlugRedirectChain('blog', 'old-post', [
  {
    sourceType: 'blog',
    sourceSlug: 'old-post',
    targetType: 'blog',
    targetSlug: 'current-post',
    postId: 'post-1',
    hasMore: false,
  },
]);
assert.deepEqual(oneChange, {
  type: 'blog',
  slug: 'current-post',
  postId: 'post-1',
  cycleDetected: false,
  depthExceeded: false,
});

const twoChanges = resolveSlugRedirectChain('blog', 'first-slug', [
  {
    sourceType: 'blog',
    sourceSlug: 'first-slug',
    targetType: 'blog',
    targetSlug: 'second-slug',
    postId: 'post-1',
    hasMore: false,
  },
  {
    sourceType: 'blog',
    sourceSlug: 'second-slug',
    targetType: 'blog',
    targetSlug: 'current-slug',
    postId: 'post-1',
    hasMore: false,
  },
]);
assert.equal(twoChanges?.slug, 'current-slug');
assert.equal(twoChanges?.cycleDetected, false);

const changedBackHistory = [
  {
    sourceType: 'blog',
    sourceSlug: 'previous-slug',
    targetType: 'blog',
    targetSlug: 'original-slug',
    postId: 'post-1',
    hasMore: false,
  },
];
assert.equal(resolveSlugRedirectChain('blog', 'original-slug', changedBackHistory), null);
assert.equal(resolveSlugRedirectChain('blog', 'previous-slug', changedBackHistory)?.slug, 'original-slug');

assert.equal(
  hasSlugConflict({
    type: 'blog',
    slug: 'claimed-slug',
    postId: null,
    posts: [{ id: 'post-2', slug: 'claimed-slug' }],
    redirects: [],
  }),
  true,
);
assert.equal(
  hasSlugConflict({
    type: 'blog',
    slug: 'old-slug',
    postId: 'post-2',
    posts: [],
    redirects: [{ type: 'blog', oldSlug: 'old-slug', postId: 'post-1' }],
  }),
  true,
);
assert.equal(
  hasSlugConflict({
    type: 'blog',
    slug: 'original-slug',
    postId: 'post-1',
    posts: [{ id: 'post-1', slug: 'original-slug' }],
    redirects: [{ type: 'blog', oldSlug: 'original-slug', postId: 'post-1' }],
  }),
  false,
);

const cycle = resolveSlugRedirectChain('blog', 'slug-a', [
  {
    sourceType: 'blog',
    sourceSlug: 'slug-a',
    targetType: 'blog',
    targetSlug: 'slug-b',
    postId: 'post-1',
    hasMore: false,
  },
  {
    sourceType: 'blog',
    sourceSlug: 'slug-b',
    targetType: 'blog',
    targetSlug: 'slug-a',
    postId: 'post-1',
    hasMore: false,
  },
]);
assert.equal(cycle?.cycleDetected, true);

const tooDeep = resolveSlugRedirectChain(
  'blog',
  'slug-0',
  Array.from({ length: MAX_SLUG_REDIRECT_DEPTH }, (_, index) => ({
    sourceType: 'blog',
    sourceSlug: `slug-${index}`,
    targetType: 'blog',
    targetSlug: `slug-${index + 1}`,
    postId: 'post-1',
    hasMore: index + 1 === MAX_SLUG_REDIRECT_DEPTH,
  })),
);
assert.equal(tooDeep?.depthExceeded, true);

console.log('Post slug redirect checks passed.');
