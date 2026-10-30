import { useState } from 'react';

import { slugify } from '../../lib/published';
import {
  createCategory as createContentCategory,
  deleteCategory as deleteContentCategory,
  updateCategory as updateContentCategory,
  type AdminCategory,
} from './contentClient';

/**
 * Manage categories: add, rename, delete.
 *
 * The delete case is the interesting one. A category with posts behind it
 * cannot simply go, so the confirm step turns into a reassign: it says how many
 * posts are in the way and offers a category to move them to. The server
 * enforces the same rule (posts.category_id is ON DELETE RESTRICT) and answers
 * 409 with the same numbers if a request skips the dialog, so this is the
 * helpful half of a rule that exists whether or not it is shown.
 *
 * Nothing here is a permission check. A manager-only server refuses every call
 * from anyone else; this dialog just draws the controls.
 */

type Mode = 'closed' | 'list' | 'add' | 'rename';

/** The three writes, so each portal can name its own API prefix. */
export type CategoryWriter = {
  createCategory: typeof createContentCategory;
  updateCategory: typeof updateContentCategory;
  deleteCategory: typeof deleteContentCategory;
};

/** The content desk's own endpoints, used when no writer is passed. */
const CONTENT_WRITER: CategoryWriter = {
  createCategory: createContentCategory,
  updateCategory: updateContentCategory,
  deleteCategory: deleteContentCategory,
};

export default function CategoriesDialog({
  open,
  categories,
  onClose,
  onChanged,
  client = CONTENT_WRITER,
}: {
  open: boolean;
  categories: AdminCategory[];
  onClose: () => void;
  /** Called after a successful write so the parent refetches the list. */
  onChanged: () => void;
  /** Which portal's endpoints the writes use. Defaults to the content desk. */
  client?: CategoryWriter;
}) {
  const [mode, setMode] = useState<Mode>('list');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete flow state: the category being removed and where its posts go.
  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [movedCount, setMovedCount] = useState<number | null>(null);

  if (!open) return null;

  function reset() {
    setMode('list');
    setName('');
    setSlug('');
    setSlugTouched(false);
    setEditing(null);
    setError(null);
    setPendingDelete(null);
    setMoveTo('');
    setDeleteError(null);
    setMovedCount(null);
  }

  function startAdd() {
    reset();
    setMode('add');
  }

  function startRename(category: AdminCategory) {
    reset();
    setEditing(category);
    setName(category.name);
    setSlug(category.slug);
    setSlugTouched(true);
    setMode('rename');
  }

  async function submit() {
    setBusy(true);
    setError(null);

    const trimmedName = name.trim();
    const trimmedSlug = slugify(slug);
    if (!trimmedName || !trimmedSlug) {
      setError('Enter a name and a slug.');
      setBusy(false);
      return;
    }

    const result =
      mode === 'rename' && editing
        ? await client.updateCategory(editing.id, trimmedName, trimmedSlug)
        : await client.createCategory(trimmedName, trimmedSlug);

    setBusy(false);

    if (result.ok) {
      onChanged();
      reset();
      return;
    }
    setError(result.failure.fields?.slug ?? result.failure.error);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setDeleteError(null);

    const hasPosts = pendingDelete.post_count > 0;
    if (hasPosts && !moveTo) {
      setDeleteError('Choose a category to move the posts to.');
      setBusy(false);
      return;
    }

    const result = await client.deleteCategory(pendingDelete.id, hasPosts ? moveTo : undefined);
    setBusy(false);

    if (result.ok) {
      setMovedCount(result.data.movedPosts);
      onChanged();
      // Stay open long enough to say what happened, then close on dismiss.
      setPendingDelete(null);
      setMoveTo('');
      setMode('list');
      return;
    }
    setDeleteError(result.failure.error);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-charcoal/50 backdrop-blur-sm p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="categories-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-t-[24px] sm:rounded-[24px] shadow-elevated">
        <div className="flex items-center justify-between gap-4 px-6 sm:px-8 pt-6 pb-4 border-b border-charcoal/8">
          <h2
            id="categories-title"
            className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal"
          >
            {mode === 'add' ? 'New category' : mode === 'rename' ? 'Rename category' : 'Categories'}
          </h2>
          <button
            type="button"
            onClick={mode === 'list' ? onClose : reset}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-cream flex items-center justify-center text-charcoal/60 hover:bg-mint hover:text-deep-green transition-colors border-none cursor-pointer"
          >
            {mode === 'list' ? '✕' : '←'}
          </button>
        </div>

        <div className="px-6 sm:px-8 py-6">
          {movedCount !== null && (
            <div
              role="status"
              className="mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 font-[family-name:var(--font-body)] text-[0.86rem] text-emerald-800"
            >
              {movedCount > 0
                ? `Moved ${movedCount} post${movedCount === 1 ? '' : 's'} and deleted the category.`
                : 'Category deleted.'}
            </div>
          )}

          {(mode === 'add' || mode === 'rename') && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="category-name"
                  className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-2"
                >
                  Name
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={name}
                  maxLength={60}
                  autoFocus
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugTouched) setSlug(slugify(event.target.value));
                  }}
                  placeholder="e.g. Opportunities"
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="category-slug"
                  className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-2"
                >
                  Slug
                </label>
                <input
                  id="category-slug"
                  type="text"
                  value={slug}
                  maxLength={120}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                  placeholder="opportunities"
                  className={inputClass}
                />
                <p className="mt-1.5 font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/45 break-all">
                  /blog?category={slugify(slug) || 'slug'}
                </p>
              </div>

              {error && (
                <p role="alert" className="font-[family-name:var(--font-body)] text-[0.85rem] text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="flex-1 px-6 py-3 bg-deep-green text-white rounded-full font-[family-name:var(--font-body)] text-sm font-semibold hover:bg-terracotta transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busy ? 'Saving…' : mode === 'rename' ? 'Save' : 'Add category'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="px-6 py-3 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-cream transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mode === 'list' && (
            <>
              <ul className="space-y-2 mb-5">
                {categories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center gap-3 rounded-2xl border border-charcoal/10 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal truncate">
                        {category.name}
                      </p>
                      <p className="font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/45 truncate">
                        {category.slug} ·{' '}
                        {category.post_count === 0
                          ? 'no posts'
                          : `${category.post_count} post${category.post_count === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startRename(category)}
                      className="px-3 py-1.5 rounded-full bg-cream text-charcoal/70 font-[family-name:var(--font-body)] text-[0.78rem] font-medium hover:bg-mint hover:text-deep-green transition-colors border-none cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        reset();
                        setPendingDelete(category);
                      }}
                      className="px-3 py-1.5 rounded-full bg-red-50 text-red-600 font-[family-name:var(--font-body)] text-[0.78rem] font-medium hover:bg-red-100 transition-colors border-none cursor-pointer"
                    >
                      Delete
                    </button>
                  </li>
                ))}
                {categories.length === 0 && (
                  <li className="font-[family-name:var(--font-body)] text-sm text-charcoal/50 text-center py-6">
                    No categories yet.
                  </li>
                )}
              </ul>

              <button
                type="button"
                onClick={startAdd}
                className="w-full px-6 py-3 border-2 border-dashed border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-deep-green hover:border-brand-green hover:bg-mint/30 transition-colors cursor-pointer"
              >
                ＋ Add a category
              </button>
            </>
          )}

          {/* ── Delete / reassign ─────────────────────── */}
          {pendingDelete && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-4">
                <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1">
                  Delete “{pendingDelete.name}”?
                </p>
                {pendingDelete.post_count > 0 ? (
                  <>
                    <p className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/70 mb-3">
                      It has {pendingDelete.post_count} post
                      {pendingDelete.post_count === 1 ? '' : 's'}. Choose where those posts should go
                      first - they will not be deleted.
                    </p>
                    <label
                      htmlFor="move-to"
                      className="block font-[family-name:var(--font-body)] text-xs font-semibold text-charcoal/70 mb-1.5"
                    >
                      Move posts to
                    </label>
                    <select
                      id="move-to"
                      value={moveTo}
                      onChange={(event) => setMoveTo(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choose a category…</option>
                      {categories
                        .filter((category) => category.id !== pendingDelete.id)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  </>
                ) : (
                  <p className="font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/70">
                    It has no posts, so nothing else changes.
                  </p>
                )}
              </div>

              {deleteError && (
                <p role="alert" className="font-[family-name:var(--font-body)] text-[0.85rem] text-red-600">
                  {deleteError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={busy}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-full font-[family-name:var(--font-body)] text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busy
                    ? 'Working…'
                    : pendingDelete.post_count > 0
                      ? `Move ${pendingDelete.post_count} & delete`
                      : 'Delete category'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="px-6 py-3 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-cream transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-[0.92rem] text-charcoal placeholder:text-charcoal/35 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition-colors';
