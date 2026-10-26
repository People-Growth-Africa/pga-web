import { authRequest, NETWORK_FAILURE, type ApiFailure } from '../../lib/authClient';
import { compressCover, CoverError } from '../../lib/coverImage';

/**
 * Admin oversight's calls to /api/admin/*.
 *
 * Everything goes through `authRequest`, which sends the session cookie and
 * folds a network failure and an HTTP failure into one result. None of these
 * functions decide anything about permissions: the server checks the manager
 * role on every one of them, and this layer only reports what came back. A
 * panel that hid a button would be a courtesy, not a check.
 */

export type PostType = 'blog' | 'event';

export type AdminPost = {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  /** Null on an event: a topic belongs to a written piece. */
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  cover_image_url: string | null;
  cover_image_thumb_url: string | null;
  link_label: string | null;
  link_url: string | null;
  event_start: string | null;
  event_end: string | null;
  location_text: string | null;
  is_online: boolean;
  registration_url: string | null;
  registration_intro: string | null;
  registration_button_label: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string | null;
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  post_count: number;
};

export type PostDraft = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  coverImageThumbUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  /** UTC ISO instants. The form works in Lagos and converts before sending. */
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
  registrationIntro: string | null;
  registrationButtonLabel: string | null;
  status: 'draft' | 'published';
};

export type Result<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export async function listContent(filters: {
  type?: string;
  status?: string;
  search?: string;
  signal?: AbortSignal;
}): Promise<Result<{ posts: AdminPost[]; categories: AdminCategory[] }>> {
  const query = new URLSearchParams();
  if (filters.type) query.set('type', filters.type);
  if (filters.status) query.set('status', filters.status);
  if (filters.search) query.set('search', filters.search);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return authRequest(`/api/admin/posts${suffix}`, { method: 'GET' });
}

/**
 * Tells the server the manager is still at the keyboard.
 *
 * A manager session ends after an hour without a request, and writing an
 * article makes none, so the panel calls this on real interaction. Its answer
 * decides nothing: a failure is ignored, and the next save reports an expired
 * session through the normal failure path.
 */
export async function pingSession(): Promise<void> {
  await authRequest('/api/admin/ping', { method: 'GET' });
}

export async function createPost(draft: PostDraft): Promise<Result<{ post: AdminPost }>> {
  return authRequest('/api/admin/posts', { method: 'PUT', body: draft });
}

export async function updatePost(
  id: string,
  draft: PostDraft,
): Promise<Result<{ post: AdminPost }>> {
  return authRequest('/api/admin/post', { method: 'PUT', body: { id, ...draft } });
}

export async function setPostStatus(
  id: string,
  status: 'draft' | 'published',
): Promise<Result<{ post: AdminPost }>> {
  return authRequest('/api/admin/post-status', { method: 'POST', body: { id, status } });
}

export async function deletePost(id: string): Promise<Result<{ ok: boolean }>> {
  return authRequest(`/api/admin/post?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createCategory(
  name: string,
  slug: string,
): Promise<Result<{ category: AdminCategory }>> {
  return authRequest('/api/admin/categories', { method: 'POST', body: { name, slug } });
}

export async function updateCategory(
  id: string,
  name: string,
  slug: string,
): Promise<Result<{ category: AdminCategory }>> {
  return authRequest('/api/admin/category', { method: 'PUT', body: { id, name, slug } });
}

export async function deleteCategory(
  id: string,
  moveTo?: string,
): Promise<Result<{ ok: boolean; movedPosts: number }>> {
  const query = new URLSearchParams({ id });
  if (moveTo) query.set('moveTo', moveTo);
  return authRequest(`/api/admin/category?${query.toString()}`, { method: 'DELETE' });
}

/**
 * Uploads a chosen image as a cover and returns the pair of URLs.
 *
 * The file is compressed here first (`src/lib/coverImage.ts`) into a full WebP
 * and a thumbnail, then each is posted separately: grids use the thumbnail and
 * the article page uses the full file, so a list of a hundred covers does not
 * pull a hundred 1600px images.
 *
 * These are the only calls that do not go through `authRequest`: they post a
 * multi-megabyte body and want a real progress event, which `fetch` cannot
 * report. The session cookie is still sent, the server still checks the role,
 * and a failure is turned into the same `ApiFailure` shape as everything else
 * so the form handles it identically.
 */
export async function uploadCover(
  file: File,
  onProgress: (percent: number) => void,
): Promise<Result<{ url: string; thumbUrl: string }>> {
  let pair: Awaited<ReturnType<typeof compressCover>>;
  try {
    // Preparing the pair is the quiet, CPU-bound part; it owns the first third
    // of the bar so the two uploads that follow have something to fill.
    pair = await compressCover(file, (percent) => onProgress(Math.round(percent * 0.3)));
  } catch (error) {
    return {
      ok: false,
      failure: {
        error:
          error instanceof CoverError
            ? error.message
            : 'That image could not be prepared. Try another one.',
        code: 'image_failed',
      },
    };
  }

  const full = await postImage(pair.full, 'full', (percent) =>
    onProgress(30 + Math.round(percent * 0.4)),
  );
  if (!full.ok) return full;

  const thumb = await postImage(pair.thumb, 'thumb', (percent) =>
    onProgress(70 + Math.round(percent * 0.3)),
  );
  if (!thumb.ok) {
    return {
      ok: false,
      failure: {
        error: `The image uploaded but its thumbnail did not. ${thumb.failure.error}`,
        code: thumb.failure.code,
      },
    };
  }

  return { ok: true, data: { url: full.data.url, thumbUrl: thumb.data.url } };
}

/** One file to /api/admin/upload, reported as a share of its own progress. */
async function postImage(
  file: File,
  variant: 'full' | 'thumb',
  onProgress: (percent: number) => void,
): Promise<Result<{ url: string }>> {
  const base64 = await readAsBase64(file, onProgress);

  try {
    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        variant,
        data: base64,
      }),
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (response.ok && payload && typeof payload === 'object') {
      const data = payload as { url?: unknown };
      if (typeof data.url === 'string') return { ok: true, data: { url: data.url } };
      return { ok: false, failure: { error: 'The upload did not return an image.', code: 'bad_response' } };
    }

    const failure = (payload && typeof payload === 'object' ? payload : {}) as Partial<ApiFailure>;
    return {
      ok: false,
      failure: {
        error: failure.error ?? 'The image could not be uploaded. Try again.',
        code: failure.code ?? 'upload_failed',
        ...(failure.fields ? { fields: failure.fields } : {}),
      },
    };
  } catch {
    return { ok: false, failure: NETWORK_FAILURE };
  }
}

/**
 * File -> base64, without the data: prefix.
 *
 * Progress is reported as the file is read, not while it uploads: the read is
 * the part that takes measurable time in the browser, and the upload itself
 * reports nothing until it is over. Calling it progress either way keeps the
 * bar honest about what it is showing.
 */
function readAsBase64(file: File, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 90));
      }
    };
    reader.onload = () => {
      onProgress(100);
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}
