import { useEffect, useMemo, useRef, useState } from 'react';

import PostBody from '../../components/PostBody';
import RegistrationFormBuilder from '../../components/admin/RegistrationFormBuilder';
import { eventsList } from '../../data/events';
import { blogPosts } from '../../data/posts';
import {
  isoToLagosInput,
  lagosInputToIso,
  slugify,
  type LivePostType,
} from '../../lib/published';
import {
  coerceRegistrationForm,
  defaultRegistrationForm,
  isChoiceQuestion,
  type RegistrationForm,
} from '../../lib/registrationForm';
import type {
  uploadCover as uploadCoverFn,
  AdminCategory,
  AdminPost,
  PostDraft,
} from './contentClient';

/**
 * The editor is shared by the two staff portals, and each one talks to its own
 * API prefix (`/api/admin/*` for oversight, `/api/content/*` for the content
 * desk). Every call therefore arrives as a prop rather than being imported
 * here: an editor that reaches for the content desk's upload on its own sends
 * an administrator's image to a route that only a content manager may use, and
 * the button answers "this area is for content managers".
 */
type UploadCover = typeof uploadCoverFn;

/**
 * The create and edit form for one post.
 *
 * A post is either a blog post or an event, and the form is one form with a
 * switch rather than two forms. Choosing Event reveals the date, place and
 * registration fields and hides the category and external link; choosing Blog
 * does the reverse. The server clears whichever set does not belong, so a
 * manager flicking between them cannot leave a field behind that later fails a
 * constraint they cannot see.
 *
 * Times are collected as Lagos wall-clock and converted to UTC on submit (see
 * `lagosInputToIso`). The database stores instants, every reader is shown them
 * in Lagos, and the manager's own machine timezone never enters into it.
 *
 * A few other things worth naming:
 *
 * - The slug starts as a transliteration of the title and is then editable. The
 *   "title changed, slug did not" case is handled by keeping a flag rather than
 *   re-deriving on every keystroke: a manager who has corrected a slug once
 *   should not have it overwritten the next time they fix a typo in the title.
 * - A slug that collides with a built-in page is flagged here, because the
 *   built-in page wins the URL and the new post would be invisible. The server
 *   cannot check this: `api/` cannot import `src/data`.
 * - The preview renders through `PostBody`, the same component the public
 *   pages use, so there is only one renderer to keep honest.
 */

const ACTION_PHRASES = {
  draft: 'Save Draft',
  publish: 'Publish',
} as const;

export type EditorMode = 'create' | 'edit';

/** Every slug the build already ships, so a new one cannot quietly shadow it. */
const BUILT_IN_SLUGS = new Set<string>([
  ...blogPosts.map((post) => `blog/${post.slug}`),
  ...eventsList.map((event) => `events/${event.slug}`),
]);

export default function PostEditor({
  mode,
  post,
  initialType = 'blog',
  categories,
  saving,
  error,
  onCancel,
  onSubmit,
  onAddCategory,
  uploadCover,
}: {
  mode: EditorMode;
  /** The row being edited, or null when creating. */
  post: AdminPost | null;
  /** Which type a new post opens on. Editing uses the row's own type. */
  initialType?: LivePostType;
  categories: AdminCategory[];
  saving: boolean;
  /** A failure from the last save, shown above the form. */
  error: string | null;
  onCancel: () => void;
  onSubmit: (draft: PostDraft) => void;
  /** Asks the parent to open the category dialog; returns the new category id. */
  onAddCategory: () => Promise<string | null>;
  /** The calling portal's cover upload, so each panel posts to its own route. */
  uploadCover: UploadCover;
}) {
  const initial = useMemo(() => toDraft(post, initialType), [post, initialType]);

  const [type, setType] = useState<LivePostType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [body, setBody] = useState(initial.body);
  const [coverImageUrl, setCoverImageUrl] = useState(initial.coverImageUrl);
  const [coverImageThumbUrl, setCoverImageThumbUrl] = useState(initial.coverImageThumbUrl);
  const [linkLabel, setLinkLabel] = useState(initial.linkLabel ?? '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl ?? '');
  // The inputs hold `datetime-local` values, so an unset date is an empty
  // string here rather than null; `lagosInputToIso` turns it back into null.
  const [eventStart, setEventStart] = useState(initial.eventStart ?? '');
  const [eventEnd, setEventEnd] = useState(initial.eventEnd ?? '');
  const [locationText, setLocationText] = useState(initial.locationText ?? '');
  const [isOnline, setIsOnline] = useState(initial.isOnline);
  const [registrationUrl, setRegistrationUrl] = useState(initial.registrationUrl ?? '');
  const [registrationIntro, setRegistrationIntro] = useState(initial.registrationIntro ?? '');
  const [registrationButtonLabel, setRegistrationButtonLabel] = useState(
    initial.registrationButtonLabel ?? '',
  );
  const [registrationForm, setRegistrationForm] = useState<RegistrationForm>(
    () => coerceRegistrationForm(initial.registrationForm) ?? defaultRegistrationForm(),
  );
  // How many answers this event has already collected. A change to a live form
  // is allowed, but the editor is told it only affects new responses.
  const [responseCount, setResponseCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>(initial.status);
  const [previewing, setPreviewing] = useState(false);
  // Fields whose required-value message may be shown. Visiting one (or changing
  // it) opts it in, so an untouched form stays quiet.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * The status the server last confirmed, and what the panel is allowed to
   * claim. While a save is in flight the clicked button's status is shown, so
   * the chip follows the action; when the save comes back with an error the row
   * is unchanged, so the chip falls back to the last confirmed status instead of
   * claiming a publish that never happened.
   */
  const savedStatus = post?.status ?? 'draft';
  const shownStatus: 'draft' | 'published' = error ? savedStatus : status;

  const chosenCategory = categories.find((category) => category.id === categoryId);

  const editingEventSlug = mode === 'edit' && post?.type === 'event' ? post.slug : null;
  useEffect(() => {
    if (!editingEventSlug) return;
    let active = true;
    fetch(`/api/admin/registrations?event=${encodeURIComponent(editingEventSlug)}`, {
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { total?: unknown } | null) => {
        if (active && payload && typeof payload.total === 'number') setResponseCount(payload.total);
      })
      .catch(() => {
        // A count is a courtesy; not having it must not block the editor.
      });
    return () => {
      active = false;
    };
  }, [editingEventSlug]);
  const section = type === 'blog' ? 'blog' : 'events';

  function markTouched(field: string) {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  }

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
      setCoverImageThumbUrl(result.data.thumbUrl);
      return;
    }
    setUploadProgress(0);
    setUploadError(result.failure.error);
  }

  function clearCover() {
    setCoverImageUrl(null);
    setCoverImageThumbUrl(null);
    setUploadError(null);
  }

  /** Trims what the builder collected; empty option lines are dropped here. */
  const cleanedForm = useMemo<RegistrationForm>(
    () => ({
      ...registrationForm,
      title: registrationForm.title.trim() || 'Register for this event',
      confirmationMessage: registrationForm.confirmationMessage.trim(),
      questions: registrationForm.questions.map((question) => ({
        ...question,
        label: question.label.trim(),
        options: isChoiceQuestion(question.type)
          ? [...new Set(question.options.map((option) => option.trim()).filter(Boolean))]
          : [],
      })),
    }),
    [registrationForm],
  );

  const registrationFormIssue = useMemo(() => {
    if (type !== 'event') return null;
    if (cleanedForm.questions.length === 0) return 'Add at least one registration question.';
    if (cleanedForm.questions.some((question) => !question.label))
      return 'Give every registration question a label.';
    if (!cleanedForm.questions.some((question) => question.type === 'email'))
      return 'Add an email question so the team can reply.';
    if (
      cleanedForm.questions.some(
        (question) => isChoiceQuestion(question.type) && question.options.length < 2,
      )
    )
      return 'Every choice question needs at least two options.';
    return null;
  }, [type, cleanedForm]);

  function buildDraft(nextStatus: 'draft' | 'published'): PostDraft {
    const isEvent = type === 'event';
    return {
      type,
      slug: slugify(slug),
      title: title.trim(),
      excerpt: excerpt.trim(),
      body,
      categoryId: isEvent ? null : categoryId || null,
      coverImageUrl: coverImageUrl || null,
      coverImageThumbUrl: coverImageThumbUrl,
      linkLabel: isEvent ? null : linkLabel.trim() || null,
      linkUrl: isEvent ? null : linkUrl.trim() || null,
      eventStart: isEvent ? lagosInputToIso(eventStart) : null,
      eventEnd: isEvent ? lagosInputToIso(eventEnd) : null,
      locationText: isEvent && !isOnline ? locationText.trim() || null : null,
      isOnline: isEvent ? isOnline : false,
      registrationUrl: isEvent ? registrationUrl.trim() || null : null,
      registrationIntro: isEvent ? registrationIntro.trim() || null : null,
      registrationButtonLabel: isEvent ? registrationButtonLabel.trim() || null : null,
      registrationForm: isEvent ? cleanedForm : null,
      status: nextStatus,
    };
  }

  // A fresh form is empty, so every required field is invalid the moment it
  // opens. Saying so in four red lines before the manager has typed anything is
  // noise; each message waits until that field has been visited (or its value
  // changed) and the form is genuinely missing something.
  const show = (field: string) => touched[field] === true;

  const eventStartInvalid = type === 'event' && (!eventStart || !lagosInputToIso(eventStart));
  const eventEndInvalid =
    type === 'event' &&
    eventEnd !== '' &&
    (!lagosInputToIso(eventEnd) ||
      (lagosInputToIso(eventStart) !== null &&
        (lagosInputToIso(eventEnd) as string) <= (lagosInputToIso(eventStart) as string)));
  const locationMissing = type === 'event' && !isOnline && locationText.trim() === '';
  const categoryMissing = type === 'blog' && categoryId === '';

  const canSubmit =
    title.trim().length > 0 &&
    slug.trim().length > 0 &&
    !uploading &&
    !eventStartInvalid &&
    !eventEndInvalid &&
    !locationMissing &&
    !categoryMissing &&
    registrationFormIssue === null;

  const slugTaken = BUILT_IN_SLUGS.has(`${section}/${slugify(slug)}`);

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
        {/* ── Type ──────────────────────────────────── */}
        <div>
          <span className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-2">
            Type
          </span>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Post type">
            <TypeCard
              active={type === 'blog'}
              title="Blog post"
              description="An article, guide or announcement."
              onClick={() => setType('blog')}
            />
            <TypeCard
              active={type === 'event'}
              title="Event"
              description="Something with a date and a place."
              onClick={() => setType('event')}
            />
          </div>
        </div>

        <Field label="Title" htmlFor="post-title" hint="What the post is about, in one line.">
          <input
            id="post-title"
            type="text"
            value={title}
            onChange={(event) => handleTitle(event.target.value)}
            maxLength={160}
            placeholder={type === 'event' ? 'e.g. HR Leaders Roundtable' : 'e.g. New payroll guidance for 2026'}
            className={inputClass}
          />
        </Field>

        <Field
          label="Slug"
          htmlFor="post-slug"
          hint={`peoplegrowthafrica.com/${section}/${slugify(slug) || 'your-post'}`}
        >
          <input
            id="post-slug"
            type="text"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            maxLength={120}
            placeholder="your-post"
            aria-describedby={slugTaken ? 'slug-taken' : undefined}
            className={inputClass}
          />
          {slugTaken && (
            <p
              id="slug-taken"
              role="alert"
              className="mt-2 font-[family-name:var(--font-body)] text-[0.82rem] text-amber-700"
            >
              /{section}/{slugify(slug)} is already a page built into the site, and that page keeps
              the URL. Choose a different slug or this post will not be reachable.
            </p>
          )}
        </Field>

        {/* ── Event fields ──────────────────────────── */}
        {type === 'event' && (
          <div className="rounded-2xl bg-cream/50 p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Starts"
                htmlFor="event-start"
                hint="Lagos time. Stored as UTC."
              >
                <input
                  id="event-start"
                  type="datetime-local"
                  value={eventStart}
                  onChange={(event) => setEventStart(event.target.value)}
                  onBlur={() => markTouched('eventStart')}
                  aria-invalid={eventStartInvalid}
                  aria-describedby={eventStartInvalid && show('eventStart') ? 'event-start-error' : undefined}
                  className={inputClass}
                />
                {eventStartInvalid && show('eventStart') && (
                  <p
                    id="event-start-error"
                    role="alert"
                    className="mt-1.5 font-[family-name:var(--font-body)] text-[0.78rem] text-red-600"
                  >
                    Enter when the event starts.
                  </p>
                )}
              </Field>
              <Field label="Ends (optional)" htmlFor="event-end" hint="Must be after the start.">
                <input
                  id="event-end"
                  type="datetime-local"
                  value={eventEnd}
                  onChange={(event) => setEventEnd(event.target.value)}
                  onBlur={() => markTouched('eventEnd')}
                  aria-invalid={eventEndInvalid}
                  aria-describedby={eventEndInvalid && show('eventEnd') ? 'event-end-error' : undefined}
                  className={inputClass}
                />
                {eventEndInvalid && show('eventEnd') && (
                  <p
                    id="event-end-error"
                    role="alert"
                    className="mt-1.5 font-[family-name:var(--font-body)] text-[0.78rem] text-red-600"
                  >
                    The end must be after the start.
                  </p>
                )}
              </Field>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOnline}
                  onChange={(event) => setIsOnline(event.target.checked)}
                  className="h-4 w-4 accent-deep-green cursor-pointer"
                />
                <span className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal">
                  This event is online
                </span>
              </label>
              <p className="mt-1 ml-7 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                No venue is needed, and the page shows an online badge.
              </p>
            </div>

            {!isOnline && (
              <Field
                label="Location"
                htmlFor="event-location"
                hint="Where people should go, e.g. Apapa, Lagos."
              >
                <input
                  id="event-location"
                  type="text"
                  value={locationText}
                  onChange={(event) => setLocationText(event.target.value)}
                  onBlur={() => markTouched('location')}
                  maxLength={160}
                  placeholder="Apapa, Lagos"
                  aria-invalid={locationMissing}
                  aria-describedby={locationMissing && show('location') ? 'event-location-error' : undefined}
                  className={inputClass}
                />
                {locationMissing && show('location') && (
                  <p
                    id="event-location-error"
                    role="alert"
                    className="mt-1.5 font-[family-name:var(--font-body)] text-[0.78rem] text-red-600"
                  >
                    Enter a venue, or mark the event as online.
                  </p>
                )}
              </Field>
            )}

            <Field
              label="Registration link (optional)"
              htmlFor="event-registration"
              hint="Shown as a button. Leave empty and the page simply has no button."
            >
              <input
                id="event-registration"
                type="url"
                value={registrationUrl}
                onChange={(event) => setRegistrationUrl(event.target.value)}
                placeholder="https://example.com/register"
                className={inputClass}
              />
            </Field>

            <Field
              label="Registration form intro"
              htmlFor="event-registration-intro"
              hint="Shown above the form. Leave empty for the default copy."
            >
              <textarea
                id="event-registration-intro"
                value={registrationIntro}
                onChange={(event) => setRegistrationIntro(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Tell guests what to expect from this session."
                className={inputClass}
              />
            </Field>

            <Field
              label="Registration button label"
              htmlFor="event-registration-label"
              hint="Optional. Defaults to Reserve my free place."
            >
              <input
                id="event-registration-label"
                type="text"
                value={registrationButtonLabel}
                onChange={(event) => setRegistrationButtonLabel(event.target.value)}
                maxLength={60}
                placeholder="Reserve my free place"
                className={inputClass}
              />
            </Field>

            <div className="sm:col-span-2">
              <RegistrationFormBuilder
                value={registrationForm}
                onChange={setRegistrationForm}
                responseCount={responseCount}
                disabled={saving}
              />
              {registrationFormIssue && (
                <p
                  role="alert"
                  className="mt-2 font-[family-name:var(--font-body)] text-[0.8rem] font-medium text-red-600"
                >
                  {registrationFormIssue}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Category, blog only ───────────────────── */}
        {type === 'blog' && (
          <Field label="Category" htmlFor="post-category" hint="The topic the post is filed under.">
            <select
              id="post-category"
              value={categoryId}
              onChange={(event) => {
                if (event.target.value === '__add__') {
                  void handleAddCategory();
                  return;
                }
                setCategoryId(event.target.value);
                markTouched('category');
              }}
              onBlur={() => markTouched('category')}
              aria-describedby={
                categoryMissing && show('category') ? 'post-category-error' : undefined
              }
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
            {categoryMissing && show('category') && (
              <p
                id="post-category-error"
                role="alert"
                className="mt-1.5 font-[family-name:var(--font-body)] text-[0.78rem] text-red-600"
              >
                Choose a category.
              </p>
            )}
          </Field>
        )}

        <Field
          label={type === 'event' ? 'Summary' : 'Excerpt'}
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
                <PostBody body={body} />
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
            Optional. JPG, PNG or WebP up to 5 MB. Converted to WebP in your browser and stored at
            two sizes: the grid uses the thumbnail, the page uses the full one.
          </p>

          {coverImageUrl ? (
            <div className="rounded-2xl overflow-hidden border border-charcoal/10 bg-cream/40">
              <div className="aspect-[16/9] bg-mint">
                <img
                  src={coverImageThumbUrl ?? coverImageUrl}
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
                  onClick={clearCover}
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

        {/* ── External link, blog only ──────────────── */}
        {type === 'blog' && (
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
                placeholder="Button label (e.g. Read the report)"
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
        )}
      </div>

      {/* ── Actions ───────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-charcoal/8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/55">Status:</span>
            <span
              className={`inline-flex px-3 py-1 rounded-full font-[family-name:var(--font-body)] text-[0.72rem] font-semibold uppercase tracking-wider ${
                shownStatus === 'published' ? 'bg-deep-green text-white' : 'bg-cream text-charcoal/60'
              }`}
            >
              {shownStatus === 'published' ? 'Published' : 'Draft'}
            </span>
          </div>
          {!canSubmit && (title.trim() !== '' || slug.trim() !== '') && (
            <p className="font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/50">
              Fill in the required fields to save.
            </p>
          )}
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
            {mode === 'edit' && savedStatus === 'published' ? 'Save & unpublish' : ACTION_PHRASES.draft}
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
            {saving ? 'Saving…' : shownStatus === 'published' ? 'Save changes' : ACTION_PHRASES.publish}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-[0.92rem] text-charcoal placeholder:text-charcoal/35 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition-colors';

function TypeCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
        active
          ? 'border-brand-green bg-mint/40 ring-2 ring-brand-green/20'
          : 'border-charcoal/15 bg-white hover:border-brand-green/60'
      }`}
    >
      <span className="block font-[family-name:var(--font-body)] text-[0.92rem] font-semibold text-charcoal">
        {title}
      </span>
      <span className="block mt-0.5 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/50">
        {description}
      </span>
    </button>
  );
}

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

function toDraft(post: AdminPost | null, initialType: LivePostType = 'blog'): PostDraft {
  if (!post) {
    return {
      type: initialType,
      slug: '',
      title: '',
      excerpt: '',
      body: '',
      categoryId: null,
      coverImageUrl: null,
      coverImageThumbUrl: null,
      linkLabel: null,
      linkUrl: null,
      eventStart: null,
      eventEnd: null,
      locationText: null,
      isOnline: false,
      registrationUrl: null,
      registrationIntro: null,
      registrationButtonLabel: null,
      registrationForm: null,
      status: 'draft',
    };
  }

  return {
    type: post.type,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    categoryId: post.category_id,
    coverImageUrl: post.cover_image_url,
    coverImageThumbUrl: post.cover_image_thumb_url,
    linkLabel: post.link_label,
    linkUrl: post.link_url,
    eventStart: isoToLagosInput(post.event_start),
    eventEnd: isoToLagosInput(post.event_end),
    locationText: post.location_text,
    isOnline: post.is_online,
    registrationUrl: post.registration_url,
    registrationIntro: post.registration_intro,
    registrationButtonLabel: post.registration_button_label,
    registrationForm: coerceRegistrationForm(post.registration_form),
    status: post.status,
  };
}
