import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { onSessionEnded } from '../../lib/authClient';
import PostEditor from './PostEditor';
import {
  createPost,
  deletePost,
  listContent,
  setPostStatus,
  updatePost,
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
 * /admin/oversight — the administrator's content oversight screen.
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
                className="rounded-full border border-deep-green/25 px-5 py-2.5 text-sm font-semibold text-deep-green"
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
                className="rounded-full bg-deep-green px-5 py-2.5 text-sm font-semibold text-white"
              >
                New post
              </button>
            </>
          ) : null
        }
      >
        {error && (
          <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
          />
        ) : loading ? (
          <p className="rounded-2xl border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/50">
            Loading content…
          </p>
        ) : posts.length === 0 ? (
          <p className="rounded-2xl border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/50">
            No posts or events yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-charcoal/10 bg-[#FAF8F3] text-[0.68rem] uppercase tracking-[0.12em] text-charcoal/50">
                  <th className="px-5 py-3.5 font-semibold">Title</th>
                  <th className="px-5 py-3.5 font-semibold">Type</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-charcoal/[0.07] last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-charcoal">{post.title}</p>
                      <p className="text-xs text-charcoal/45">/{post.type}/{post.slug}</p>
                    </td>
                    <td className="px-5 py-4 text-sm capitalize text-charcoal/70">{post.type}</td>
                    <td className="px-5 py-4 text-sm">
                      <span className={post.status === 'published' ? 'text-emerald-700' : 'text-charcoal/50'}>
                        {post.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
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
                          className={post.status === 'published' ? smallOutline : smallPrimary}
                        >
                          {post.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                        <button type="button" onClick={() => void remove(post)} className={smallDanger}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminShell>
    </>
  );
}
