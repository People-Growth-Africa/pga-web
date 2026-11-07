import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { authRequest, onSessionEnded } from '../../lib/authClient';
import AccessRequestDialog from './AccessRequestDialog';
import {
  listAccess,
  requestAccess,
  type AccessDuration,
  type AccessOverview,
} from './AccessClient';

type EmailTemplateId =
  | 'verification' | 'password_reset' | 'password_changed' | 'staff_invite_admin'
  | 'staff_invite_content' | 'newsletter_confirmation' | 'event_registration'
  | 'lead_notification' | 'existing_account';
type ButtonStyle = 'solid-green' | 'solid-deep-green' | 'outline-green' | 'soft-mint';
type TemplateContent = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  notes: string[];
  actionLabel: string;
  actionUrl?: string;
  links: { label: string; url: string }[];
  buttonStyle: ButtonStyle;
};
type Template = { id: EmailTemplateId; label: string; securitySensitive: boolean; content: TemplateContent };

const BUTTON_STYLES: { value: ButtonStyle; label: string }[] = [
  { value: 'solid-green', label: 'Brand green' },
  { value: 'solid-deep-green', label: 'Deep green' },
  { value: 'outline-green', label: 'Green outline' },
  { value: 'soft-mint', label: 'Soft mint' },
];

const inputClass = 'min-h-[44px] w-full rounded-[10px] border border-charcoal/15 bg-white px-3.5 py-2.5 text-[0.9rem] text-charcoal focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20';
const labelClass = 'flex flex-col gap-1.5 text-[0.8rem] font-medium text-charcoal/70';

const PREVIEW_VARIABLES: Record<string, string> = {
  name: 'Ada Okafor',
  email: 'ada@example.com',
  kind: 'New enquiry',
  eventName: 'Career Advancement in Agriculture',
  eventDate: '15 November 2026',
  eventTime: '8:00 PM–10:00 PM WAT',
  eventLocation: 'Accra Centre',
  eventFormat: 'In person',
  eventUrl: 'https://www.peoplegrowthafrica.com/events/career-advancement',
  registrationAnswers: 'Full name: Ada Okafor; Areas of interest: Mentorship, Hiring',
};

function previewText(value: string): string {
  return value.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g,
    (match, key: string) => PREVIEW_VARIABLES[key] ?? match,
  );
}

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<EmailTemplateId | ''>('');
  const [draft, setDraft] = useState<TemplateContent | null>(null);
  const [paragraphsText, setParagraphsText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessOverview | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const navigate = useNavigate();

  const endSession = useCallback(() => navigate('/admin/login?expired=1', { replace: true }), [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const load = useCallback(async () => {
    const accessResult = await listAccess();
    if (!accessResult.ok) {
      setLoading(false);
      setError(accessResult.failure.error);
      return;
    }
    setAccess(accessResult.data);
    if (!accessResult.data.effectivePermissions.includes('email_template.edit')) {
      setTemplates([]);
      setLoading(false);
      setError(null);
      return;
    }

    const result = await authRequest<{ templates: Template[] }>('/api/admin/email-templates', { method: 'GET' });
    setLoading(false);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setTemplates(result.data.templates);
    setSelectedId((current) => current || result.data.templates[0]?.id || '');
    setError(null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latestRequest = useMemo(
    () =>
      [...(access?.requests ?? [])]
        .filter((request) => request.permission === 'email_template.edit')
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null,
    [access?.requests],
  );
  const hasPermission = access?.effectivePermissions.includes('email_template.edit') ?? false;

  async function submitAccessRequest(reason: string, requestedDuration: AccessDuration) {
    const result = await requestAccess({
      permission: 'email_template.edit',
      reason,
      requestedDuration,
    });
    if (result.ok) {
      setNotice('Your request was sent for review.');
      await load();
    }
    return result;
  }

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  useEffect(() => {
    const content = selected ? structuredClone(selected.content) : null;
    setDraft(content);
    setParagraphsText((content?.paragraphs ?? []).join('\n\n'));
    setNotesText((content?.notes ?? []).join('\n'));
  }, [selected]);

  function update<K extends keyof TemplateContent>(key: K, value: TemplateContent[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setNotice(null);
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const content = {
      ...draft,
      paragraphs: paragraphsText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean),
      notes: notesText.split('\n').map((note) => note.trim()).filter(Boolean),
    };
    const result = await authRequest<{ ok: boolean; message: string }>('/api/admin/email-templates', {
      method: 'PUT',
      body: { id: selected.id, content },
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.failure.error);
      return;
    }
    setTemplates((current) => current.map((item) => item.id === selected.id ? { ...item, content: structuredClone(content) } : item));
    setNotice(result.data.message);
  }

  if (loading) {
    return <AdminShell title="Email templates" subtitle="Customise transactional email copy and links."><p className="rounded-xl bg-white p-6 text-sm text-charcoal/55">Loading templates…</p></AdminShell>;
  }

  return (
    <>
      <SEO title="Email templates | People Growth Africa" description="Edit transactional email templates." />
      <AdminShell title="Email templates" subtitle="Shape the messages people receive from the site. Security links stay system-generated.">
        {error && <p role="alert" className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">{error}</p>}
        {notice && <p role="status" className="mb-5 rounded-[12px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal">{notice}</p>}
        {!access ? (
          <p role="status" className="rounded-[14px] border border-charcoal/10 bg-white p-6 text-sm text-charcoal/60">
            Email-template access could not be verified. Try refreshing the page.
          </p>
        ) : !hasPermission ? (
          <section className="flex flex-col justify-between gap-5 rounded-[14px] border border-charcoal/10 bg-white p-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-deep-green">
                Restricted feature
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">
                Email-template editing requires access
              </h2>
              {latestRequest?.status === 'pending' ? (
                <p className="mt-2 text-sm text-[#754A21]">Your request is pending review.</p>
              ) : latestRequest?.status === 'declined' ? (
                <p className="mt-2 text-sm text-terracotta">
                  Declined: {latestRequest.decision_note || 'No note was provided.'}
                </p>
              ) : latestRequest?.status === 'approved' ? (
                <p className="mt-2 text-sm text-charcoal/55">
                  Previously approved
                  {latestRequest.grant_expires_at
                    ? ` until ${formatDate(latestRequest.grant_expires_at)}`
                    : ' permanently'}
                  ; that access is no longer active.
                </p>
              ) : (
                <p className="mt-2 text-sm text-charcoal/60">
                  Request permission to review and update transactional email copy.
                </p>
              )}
            </div>
            {latestRequest?.status !== 'pending' && (
              <button
                type="button"
                onClick={() => setRequestDialogOpen(true)}
                className="inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-full border border-charcoal/15 bg-white px-4 text-sm font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint"
              >
                Request access
              </button>
            )}
          </section>
        ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="space-y-5 rounded-[16px] border border-charcoal/10 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:p-6">
            <label className={labelClass}>Email type
              <select className={inputClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value as EmailTemplateId)}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
            </label>
            {draft && selected && <>
              <label className={labelClass}>Subject<input className={inputClass} value={draft.subject} maxLength={180} onChange={(event) => update('subject', event.target.value)} /></label>
              <label className={labelClass}>Inbox preview text<input className={inputClass} value={draft.preheader} maxLength={180} onChange={(event) => update('preheader', event.target.value)} /></label>
              <label className={labelClass}>Heading<input className={inputClass} value={draft.heading} maxLength={180} onChange={(event) => update('heading', event.target.value)} /></label>
              <label className={labelClass}>Message paragraphs<textarea className={`${inputClass} min-h-36`} value={paragraphsText} onChange={(event) => { const text = event.target.value; setParagraphsText(text); update('paragraphs', text ? text.split(/\n{2,}/) : []); }} /><span className="text-[0.72rem] text-charcoal/45">Separate paragraphs with a blank line. Available placeholders are preserved, such as {'{{name}}'} and {'{{eventName}}'}.</span></label>
              {selected.id === 'event_registration' && (
                <div className="rounded-xl border border-brand-green/20 bg-mint/40 p-4 text-[0.75rem] leading-relaxed text-charcoal/70">
                  <p className="font-semibold text-deep-green">Available event placeholders</p>
                  <p className="mt-1">
                    {'{{eventName}}'}, {'{{eventDate}}'}, {'{{eventTime}}'}, {'{{eventLocation}}'}, {'{{eventFormat}}'}, {'{{eventUrl}}'}, {'{{registrationAnswers}}'}
                  </p>
                  <p className="mt-1">
                    Registration answers includes only this recipient&apos;s non-empty answers. You can use these placeholders in the subject, preview text, heading, message, notes, button, and extra links.
                  </p>
                </div>
              )}
              <label className={labelClass}>Notes<textarea className={`${inputClass} min-h-24`} value={notesText} onChange={(event) => { const text = event.target.value; setNotesText(text); update('notes', text ? text.split('\n') : []); }} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Button label<input className={inputClass} value={draft.actionLabel} maxLength={80} onChange={(event) => update('actionLabel', event.target.value)} /></label>
                <label className={labelClass}>Button appearance<select className={inputClass} value={draft.buttonStyle} onChange={(event) => update('buttonStyle', event.target.value as ButtonStyle)}>{BUTTON_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</select></label>
              </div>
              <label className={labelClass}>Button destination
                <input className={`${inputClass} disabled:bg-cream/60`} value={selected.securitySensitive ? 'Generated securely when the email is sent' : draft.actionUrl ?? ''} disabled={selected.securitySensitive} placeholder="https://… or /path" onChange={(event) => update('actionUrl', event.target.value)} />
                <span className="text-[0.72rem] text-charcoal/45">{selected.securitySensitive ? 'This link is one-time and generated by the system; it cannot be changed here.' : 'Use a same-site path or HTTPS link. Lead replies may use mailto:.'}</span>
              </label>
              <div className="space-y-3 border-t border-charcoal/10 pt-4">
                <div className="flex items-center justify-between gap-3"><h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal">Extra links</h2><button type="button" disabled={draft.links.length >= 5} onClick={() => update('links', [...draft.links, { label: '', url: '' }])} className="rounded-full border border-charcoal/15 px-3 py-2 text-xs font-semibold text-deep-green disabled:opacity-40">Add link</button></div>
                {draft.links.map((link, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"><input aria-label={`Link ${index + 1} label`} className={inputClass} value={link.label} placeholder="Link label" onChange={(event) => update('links', draft.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /><input aria-label={`Link ${index + 1} URL`} className={inputClass} value={link.url} placeholder="https://… or /path" onChange={(event) => update('links', draft.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /><button type="button" onClick={() => update('links', draft.links.filter((_, i) => i !== index))} className="rounded-[9px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Remove</button></div>)}
              </div>
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-[10px] bg-deep-green px-6 font-semibold text-white transition-colors hover:bg-brand-green disabled:opacity-60">{saving ? 'Saving…' : 'Save template'}</button>
            </>}
          </section>
          <aside className="self-start overflow-hidden rounded-[16px] border border-charcoal/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
            <div className="bg-[#0B4B3C] px-6 py-5 text-white"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Preview</p><p className="mt-1 text-sm font-medium">{previewText(draft?.subject || 'Email subject')}</p><p className="mt-1 text-xs text-white/65">{previewText(draft?.preheader ?? '')}</p></div>
            <div className="border-b-4 border-terracotta px-6 py-8"><h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal">{previewText(draft?.heading ?? '')}</h2><div className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal/75">{draft?.paragraphs.map((paragraph, index) => <p key={index}>{previewText(paragraph)}</p>)}</div>{draft?.actionLabel && <><div className={`mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold ${draft.buttonStyle === 'soft-mint' ? 'bg-mint text-deep-green' : draft.buttonStyle === 'outline-green' ? 'border border-deep-green bg-white text-deep-green' : draft.buttonStyle === 'solid-deep-green' ? 'bg-[#0F6E56] text-white' : 'bg-brand-green text-white'}`}>{previewText(draft.actionLabel)}</div>{draft.actionUrl && <p className="mt-2 break-all text-xs text-charcoal/45">{previewText(draft.actionUrl)}</p>}</>}{draft?.links.map((link, index) => <p key={index} className="mt-3 break-all text-sm text-deep-green underline">{previewText(link.label || 'Link label')} · {previewText(link.url || 'Link URL')}</p>)}{draft?.notes.length ? <div className="mt-6 rounded-xl bg-mint p-4 text-xs leading-relaxed text-deep-green">{draft.notes.map(previewText).join(' · ')}</div> : null}</div>
          </aside>
        </div>
        )}
      </AdminShell>
      {requestDialogOpen && (
        <AccessRequestDialog
          permission="email_template.edit"
          currentStatus={latestRequest?.status ?? null}
          onSubmit={submitAccessRequest}
          onCancel={() => setRequestDialogOpen(false)}
        />
      )}
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}
