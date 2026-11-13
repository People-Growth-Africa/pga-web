import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

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
import {
  speakerDraftToView,
  speakerInitial,
  speakerToDraft,
  type SpeakerDraftInput,
} from '../../lib/speakers';
import type {
  uploadCover as uploadCoverFn,
  uploadSpeakerPhoto as uploadSpeakerPhotoFn,
  AdminCategory,
  AdminPost,
  PostDraft,
} from './contentClient';

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
 * The form is split into tabs because it had grown to a page of scrolling:
 * Basics, Event details, Speakers, Registration, Content, Cover. Every field
 * that was here before is still here, in one of them - what changed is that only
 * one section is on screen at a time, and a sticky header keeps the save buttons
 * and the status reachable. The right rail answers the one question the old
 * layout could not: what is still missing before this can be published.
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
 * - Speakers are saved with the post, not on their own. The editor holds the
 *   whole list and sends it in the same request, so a draft's speakers cannot
 *   exist for a post that failed to save. Their own form is only open while the
 *   manager is editing one: by default the tab is a toggle and a grid.
 */

/** The visitor carousel, loaded only when the preview is opened. */
const SpeakerCarousel = lazy(() => import('../../components/SpeakerCarousel'));

/** Every slug the build already ships, so a new one cannot quietly shadow it. */
const BUILT_IN_SLUGS = new Set<string>([
  ...blogPosts.map((post) => `blog/${post.slug}`),
  ...eventsList.map((event) => `events/${event.slug}`),
]);

const MAX_SPEAKERS = 12;
const BIO_MAX = 280;

export type EditorMode = 'create' | 'edit';

type TabId = 'basics' | 'event' | 'speakers' | 'registration' | 'content' | 'cover';

/** A speaker while it is being edited: the row's fields plus a local key. */
type SpeakerItem = SpeakerDraftInput & { key: string };

/** The open speaker form. `key` is the item being edited, null when adding. */
type SpeakerFormState = {
  mode: 'add' | 'edit';
  key: string | null;
  values: SpeakerDraftInput;
  /** The JSON the form opened with, so "unsaved changes" is a real comparison. */
  initial: string;
};

function localKey(): string {
  return `s-${Math.random().toString(36).slice(2, 10)}`;
}

function emptySpeaker(): SpeakerDraftInput {
  return {
    id: null,
    name: '',
    role: null,
    organisation: null,
    bio: null,
    photoUrl: null,
    photoThumbUrl: null,
    linkedinUrl: null,
    photoFocusX: 50,
    photoFocusY: 25,
  };
}

/** The same rule the server enforces: https, on linkedin.com, no credentials. */
function isValidLinkedIn(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /^(?:[a-z0-9-]+\.)?linkedin\.com$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export default function PostEditor({
  mode,
  post,
  initialType = 'blog',
  categories,
  saving,
  error,
  canPublish = true,
  onCancel,
  onSubmit,
  onAddCategory,
  uploadCover,
  uploadSpeakerPhoto,
}: {
  mode: EditorMode;
  /** The row being edited, or null when creating. */
  post: AdminPost | null;
  /** Which type a new post opens on. Editing uses the row's own type. */
  initialType?: LivePostType;
  categories: AdminCategory[];
  saving: boolean;
  /** False for edit-only staff: saves are forced to drafts by the server. */
  canPublish?: boolean;
  /** A failure from the last save, shown above the form. */
  error: string | null;
  onCancel: () => void;
  onSubmit: (draft: PostDraft) => void;
  /** Asks the parent to open the category dialog; returns the new category id. */
  onAddCategory: () => Promise<string | null>;
  /** The calling portal's cover upload, so each panel posts to its own route. */
  uploadCover: typeof uploadCoverFn;
  /** The same pipeline, squared, for speaker portraits. */
  uploadSpeakerPhoto: typeof uploadSpeakerPhotoFn;
}) {
  const initial = useMemo(() => toDraft(post, initialType), [post, initialType]);
  const initialSpeakers = useMemo<SpeakerItem[]>(
    () =>
      (post?.speakers ?? []).map((record) => ({
        ...speakerToDraft(record),
        key: record.id,
      })),
    [post],
  );

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
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>(initial.status);
  const [publishAt, setPublishAt] = useState(initial.publishAt ?? '');
  const [previewing, setPreviewing] = useState(false);
  // Fields whose required-value message may be shown. Visiting one (or changing
  // it) opts it in, so an untouched form stays quiet.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Speakers ────────────────────────────────────────────────────────────
  const [showSpeakers, setShowSpeakers] = useState(initial.showSpeakers);
  const [speakers, setSpeakers] = useState<SpeakerItem[]>(() =>
    initialSpeakers.map((speaker) => ({ ...speaker, key: speaker.id ?? localKey() })),
  );
  const [speakerForm, setSpeakerForm] = useState<SpeakerFormState | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [speakerUploading, setSpeakerUploading] = useState(false);
  const [speakerUploadError, setSpeakerUploadError] = useState<string | null>(null);
  const [photoDragging, setPhotoDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [formOpenCount, setFormOpenCount] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Layout ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('basics');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const speakerFileRef = useRef<HTMLInputElement>(null);
  const speakerFormRef = useRef<HTMLDivElement>(null);
  const speakerNameRef = useRef<HTMLInputElement>(null);

  /**
   * The status the server last confirmed, and what the panel is allowed to
   * claim. While a save is in flight the clicked button's status is shown, so
   * the chip follows the action; when the save comes back with an error the row
   * is unchanged, so the chip falls back to the last confirmed status instead of
   * claiming a publish that never happened.
   */
  const savedStatus = post?.status ?? 'draft';
  const shownStatus: 'draft' | 'published' | 'scheduled' = error ? savedStatus : status;

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

  // Event-only tabs disappear with the type; a manager who was on one of them
  // would otherwise be left looking at a panel that no longer has a heading.
  useEffect(() => {
    if (
      type !== 'event' &&
      (activeTab === 'event' || activeTab === 'speakers' || activeTab === 'registration')
    ) {
      setActiveTab('basics');
    }
  }, [type, activeTab]);

  // A phone shows four tabs at a time; the active one is scrolled into view
  // rather than left off the edge.
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  // The speaker form opens below the grid, which on a phone can be off screen.
  useEffect(() => {
    if (formOpenCount === 0) return;
    // `start` plus the form's scroll margin, so the sticky header does not cover
    // the heading or the first field on a phone.
    speakerFormRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [formOpenCount]);

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

  function buildDraft(nextStatus: 'draft' | 'published' | 'scheduled'): PostDraft {
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
      publishAt: nextStatus === 'scheduled' ? lagosInputToIso(publishAt) : null,
      showSpeakers,
      speakers: speakers.map((speaker) => ({
        ...(speaker.id ? { id: speaker.id } : {}),
        name: speaker.name.trim(),
        role: speaker.role?.trim() || null,
        organisation: speaker.organisation?.trim() || null,
        bio: speaker.bio?.trim() || null,
        photoUrl: speaker.photoUrl || null,
        photoThumbUrl: speaker.photoThumbUrl || null,
        linkedinUrl: speaker.linkedinUrl?.trim() || null,
        photoFocusX: Math.round(speaker.photoFocusX),
        photoFocusY: Math.round(speaker.photoFocusY),
      })),
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
    !speakerUploading &&
    !eventStartInvalid &&
    !eventEndInvalid &&
    !locationMissing &&
    !categoryMissing &&
    registrationFormIssue === null &&
    (status !== 'scheduled' ||
      Boolean(lagosInputToIso(publishAt) && Date.parse(lagosInputToIso(publishAt)!) > Date.now()));

  const slugTaken = BUILT_IN_SLUGS.has(`${section}/${slugify(slug)}`);

  const submitDraft = () => {
    setStatus('draft');
    onSubmit(buildDraft('draft'));
  };
  const submitPublish = () => {
    setStatus('published');
    onSubmit(buildDraft('published'));
  };
  const submitSchedule = () => {
    setStatus('scheduled');
    onSubmit(buildDraft('scheduled'));
  };

  // ── Speaker handlers ────────────────────────────────────────────────────

  const speakerDirty =
    speakerForm !== null && JSON.stringify(speakerForm.values) !== speakerForm.initial;

  function confirmDiscard(): boolean {
    if (!speakerDirty) return true;
    return window.confirm('You have unsaved changes to this speaker. Discard them?');
  }

  function updateSpeakerForm(patch: Partial<SpeakerDraftInput>) {
    setSpeakerForm((current) =>
      current ? { ...current, values: { ...current.values, ...patch } } : current,
    );
  }

  function openAddSpeaker() {
    if (!confirmDiscard()) return;
    const values = emptySpeaker();
    setSelectedSpeaker(null);
    setSpeakerError(null);
    setSpeakerUploadError(null);
    setSpeakerForm({ mode: 'add', key: null, values, initial: JSON.stringify(values) });
    setFormOpenCount((count) => count + 1);
  }

  function openSpeaker(item: SpeakerItem) {
    if (speakerForm?.key === item.key) return;
    if (!confirmDiscard()) return;
    const { key, ...values } = item;
    setSelectedSpeaker(key);
    setSpeakerError(null);
    setSpeakerUploadError(null);
    setSpeakerForm({ mode: 'edit', key, values: { ...values }, initial: JSON.stringify(values) });
    setFormOpenCount((count) => count + 1);
  }

  function closeSpeakerForm() {
    if (!confirmDiscard()) return;
    setSpeakerForm(null);
    setSelectedSpeaker(null);
    setSpeakerError(null);
    setSpeakerUploadError(null);
  }

  function saveSpeakerForm() {
    if (!speakerForm) return;
    const values = speakerForm.values;
    if (!values.name.trim()) {
      setSpeakerError('Give the speaker a name.');
      speakerNameRef.current?.focus();
      return;
    }
    if ((values.bio?.length ?? 0) > BIO_MAX) {
      setSpeakerError(`Keep the bio to ${BIO_MAX} characters or fewer.`);
      return;
    }
    if (values.linkedinUrl?.trim() && !isValidLinkedIn(values.linkedinUrl.trim())) {
      setSpeakerError('Use a full https://www.linkedin.com/… URL, or leave it empty.');
      return;
    }

    const cleaned: SpeakerDraftInput = { ...values, name: values.name.trim() };
    if (speakerForm.mode === 'add') {
      setSpeakers((current) => [...current, { ...cleaned, key: localKey() }]);
    } else {
      setSpeakers((current) =>
        current.map((item) => (item.key === speakerForm.key ? { ...item, ...cleaned } : item)),
      );
    }
    setSpeakerForm(null);
    setSelectedSpeaker(null);
    setSpeakerError(null);
    setSpeakerUploadError(null);
  }

  function removeSpeaker(item: SpeakerItem) {
    if (!window.confirm(`Remove ${item.name || 'this speaker'} from this post?`)) return;
    if (speakerForm?.key === item.key) {
      setSpeakerForm(null);
      setSelectedSpeaker(null);
    }
    setSpeakers((current) => current.filter((speaker) => speaker.key !== item.key));
  }

  function moveSpeaker(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= speakers.length) return;
    setSpeakers((current) => {
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      if (!item) return current;
      copy.splice(next, 0, item);
      return copy;
    });
  }

  function dropOn(index: number) {
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === index) return;
    setSpeakers((current) => {
      const copy = [...current];
      const [item] = copy.splice(from, 1);
      if (!item) return current;
      copy.splice(index, 0, item);
      return copy;
    });
  }

  async function handleSpeakerPhoto(file: File | undefined) {
    if (!file) return;
    setSpeakerUploadError(null);
    setSpeakerUploading(true);
    const result = await uploadSpeakerPhoto(file, () => {});
    setSpeakerUploading(false);
    if (!result.ok) {
      setSpeakerUploadError(result.failure.error);
      return;
    }
    updateSpeakerForm({
      photoUrl: result.data.url,
      photoThumbUrl: result.data.thumbUrl,
      photoFocusX: 50,
      photoFocusY: 25,
    });
  }

  function changeTab(next: TabId) {
    if (next === activeTab) return;
    if (activeTab === 'speakers' && next !== 'speakers' && !confirmDiscard()) return;
    if (next !== 'speakers') {
      setSpeakerForm(null);
      setSelectedSpeaker(null);
      setSpeakerError(null);
    }
    setActiveTab(next);
  }

  // ── The rail's facts ────────────────────────────────────────────────────

  const speakersMissingPhotos = speakers.filter(
    (speaker) => !speaker.photoUrl && !speaker.photoThumbUrl,
  );
  const checks = [
    { label: 'Title and slug', ok: title.trim() !== '' && slug.trim() !== '' && !slugTaken },
    ...(type === 'event'
      ? [{ label: 'Start date and location', ok: !eventStartInvalid && !locationMissing }]
      : []),
    ...(type === 'event' && speakers.length > 0
      ? [
          {
            label: `${speakers.length} speaker${speakers.length === 1 ? '' : 's'} with photos`,
            ok: speakersMissingPhotos.length === 0,
          },
        ]
      : []),
    { label: 'Cover image', ok: Boolean(coverImageUrl) },
    { label: 'Body is not empty', ok: body.trim() !== '' },
  ];
  const missingChecks = checks.filter((check) => !check.ok);

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string; count?: number; error?: boolean }[] = [
      {
        id: 'basics',
        label: 'Basics',
        error: title.trim() === '' || slug.trim() === '' || slugTaken,
      },
    ];
    if (type === 'event') {
      list.push({
        id: 'event',
        label: 'Event details',
        error: eventStartInvalid || locationMissing,
      });
    }
    if (type === 'event') {
      list.push({
        id: 'speakers',
        label: 'Speakers',
        ...(speakers.length > 0 ? { count: speakers.length } : {}),
        error: speakersMissingPhotos.length > 0,
      });
      list.push({
        id: 'registration',
        label: 'Registration',
        error: Boolean(registrationFormIssue),
      });
    }
    list.push({ id: 'content', label: 'Content', error: body.trim() === '' });
    list.push({ id: 'cover', label: 'Cover' });
    return list;
  }, [
    type,
    title,
    slug,
    slugTaken,
    eventStartInvalid,
    locationMissing,
    speakers.length,
    speakersMissingPhotos.length,
    registrationFormIssue,
    body,
  ]);

  const previewSpeakers = useMemo(
    () => speakers.filter((speaker) => speaker.name.trim()).map(speakerDraftToView),
    [speakers],
  );

  const headerTitle = `${mode === 'create' ? 'New' : 'Edit'} ${type === 'event' ? 'event' : 'blog'} post`;

  // ── Pieces the two layouts share ────────────────────────────────────────

  const checklistCard = (
    <section className="rounded-[20px] bg-white p-5 shadow-card">
      <h3 className="font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold text-charcoal">
        Ready to publish?
      </h3>
      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-start gap-2 font-[family-name:var(--font-body)] text-[0.88rem] ${
              check.ok ? 'text-charcoal/70' : 'text-[#A3571F]'
            }`}
          >
            <span aria-hidden="true" className="mt-[0.15rem] text-[0.8rem]">
              {check.ok ? '✓' : '○'}
            </span>
            <span>
              {check.label}
              {!check.ok && <span className="sr-only"> (missing)</span>}
            </span>
          </li>
        ))}
      </ul>
      {missingChecks.length === 0 && (
        <p className="mt-3 font-[family-name:var(--font-body)] text-[0.82rem] font-medium text-deep-green">
          Everything checked.
        </p>
      )}
    </section>
  );

  const scheduleCard = (
    <section className="rounded-[20px] bg-white p-5 shadow-card">
      <h3 className="font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold text-charcoal">
        Schedule time (Lagos)
      </h3>
      <input
        type="datetime-local"
        aria-label="Schedule time in Lagos"
        value={publishAt}
        onChange={(event) => {
          setPublishAt(event.target.value);
          if (event.target.value) setStatus('scheduled');
        }}
        className={`${inputClass} mt-3`}
      />
      <button
        type="button"
        onClick={submitSchedule}
        disabled={!canPublish || !canSubmit || !publishAt || saving}
        className={`${buttonWarn} mt-3 w-full`}
      >
        Schedule
      </button>
    </section>
  );

  const previewCard = (
    <section className="rounded-[20px] bg-white p-5 shadow-card">
      <h3 className="font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold text-charcoal">
        Visitor preview
      </h3>
      {previewSpeakers.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {previewSpeakers.slice(0, 6).map((speaker, index) => (
              <span
                key={`${speaker.name}-${index}`}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-mint font-[family-name:var(--font-heading)] text-sm font-semibold text-deep-green"
              >
                {speaker.photoThumbUrl || speaker.photoUrl ? (
                  <img
                    src={speaker.photoThumbUrl ?? speaker.photoUrl ?? ''}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ objectPosition: `${speaker.photoFocusX}% ${speaker.photoFocusY}%` }}
                  />
                ) : (
                  speakerInitial(speaker.name)
                )}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className={`${buttonOutline} mt-4 w-full`}
          >
            Preview carousel
          </button>
        </>
      ) : (
        <p className="mt-2 font-[family-name:var(--font-body)] text-[0.82rem] leading-relaxed text-charcoal/50">
          Add a speaker and the visitor view can be opened from here.
        </p>
      )}
    </section>
  );

  const rail = (
    <div className="space-y-4">
      {checklistCard}
      {canPublish && scheduleCard}
      {type === 'event' && previewCard}
    </div>
  );

  return (
    <div className="pb-28 md:pb-0">
      {/* Below 768px the sticky header is the title only, so the way back sits
          above it rather than inside it. */}
      <button
        type="button"
        onClick={onCancel}
        className="mb-3 inline-flex min-h-[44px] items-center font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal/55 transition-colors hover:text-charcoal md:hidden"
      >
        ← Content oversight
      </button>

      {/* ── Sticky header ───────────────────────────────── */}
      <div className="sticky top-[4.75rem] z-30 -mx-5 border-b border-charcoal/8 bg-[#F5F0E7]/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:top-0 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="hidden font-[family-name:var(--font-body)] text-[0.72rem] font-medium uppercase tracking-[0.12em] text-charcoal/45 md:block">
              Content oversight / {mode === 'create' ? 'New post' : 'Edit post'}
            </p>
            <h2 className="truncate font-[family-name:var(--font-heading)] text-[1.35rem] font-semibold leading-tight text-charcoal md:text-[1.9rem]">
              {headerTitle}
            </h2>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <StatusChip status={shownStatus} />
            <button
              type="button"
              onClick={submitDraft}
              disabled={!canSubmit || saving}
              className={buttonOutline}
            >
              {!canPublish && mode === 'edit' && savedStatus === 'published'
                ? 'Save draft & take offline'
                : 'Save draft'}
            </button>
            {canPublish && (
              <button
                type="button"
                onClick={submitSchedule}
                disabled={!canSubmit || !publishAt || saving}
                className={buttonWarn}
              >
                Schedule
              </button>
            )}
            {canPublish && (
              <button
                type="button"
                onClick={submitPublish}
                disabled={!canSubmit || saving}
                className={buttonPrimary}
              >
                {saving ? 'Saving…' : shownStatus === 'published' ? 'Save changes' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] text-red-700"
        >
          {error}
        </div>
      )}

      {!canPublish && mode === 'edit' && savedStatus === 'published' && (
        <p className="mt-4 max-w-[46rem] rounded-2xl border border-[#E7C9A9] bg-[#FBF1E4] px-4 py-3 font-[family-name:var(--font-body)] text-[0.85rem] leading-relaxed text-[#754A21]">
          This post is live. Saving your edits will save it as a draft and take it offline. Request
          Publish content access to keep it live.
        </p>
      )}

      {/* ── Tabs ────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Post sections"
        className="mt-4 flex gap-1.5 overflow-x-auto border-b border-charcoal/10 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              onClick={() => changeTab(tab.id)}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold transition-colors ${
                active
                  ? 'bg-deep-green text-white'
                  : 'text-charcoal/60 hover:bg-mint/60 hover:text-deep-green'
              }`}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span aria-hidden="true" className={active ? 'text-white/80' : 'text-charcoal/45'}>
                  · {tab.count}
                </span>
              )}
              {tab.error && (
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    active ? 'bg-[#F2B27A]' : 'bg-[#C2703A]'
                  }`}
                />
              )}
              {tab.error && <span className="sr-only">needs attention</span>}
            </button>
          );
        })}
      </div>

      {/* ── Body and rail ───────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {activeTab === 'basics' && (
          <div className="lg:hidden">
            <details className="rounded-[20px] bg-white shadow-card">
              <summary className="flex min-h-[44px] cursor-pointer items-center justify-between px-5 py-4 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-charcoal">
                Ready to publish?
                <span className="font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/45">
                  {missingChecks.length === 0
                    ? 'All checked'
                    : `${missingChecks.length} to check`}
                </span>
              </summary>
              <div className="px-4 pb-4">{rail}</div>
            </details>
          </div>
          )}

          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className="space-y-5"
          >
            {activeTab === 'basics' && (
              <>
                <Card title="Basics" description="What this is, and what it is called.">
                  <div className="space-y-5">
                    <div>
                      <span className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-2">
                        Type
                      </span>
                      <div
                        className="inline-flex rounded-full bg-cream/70 p-1"
                        role="group"
                        aria-label="Post type"
                      >
                        {(
                          [
                            { id: 'blog', label: 'Blog post' },
                            { id: 'event', label: 'Event' },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={type === option.id}
                            onClick={() => setType(option.id)}
                            className={`min-h-[44px] rounded-full px-5 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold transition-colors ${
                              type === option.id
                                ? 'bg-deep-green text-white shadow-sm'
                                : 'text-charcoal/60 hover:text-deep-green'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                        {type === 'event'
                          ? 'Something with a date and a place. Adds Event details and Registration.'
                          : 'An article, guide or announcement.'}
                      </p>
                    </div>

                    <Field label="Title" htmlFor="post-title" hint="What the post is about, in one line.">
                      <input
                        id="post-title"
                        type="text"
                        value={title}
                        onChange={(event) => handleTitle(event.target.value)}
                        maxLength={160}
                        placeholder={
                          type === 'event' ? 'e.g. HR Leaders Roundtable' : 'e.g. New payroll guidance for 2026'
                        }
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
                          /{section}/{slugify(slug)} is already a page built into the site, and that page
                          keeps the URL. Choose a different slug or this post will not be reachable.
                        </p>
                      )}
                    </Field>

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
                      <p className="mt-1.5 text-right font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/40">
                        {excerpt.length}/400
                      </p>
                    </Field>
                  </div>
                </Card>

                {type === 'blog' && (
                  <Card title="Filing" description="How the post is grouped, and where it points.">
                    <div className="space-y-5">
                      <Field
                        label="Category"
                        htmlFor="post-category"
                        hint="The topic the post is filed under."
                      >
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

                      <fieldset className="border-0 p-0 m-0">
                        <legend className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal mb-1">
                          External link{' '}
                          <span className="font-normal text-charcoal/45">(optional)</span>
                        </legend>
                        <p className="mb-3 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                          Shown as a button at the end of the post.
                        </p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    </div>
                  </Card>
                )}
              </>
            )}

            {activeTab === 'event' && type === 'event' && (
              <Card title="Event details" description="When and where it happens. Lagos time.">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Starts" htmlFor="event-start" hint="Lagos time. Stored as UTC.">
                      <input
                        id="event-start"
                        type="datetime-local"
                        value={eventStart}
                        onChange={(event) => setEventStart(event.target.value)}
                        onBlur={() => markTouched('eventStart')}
                        aria-invalid={eventStartInvalid}
                        aria-describedby={
                          eventStartInvalid && show('eventStart') ? 'event-start-error' : undefined
                        }
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
                        aria-describedby={
                          eventEndInvalid && show('eventEnd') ? 'event-end-error' : undefined
                        }
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
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
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
                    <p className="ml-7 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
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
                        aria-describedby={
                          locationMissing && show('location') ? 'event-location-error' : undefined
                        }
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
                </div>
              </Card>
            )}

            {activeTab === 'speakers' && (
              <SpeakerPanel
                showSpeakers={showSpeakers}
                onToggle={setShowSpeakers}
                speakers={speakers}
                selectedKey={selectedSpeaker}
                form={speakerForm}
                formRef={speakerFormRef}
                nameRef={speakerNameRef}
                error={speakerError}
                uploadError={speakerUploadError}
                uploading={speakerUploading}
                photoDragging={photoDragging}
                fileInputRef={speakerFileRef}
                onPhotoDrag={setPhotoDragging}
                onPhoto={handleSpeakerPhoto}
                onOpen={openSpeaker}
                onAdd={openAddSpeaker}
                onRemove={removeSpeaker}
                onMove={moveSpeaker}
                onDragStart={setDragIndex}
                onDrop={dropOn}
                onFormChange={updateSpeakerForm}
                onSave={saveSpeakerForm}
                onCancel={closeSpeakerForm}
              />
            )}

            {activeTab === 'registration' && type === 'event' && (
              <Card
                title="Registration"
                description="The link and the form this event collects answers with."
              >
                <div className="space-y-5">
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

                  <div>
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
              </Card>
            )}

            {activeTab === 'content' && (
              <Card title="Content" description="The article itself. Blank line starts a new paragraph.">
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="post-body"
                      className="font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal"
                    >
                      Body
                    </label>
                    <div className="flex gap-1 rounded-full bg-cream/60 p-1">
                      <Toggle active={!previewing} onClick={() => setPreviewing(false)}>
                        Write
                      </Toggle>
                      <Toggle active={previewing} onClick={() => setPreviewing(true)}>
                        Preview
                      </Toggle>
                    </div>
                  </div>
                  <p className="mb-2 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                    ## Heading, ### Subheading, - bullet, 1. numbered, **bold**, *italic*,
                    [label](https://…). Blank line for a new paragraph.
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
                      rows={16}
                      placeholder="Write the post…"
                      className={`${inputClass} font-[family-name:var(--font-body)] leading-relaxed`}
                    />
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'cover' && (
              <Card title="Cover image" description="Optional. Used on the page and every card that lists it.">
                <div>
                  <p className="mb-3 font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                    JPG, PNG or WebP up to 5 MB. Converted to WebP in your browser and stored at two
                    sizes: the grid uses the thumbnail, the page uses the full one.
                  </p>

                  {coverImageUrl ? (
                    <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-cream/40">
                      <div className="aspect-[16/9] bg-mint">
                        <img
                          src={coverImageThumbUrl ?? coverImageUrl}
                          alt="Cover image preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3 p-4">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={buttonOutline}
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={clearCover}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-200 bg-white px-5 font-[family-name:var(--font-body)] text-[0.85rem] font-semibold text-red-600 transition-colors hover:bg-red-50"
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
                      className="w-full cursor-pointer rounded-2xl border-2 border-dashed border-charcoal/15 bg-cream/30 px-6 py-10 text-center transition-colors hover:border-brand-green hover:bg-mint/30 disabled:cursor-wait disabled:opacity-70"
                    >
                      {uploading ? (
                        <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/60">
                          Uploading… {uploadProgress}%
                        </span>
                      ) : (
                        <span className="font-[family-name:var(--font-body)] text-sm text-charcoal/60">
                          <span className="font-semibold text-deep-green">Choose an image</span> or drop
                          one here
                        </span>
                      )}
                    </button>
                  )}

                  {uploading && (
                    <div
                      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-charcoal/10"
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
                    <p
                      role="alert"
                      className="mt-2 font-[family-name:var(--font-body)] text-[0.82rem] text-red-600"
                    >
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
              </Card>
            )}
          </div>
        </div>

        <aside className="hidden w-[290px] shrink-0 lg:sticky lg:top-[6.5rem] lg:block">
          {rail}
        </aside>
      </div>

      {/* Below 768px the two decisions that matter stay under the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-charcoal/10 bg-[#F5F0E7]/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={submitDraft}
          disabled={!canSubmit || saving}
          className={`${buttonOutline} flex-1`}
        >
          Save draft
        </button>
        {canPublish ? (
          <button
            type="button"
            onClick={submitPublish}
            disabled={!canSubmit || saving}
            className={`${buttonPrimary} flex-1`}
          >
            {saving ? 'Saving…' : shownStatus === 'published' ? 'Save changes' : 'Publish'}
          </button>
        ) : (
          <span className="flex-1 self-center text-center font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/50">
            Publish needs access
          </span>
        )}
      </div>

      {previewOpen && previewSpeakers.length > 0 && (
        <Suspense fallback={null}>
          <SpeakerCarousel
            speakers={previewSpeakers}
            startIndex={0}
            onClose={() => setPreviewOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ── The speakers tab ──────────────────────────────────────────────────── */

function SpeakerPanel({
  showSpeakers,
  onToggle,
  speakers,
  selectedKey,
  form,
  formRef,
  nameRef,
  error,
  uploadError,
  uploading,
  photoDragging,
  fileInputRef,
  onPhotoDrag,
  onPhoto,
  onOpen,
  onAdd,
  onRemove,
  onMove,
  onDragStart,
  onDrop,
  onFormChange,
  onSave,
  onCancel,
}: {
  showSpeakers: boolean;
  onToggle: (value: boolean) => void;
  speakers: SpeakerItem[];
  selectedKey: string | null;
  form: SpeakerFormState | null;
  formRef: React.RefObject<HTMLDivElement | null>;
  nameRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
  uploadError: string | null;
  uploading: boolean;
  photoDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPhotoDrag: (dragging: boolean) => void;
  onPhoto: (file: File | undefined) => void;
  onOpen: (speaker: SpeakerItem) => void;
  onAdd: () => void;
  onRemove: (speaker: SpeakerItem) => void;
  onMove: (index: number, delta: number) => void;
  onDragStart: (index: number | null) => void;
  onDrop: (index: number) => void;
  onFormChange: (patch: Partial<SpeakerDraftInput>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const photo = form ? form.values.photoThumbUrl ?? form.values.photoUrl : null;

  return (
    <Card
      title="Speakers"
      description="Shown on the post as a pop-out carousel. Drag to reorder."
      action={
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 font-[family-name:var(--font-body)] text-[0.85rem] font-semibold text-charcoal/70">
          <span>Show section</span>
          <input
            type="checkbox"
            checked={showSpeakers}
            onChange={(event) => onToggle(event.target.checked)}
            className="h-5 w-5 cursor-pointer accent-deep-green"
          />
          <span className="text-deep-green">{showSpeakers ? 'On' : 'Off'}</span>
        </label>
      }
    >
      {speakers.length === 0 && !form && (
        <p className="mb-4 font-[family-name:var(--font-body)] text-[0.85rem] leading-relaxed text-charcoal/50">
          No speakers yet. Add up to {MAX_SPEAKERS}; the post keeps its usual layout until there is
          one.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {speakers.map((speaker, index) => {
          const selected = selectedKey === speaker.key;
          const avatar = speaker.photoThumbUrl ?? speaker.photoUrl;
          return (
            <li
              key={speaker.key}
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(event) => event.preventDefault()}
              onDragEnd={() => onDragStart(null)}
              onDrop={(event) => {
                event.preventDefault();
                onDrop(index);
              }}
              className={`min-h-[64px] rounded-[16px] border bg-white p-3 transition-colors ${
                selected
                  ? 'border-brand-green ring-2 ring-brand-green/20'
                  : 'border-charcoal/12 hover:border-brand-green/50'
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(speaker)}
                  className="flex min-h-[44px] min-w-0 flex-1 basis-full items-center gap-3 text-left"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint font-[family-name:var(--font-heading)] text-base font-semibold text-deep-green">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${speaker.photoFocusX}% ${speaker.photoFocusY}%`,
                        }}
                      />
                    ) : (
                      speakerInitial(speaker.name)
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-charcoal">
                      {speaker.name || 'Untitled speaker'}
                    </span>
                    <span className="block truncate font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/55">
                      {[speaker.role, speaker.organisation].filter(Boolean).join(', ') || 'Role not set'}
                    </span>
                  </span>
                </button>

                <div className="ml-auto flex items-center gap-1">
                  {selected ? (
                    <span className="px-2 font-[family-name:var(--font-body)] text-[0.78rem] font-semibold text-brand-green">
                      Editing
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpen(speaker)}
                      className="min-h-[44px] rounded-full px-3 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green hover:bg-mint/60"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(speaker)}
                    className="min-h-[44px] rounded-full px-3 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onMove(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${speaker.name || 'speaker'} up`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal/50 hover:bg-mint/60 hover:text-deep-green disabled:opacity-30"
                    >
                      <span aria-hidden="true">▲</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(index, 1)}
                      disabled={index === speakers.length - 1}
                      aria-label={`Move ${speaker.name || 'speaker'} down`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal/50 hover:bg-mint/60 hover:text-deep-green disabled:opacity-30"
                    >
                      <span aria-hidden="true">▼</span>
                    </button>
                  </span>
                </div>
              </div>
            </li>
          );
        })}

        {speakers.length < MAX_SPEAKERS && (
          <li className="min-h-[64px]">
            <button
              type="button"
              onClick={onAdd}
              className="flex min-h-[64px] w-full items-center justify-center rounded-[16px] border-2 border-dashed border-charcoal/20 bg-cream/20 px-4 font-[family-name:var(--font-body)] text-[0.92rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint/30"
            >
              + Add speaker
            </button>
          </li>
        )}
      </ul>

      {form && (
        <div ref={formRef} className="mt-6 scroll-mt-40 border-t border-charcoal/10 pt-6">
          <h4 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal">
            {form.mode === 'edit' ? 'Edit speaker' : 'Add speaker'}
          </h4>

          <div className="mt-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-4 sm:grid-cols-[170px_1fr_1fr] sm:gap-x-4">
            <div className="row-span-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  onPhotoDrag(true);
                }}
                onDragLeave={() => onPhotoDrag(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  onPhotoDrag(false);
                  onPhoto(event.dataTransfer.files?.[0]);
                }}
                className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors sm:h-[150px] sm:w-[150px] ${
                  photoDragging
                    ? 'border-brand-green bg-mint/40'
                    : 'border-charcoal/20 bg-cream/30 hover:border-brand-green'
                }`}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${form.values.photoFocusX}% ${form.values.photoFocusY}%`,
                    }}
                  />
                ) : (
                  <span className="px-2 font-[family-name:var(--font-body)] text-[0.72rem] leading-tight text-charcoal/50">
                    {uploading ? 'Uploading…' : 'Add photo'}
                    <span className="mt-1 block text-[0.62rem] text-charcoal/35">JPG, PNG, WebP</span>
                  </span>
                )}
              </button>
              {form.values.photoUrl && (
                <button
                  type="button"
                  onClick={() => onFormChange({ photoUrl: null, photoThumbUrl: null })}
                  className="mt-1 min-h-[44px] w-20 font-[family-name:var(--font-body)] text-[0.7rem] font-semibold text-red-600 sm:w-[150px]"
                >
                  Remove photo
                </button>
              )}
            </div>

            <Field label="Name" htmlFor="speaker-name" className="min-w-0">
              <input
                ref={nameRef}
                id="speaker-name"
                type="text"
                value={form.values.name}
                onChange={(event) => onFormChange({ name: event.target.value })}
                maxLength={80}
                placeholder="Speaker name"
                className={inputClass}
              />
            </Field>
            <Field label="Role" htmlFor="speaker-role" className="min-w-0">
              <input
                id="speaker-role"
                type="text"
                value={form.values.role ?? ''}
                onChange={(event) => onFormChange({ role: event.target.value })}
                maxLength={80}
                placeholder="Role"
                className={inputClass}
              />
            </Field>
            <Field
              label="Organisation"
              htmlFor="speaker-organisation"
              className="col-span-2 sm:col-span-1"
            >
              <input
                id="speaker-organisation"
                type="text"
                value={form.values.organisation ?? ''}
                onChange={(event) => onFormChange({ organisation: event.target.value })}
                maxLength={120}
                placeholder="Organisation"
                className={inputClass}
              />
            </Field>
            <Field
              label="LinkedIn (optional)"
              htmlFor="speaker-linkedin"
              className="col-span-2 sm:col-span-1"
            >
              <input
                id="speaker-linkedin"
                type="url"
                value={form.values.linkedinUrl ?? ''}
                onChange={(event) => onFormChange({ linkedinUrl: event.target.value })}
                maxLength={300}
                placeholder="https://www.linkedin.com/in/…"
                className={inputClass}
              />
            </Field>
            <Field
              label="Short bio"
              htmlFor="speaker-bio"
              className="col-span-2 sm:col-span-2"
              hint="Two or three sentences shown in the carousel."
            >
              <textarea
                id="speaker-bio"
                value={form.values.bio ?? ''}
                onChange={(event) => onFormChange({ bio: event.target.value.slice(0, BIO_MAX) })}
                maxLength={BIO_MAX}
                rows={4}
                placeholder="Two or three sentences."
                className={inputClass}
              />
              <p className="mt-1 text-right font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/40">
                {(form.values.bio ?? '').length}/{BIO_MAX}
              </p>
            </Field>
          </div>

          {form.values.photoUrl && (
            <FocusPicker
              photoUrl={form.values.photoUrl}
              x={form.values.photoFocusX}
              y={form.values.photoFocusY}
              onChange={onFormChange}
            />
          )}

          {error && (
            <p role="alert" className="mt-3 font-[family-name:var(--font-body)] text-[0.82rem] font-medium text-red-600">
              {error}
            </p>
          )}
          {uploadError && (
            <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-[0.82rem] text-red-600">
              {uploadError}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onCancel} className={`${buttonOutline} flex-1 sm:flex-none`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={uploading}
              className={`${buttonPrimary} flex-1 sm:flex-none`}
            >
              {form.mode === 'edit' ? (
                <>
                  <span className="sm:hidden">Save</span>
                  <span className="hidden sm:inline">Save changes</span>
                </>
              ) : (
                'Add speaker'
              )}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              onPhoto(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * Where the face is in the photo.
 *
 * The photo keeps its own shape, so the editor has to say which part the card
 * should show. Dragging the dot - or nudging it with the arrow keys - is that
 * answer, and the two previews update from the same numbers the public card and
 * avatar will use.
 */
function FocusPicker({
  photoUrl,
  x,
  y,
  onChange,
}: {
  photoUrl: string;
  x: number;
  y: number;
  onChange: (patch: Partial<SpeakerDraftInput>) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function moveTo(clientX: number, clientY: number) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const nextX = Math.round(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
    const nextY = Math.round(Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)));
    if (nextX !== x || nextY !== y) onChange({ photoFocusX: nextX, photoFocusY: nextY });
  }

  function nudge(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({
      photoFocusX: Math.min(100, Math.max(0, x + move[0])),
      photoFocusY: Math.min(100, Math.max(0, y + move[1])),
    });
  }

  const position = { objectPosition: `${x}% ${y}%` };

  return (
    <div className="mt-5 rounded-[14px] border border-charcoal/10 bg-cream/30 p-4">
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1 basis-[240px]">
          <span className="block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal">
            Focal point
          </span>
          <p className="mt-1 font-[family-name:var(--font-body)] text-[0.76rem] leading-relaxed text-charcoal/50">
            Drag the dot to the face, or use the arrow keys. The card and avatar follow it.
          </p>
          <div
            ref={frameRef}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              moveTo(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (dragging) moveTo(event.clientX, event.clientY);
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            className="relative mt-3 w-full max-w-[320px] cursor-crosshair touch-none overflow-hidden rounded-xl border border-charcoal/10 bg-charcoal/5"
          >
            <img src={photoUrl} alt="" draggable={false} className="block h-auto w-full" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-px bg-white/50"
              style={{ left: `${x}%` }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 h-px bg-white/50"
              style={{ top: `${y}%` }}
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Photo focal point"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={x}
              aria-valuetext={`${x}% across, ${y}% down`}
              onKeyDown={nudge}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="block h-4 w-4 rounded-full border-2 border-white bg-brand-green shadow-[0_0_0_2px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div>
            <span className="block font-[family-name:var(--font-body)] text-[0.7rem] font-semibold uppercase tracking-wider text-charcoal/40">
              Card
            </span>
            <div className="mt-1 h-[130px] w-[76px] overflow-hidden rounded-[10px] bg-mint">
              <img src={photoUrl} alt="" className="h-full w-full object-cover" style={position} />
            </div>
          </div>
          <div>
            <span className="block font-[family-name:var(--font-body)] text-[0.7rem] font-semibold uppercase tracking-wider text-charcoal/40">
              Avatar
            </span>
            <div className="mt-1 h-14 w-14 overflow-hidden rounded-full bg-mint">
              <img src={photoUrl} alt="" className="h-full w-full object-cover" style={position} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange({ photoFocusX: 50, photoFocusY: 25 })}
            className="min-h-[44px] rounded-full px-3 font-[family-name:var(--font-body)] text-[0.8rem] font-semibold text-deep-green hover:bg-mint/60"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-charcoal/15 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-[0.92rem] text-charcoal placeholder:text-charcoal/35 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition-colors';

const buttonBase =
  'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full px-5 font-[family-name:var(--font-body)] text-[0.88rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const buttonOutline = `${buttonBase} border border-charcoal/15 bg-white text-charcoal hover:bg-cream`;

const buttonPrimary = `${buttonBase} border border-deep-green bg-deep-green text-white hover:border-terracotta hover:bg-terracotta`;

const buttonWarn = `${buttonBase} border border-[#E7C9A9] bg-[#F8E6D6] text-[#A3571F] hover:bg-[#F3D5B6]`;

function StatusChip({ status }: { status: 'draft' | 'published' | 'scheduled' }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.68rem] font-semibold uppercase tracking-[0.1em] ${
        status === 'published'
          ? 'bg-deep-green text-white'
          : status === 'scheduled'
            ? 'bg-[#F8E6D6] text-[#A3571F]'
            : 'bg-[#EAE5DC] text-charcoal/60'
      }`}
    >
      {status === 'published' ? 'Published' : status === 'scheduled' ? 'Scheduled' : 'Draft'}
    </span>
  );
}

function Card({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] bg-white p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-heading)] text-[1.15rem] font-semibold text-charcoal">
            {title}
          </h3>
          {description && (
            <p className="mt-1 font-[family-name:var(--font-body)] text-[0.82rem] text-charcoal/50">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className = '',
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 break-all font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
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
      className={`min-h-[36px] rounded-full px-3.5 font-[family-name:var(--font-body)] text-[0.78rem] font-medium transition-colors cursor-pointer border-none ${
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
      publishAt: null,
      showSpeakers: true,
      speakers: [],
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
    publishAt: post.publish_at ? isoToLagosInput(post.publish_at) : null,
    showSpeakers: post.show_speakers,
    speakers: (post.speakers ?? []).map(speakerToDraft),
  };
}
