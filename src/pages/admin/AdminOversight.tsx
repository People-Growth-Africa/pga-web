import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { onSessionEnded } from '../../lib/authClient';
import { livePostPath } from '../../lib/published';
import PostEditor from './PostEditor';
import {
  createPost,
  deletePost,
  listContent,
  pingSession,
  setPostStatus,
  updatePost,
  uploadCover,
  type AdminCategory,
  type AdminPost,
  type PostDraft,
  type PostType,
} from './oversightClient';

/* Row actions read as buttons, not as prose: the same pill shapes the content
   desk uses, so the two panels feel like one product. */
const smallOutline =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-charcoal/15 bg-white px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint';

const smallPrimary =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-deep-green bg-deep-green px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta';

const smallDanger =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-red-200 bg-white px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-red-600 transition-colors hover:bg-red-50';

type View = 'list' | 'create' | 'edit';

/**
 * /admin/oversight - the administrator's content oversight screen.
 *
 * It deliberately uses its own page and the /api/admin/* oversight endpoints,
 * never the content manager's /content page or /api/content/* routes. The role
 * is checked again by `requireAdmin` on every request; this page is only what
 * an administrator sees.
 */
export default function AdminOversight() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<AdminPost | null>(null);
  const [createType, setCreateType] = useState<PostType>('blog');
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/oversight' },
    });
  }, [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const refresh = useCallback(async () => {
    const result = await listContent({});
    if (!result.ok) {
      setError(result.failure.error);
      setLoading(false);
      return;
    }
    setPosts(result.data.posts);
    setCategories(result.data.categories);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Writing an article for an hour sends no requests, and a staff session ends
  // after thirty minutes without one. Real interaction is what says otherwise,
  // so the save at the end of a long edit is not the first request in half an
  // hour - which the server would answer with a 401 and a lost draft.
  useEffect(() => {
    let lastPing = Date.now();
    const ping = () => {
      const now = Date.now();
      if (now - lastPing < 5 * 60 * 1000) return;
      lastPing = now;
      void pingSession();
    };
    const events = ['pointerdown', 'keydown', 'focus'] as const;
    for (const event of events) window.addEventListener(event, ping);
    return () => {
      for (const event of events) window.removeEventListener(event, ping);
    };
  }, []);

  async function save(draft: PostDraft) {
    setSaving(true);
    setEditorError(null);
    const result = editing ? await updatePost(editing.id, draft) : await createPost(draft);
    setSaving(false);
    if (!result.ok) {
      setEditorError(result.failure.fields?.slug ?? result.failure.error);
      return;
    }
    await refresh();
    setView('list');
    setEditing(null);
    setNotice(draft.status === 'published' ? 'Published.' : 'Saved as a draft.');
  }

  async function toggle(post: AdminPost) {
    const next = post.status === 'published' ? 'draft' : 'published';
    const result = await setPostStatus(post.id, next);
    if (!result.ok) {
      setNotice(result.failure.error);
      return;
    }
    await refresh();
    setNotice(next === 'published' ? 'Republished.' : 'Unpublished.');
  }

  async function remove(post: AdminPost) {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    const result = await deletePost(post.id);
    if (!result.ok) {
      setNotice(result.failure.error);
      return;
    }
    await refresh();
    setNotice('Deleted.');
  }

  return (
    <>
      <SEO title="Content oversight | People Growth Africa" description="Admin content oversight." />
      <AdminShell
        title={view === 'list' ? 'Content oversight' : editing ? 'Edit post' : 'New post'}
        subtitle="Every event, blog post and announcement. Only administrators can change this content."
        actions={
          view === 'list' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreateType('event');
                  setView('create');
                }}
                className={secondaryAction}
              >
                New event
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreateType('blog');
                  setView('create');
                }}
                className={primaryAction}
              >
                New post
              </button>
            </>
          ) : null
        }
      >
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-[12px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal"
          >
            {notice}
          </p>
        )}

        {view !== 'list' ? (
          <PostEditor
            key={editing?.id ?? `new-${createType}`}
            mode={view === 'create' ? 'create' : 'edit'}
            post={editing}
            initialType={createType}
            categories={categories}
            saving={saving}
            error={editorError}
            onCancel={() => {
              setView('list');
              setEditing(null);
              setEditorError(null);
            }}
            onSubmit={(draft) => void save(draft)}
            onAddCategory={async () => null}
            uploadCover={uploadCover}
          />
        ) : loading ? (
          <p className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/50">
            Loading content…
          </p>
        ) : posts.length === 0 ? (
          <p className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/50">
            No posts or events yet.
          </p>
        ) : (
          <ul className="space-y-3.5">
            {posts.map((post) => {
              const published = post.status === 'published';
              return (
                <li
                  key={post.id}
                  className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:px-6"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2.5">
                        <PublishBadge published={published} />
                        <TypeBadge type={post.type} />
                        <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                          {published ? 'Live on the site' : 'Not published'}
                        </span>
                      </div>
                      <h2 className="break-words font-[family-name:var(--font-heading)] text-[1.25rem] font-semibold leading-snug text-charcoal sm:text-[1.35rem]">
                        {post.title}
                      </h2>
                      <p className="mt-1 break-all font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/45">
                        /{post.type}/{post.slug}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(post);
                          setEditorError(null);
                          setView('edit');
                        }}
                        className={smallOutline}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggle(post)}
                        className={published ? smallOutline : smallPrimary}
                      >
                        {published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button type="button" onClick={() => void remove(post)} className={smallDanger}>
                        Delete
                      </button>
                      {published && (
                        <a
                          href={livePostPath(post)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[38px] items-center rounded-full px-3 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green underline decoration-brand-green/40 underline-offset-2 hover:bg-mint"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminShell>
    </>
  );
}

function PublishBadge({ published }: { published: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${
        published ? 'bg-mint text-deep-green' : 'bg-[#EAE5DC] text-charcoal/55'
      }`}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${
        type === 'event' ? 'bg-[#F8E6D6] text-[#A3571F]' : 'bg-[#F3EBDD] text-[#8B6A40]'
      }`}
    >
      {type}
    </span>
  );
}

/* The same rounded action blocks the Data page uses in its header. */
const secondaryAction =
  'inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[10px] border border-charcoal/10 bg-white px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint';

const primaryAction =
  'inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta';
