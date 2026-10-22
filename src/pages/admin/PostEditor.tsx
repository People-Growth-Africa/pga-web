import { useMemo, useRef, useState } from 'react';

import UpdateBody from '../../components/UpdateBody';
import { slugify } from '../../lib/updates';
import {
  uploadCover,
  type AdminCategory,
  type AdminPost,
  type PostDraft,
} from './contentClient';

/**
 * The create and edit form for one post.
 *
 * A few things are worth naming:
 *
 * - The slug starts as a transliteration of the title and is then editable. The
 *   "title changed, slug did not" case is handled by keeping a flag rather than
 *   re-deriving on every keystroke: a manager who has corrected a slug once
 *   should not have it overwritten the next time they fix a typo in the title.
 * - The preview renders through `UpdateBody`, the same component the public
 *   page uses. A preview that disagreed with the published page would be worse
 *   than none, so there is only one renderer.
 * - The category select ends in "Add a new category…", which opens the field for
 *   a name and derives the slug. A manager never has to leave this form to
 *   invent a content type.
 * - Switching between "new" and a different post resets every field, because
 *   the parent gives this component a `key` of the post it is editing. Changing
 *   a key remounts, so the state starts from `toDraft` again and there is no
 *   effect copying one row's values over another's.
 * - Nothing here decides permissions. Every call is refused by the server for a
 *   non-manager, and this form just shows what it was told.
 */

const ACTION_PHRASES = {
  draft: 'Save Draft',
  publish: 'Publish',
} as const;

export type EditorMode = 'create' | 'edit';

export default function PostEditor({
  mode,
  post,
  categories,
  saving,
  error,
  onCancel,
  onSubmit,
  onAddCategory,
}: {
  mode: EditorMode;
  /** The row being edited, or null when creating. */
  post: AdminPost | null;
  categories: AdminCategory[];
  saving: boolean;
  /** A failure from the last save, shown above the form. */
  error: string | null;
  onCancel: () => void;
  onSubmit: (draft: PostDraft) => void;
  /** Asks the parent to open the category dialog; returns the new category id. */
  onAddCategory: () => Promise<string | null>;
}) {
  const initial = useMemo(() => toDraft(post), [post]);

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [body, setBody] = useState(initial.body);
  const [coverImageUrl, setCoverImageUrl] = useState(initial.coverImageUrl);
  const [linkLabel, setLinkLabel] = useState(initial.linkLabel ?? '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(initial.status);
  const [previewing, setPreviewing] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const chosenCategory = categories.find((category) => category.id === categoryId);

  function handleTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleAddCategory() {
    const created = await onAddCategory();
    if (created) setCategoryId(created);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);

    const result = await uploadCover(file, setUploadProgress);
    setUploading(false);

    if (result.ok) {
      setCoverImageUrl(result.data.url);
      return;
    }
    setUploadProgress(0);
    setUploadError(result.failure.error);
  }

  function buildDraft(nextStatus: 'draft' | 'published'): PostDraft {
    return {
      slug: slug.trim(),
      title: title.trim(),
      excerpt: excerpt.trim(),
      body,
      categoryId,
      coverImageUrl: coverImageUrl || null,
      linkLabel: linkLabel.trim() || null,
      linkUrl: linkUrl.trim() || null,
      status: nextStatus,
    };
  }

  const canSubmit =
    title.trim().length > 0 && slug.trim().length > 0 && categoryId !== '' && !uploading;

  return (
    <div className="bg-white rounded-[20px] shadow-card p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4 mb-7">
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">
          {mode === 'create' ? 'New post' : 'Edit post'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-charcoal/55 hover:text-charcoal font-[family-name:var(--font-body)] text-sm font-medium bg-transparent border-none cursor-pointer"
        >
          ← Back to list
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] text-red-700"
        >
          {error}
        </div>
      )}

      <div className="space-y-6">
        <Field label="Title" htmlFor="post-title" hint="What the post is about, in one line.">
          <input
            id="post-title"
            type="text"
            value={title}
            onChange={(event) => handleTitle(event.target.value)}
            maxLength={160}
            placeholder="e.g. New payroll guidance for 2026"
            className={inputClass}
          />
        </Field>

        <Field
          label="Slug"
          htmlFor="post-slug"
          hint={`peoplegrowthafrica.com/updates/${slug || 'your-post'}`}
        >
          <input
            id="post-slug"
            type="text"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
            maxLength={120}
            placeholder="your-post"
            className={inputClass}
          />
        </Field>

        <Field label="Category" htmlFor="post-category">
          <select
            id="post-category"
            value={categoryId}
            onChange={(event) => {
              if (event.target.value === '__add__') {
                void handleAddCategory();
                return;
              }
              setCategoryId(event.target.value);
            }}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a category…
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.post_count > 0 ? ` (${category.post_count})` : ''}
              </option>
            ))}
            <option value="__add__">＋ Add a new category…</option>
          </select>
          {chosenCategory && (
            <p className="mt-2 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
              Slug: {chosenCategory.slug}
            </p>
          )}
        </Field>

        <Field
          label="Excerpt"
          htmlFor="post-excerpt"
          hint="One or two sentences shown on the list and in search results."
        >
          <textarea
            id="post-excerpt"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            maxLength={400}
            rows={3}
            placeholder="A short summary…"
            className={inputClass}
          />
          <p className="mt-1.5 font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/40 text-right">
            {excerpt.length}/400
          </p>
        </Field>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="post-body"
              className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal"
            >
              Body
            </label>
            <div className="flex gap-1 bg-cream/60 rounded-full p-1">
              <Toggle active={!previewing} onClick={() => setPreviewing(false)}>
                Write
              </Toggle>
              <Toggle active={previewing} onClick={() => setPreviewing(true)}>
                Preview
              </Toggle>
            </div>
          </div>
          <p className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
            ## Heading, ### Subheading, - bullet, 1. numbered, **bold**, *italic*, [label](https://…).
            Blank line for a new paragraph.
          </p>

          {previewing ? (
            <div className={`${inputClass} min-h-[260px] bg-cream/30`}>
              {body.trim() ? (
                <UpdateBody body={body} />
              ) : (
                <p className="font-[family-name:var(--font-body)] text-charcoal/40 italic">
                  Nothing to preview yet.
                </p>
              )}
            </div>
          ) : (
            <textarea
              id="post-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={14}
              placeholder="Write the post…"
              className={`${inputClass} font-[family-name:var(--font-body)] leading-relaxed`}
            />
          )}
        </div>

        {/* ── Cover image ───────────────────────────── */}
        <div>
          <span className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-2">
            Cover image
          </span>
          <p className="mb-3 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
            Optional. JPG, PNG or WebP up to 5 MB. Used as the preview image when the update is
            shared.
          </p>

          {coverImageUrl ? (
            <div className="rounded-2xl overflow-hidden border border-charcoal/10 bg-cream/40">
              <div className="aspect-[16/9] bg-mint">
                <img
                  src={coverImageUrl}
                  alt="Cover image preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-wrap gap-3 p-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-[0.82rem] font-medium text-charcoal hover:bg-mint hover:border-brand-green transition-colors cursor-pointer"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCoverImageUrl(null);
                    setUploadError(null);
                  }}
                  className="px-4 py-2 bg-white border border-red-200 rounded-full font-[family-name:var(--font-body)] text-[0.82rem] font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-2xl border-2 border-dashed border-charcoal/15 bg-cream/30 px-6 py-8 text-center hover:border-brand-green hover:bg-mint/30 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-70"
            >
              {uploading ? (
                <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/60">
                  Uploading… {uploadProgress}%
                </span>
              ) : (
                <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/60">
                  <span className="font-semibold text-deep-green">Choose an image</span> or drop one
                  here
                </span>
              )}
            </button>
          )}

          {uploading && (
            <div
              className="mt-3 h-2 w-full rounded-full bg-charcoal/10 overflow-hidden"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="h-full bg-deep-green transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {uploadError && (
            <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-[0.82rem] text-red-600">
              {uploadError}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>

        {/* ── External link ─────────────────────────── */}
        <fieldset className="border-0 p-0 m-0">
          <legend className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1">
            External link <span className="font-normal text-charcoal/45">(optional)</span>
          </legend>
          <p className="mb-3 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
            Shown as a button at the end of the post.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              maxLength={80}
              placeholder="Button label (e.g. Register here)"
              className={inputClass}
              aria-label="Link label"
            />
            <input
              type="url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
              className={inputClass}
              aria-label="Link URL"
            />
          </div>
        </fieldset>
      </div>

      {/* ── Actions ───────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-charcoal/8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/55">Status:</span>
          <span
            className={`inline-flex px-3 py-1 rounded-full font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-wider ${
              status === 'published' ? 'bg-deep-green text-white' : 'bg-cream text-charcoal/60'
            }`}
          >
            {status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setStatus('draft');
              onSubmit(buildDraft('draft'));
            }}
            disabled={!canSubmit || saving}
            className="px-6 py-3 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-cream transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'edit' && status === 'published' ? 'Save & unpublish' : ACTION_PHRASES.draft}
          </button>
          <button
            type="button"
            onClick={() => {
              setStatus('published');
              onSubmit(buildDraft('published'));
            }}
            disabled={!canSubmit || saving}
            className="px-7 py-3 bg-deep-green text-white rounded-full font-[family-name:var(--font-body)] text-sm font-semibold hover:bg-terracotta transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : status === 'published' ? 'Save changes' : ACTION_PHRASES.publish}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-[0.92rem] text-charcoal placeholder:text-charcoal/35 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition-colors';

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-2"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45 break-all">
          {hint}
        </p>
      )}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3.5 py-1.5 rounded-full font-[family-name:var(--font-body)] text-[0.78rem] font-medium transition-colors cursor-pointer border-none ${
        active ? 'bg-deep-green text-white shadow-sm' : 'text-charcoal/55 hover:text-deep-green'
      }`}
    >
      {children}
    </button>
  );
}

function toDraft(post: AdminPost | null): PostDraft {
  if (!post) {
    return {
      slug: '',
      title: '',
      excerpt: '',
      body: '',
      categoryId: '',
      coverImageUrl: null,
      linkLabel: null,
      linkUrl: null,
      status: 'draft',
    };
  }
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    categoryId: post.category_id,
    coverImageUrl: post.cover_image_url,
    linkLabel: post.link_label,
    linkUrl: post.link_url,
    status: post.status,
  };
}
