import { useEffect, useRef, useState } from 'react';
import { COPIED_FEEDBACK_MS, copyText } from '../lib/clipboard';

const SITE_URL = 'https://www.peoplegrowthafrica.com';

function eventUrl(slug: string): string {
  return `${SITE_URL}/events/${slug}`;
}

type Props = {
  slug: string;
  title: string;
  /** The page shows a labelled button; the card uses the square icon. */
  labelled?: boolean;
};

/** Share the event's canonical page, using the phone's share sheet where it exists. */
export default function EventShareButton({ slug, title, labelled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<number | null>(null);
  const url = eventUrl(slug);

  // The confirmation is a moment, not a state: put the row back once it has
  // been read, and clear the timer if the card unmounts first.
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // The visitor dismissed the sheet; the menu is still a useful fallback.
      }
    }
    setOpen((current) => !current);
    setCopied(false);
  }

  async function copy() {
    try {
      await copyText(url);
    } catch {
      setOpen(false);
      return;
    }
    setCopied(true);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const x = `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        onClick={() => void share()}
        aria-label="Share this event"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center justify-center gap-2 border border-brand-green/30 bg-white text-deep-green transition-colors hover:border-brand-green hover:bg-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 cursor-pointer ${
          labelled
            ? 'rounded-full px-5 py-3 font-[family-name:var(--font-body)] text-sm font-semibold'
            : 'h-12 w-12 rounded-[14px]'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2 stroke-linecap-round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        </svg>
        {labelled && 'Share event'}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Share this event"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-charcoal/10 bg-white p-1.5 shadow-elevated"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void copy()}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left font-[family-name:var(--font-body)] text-sm hover:bg-cream focus:outline-none focus-visible:bg-cream cursor-pointer ${
              copied ? 'font-semibold text-brand-green' : 'text-charcoal'
            }`}
          >
            {copied ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Link copied
              </span>
            ) : (
              'Copy link'
            )}
            {!copied && (
              <span className="text-[0.72rem] font-semibold text-brand-green">⌘C</span>
            )}
          </button>
          <span role="status" className="sr-only">
            {copied ? 'Link copied to the clipboard' : ''}
          </span>
          <a role="menuitem" href={whatsapp} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2.5 font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream">
            WhatsApp
          </a>
          <a role="menuitem" href={linkedin} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2.5 font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream">
            LinkedIn
          </a>
          <a role="menuitem" href={x} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2.5 font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream">
            X
          </a>
        </div>
      )}
    </div>
  );
}
