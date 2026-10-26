import { useEffect, useRef, useState } from 'react';
import { COPIED_FEEDBACK_MS, copyText } from '../lib/clipboard';

const SITE_URL = 'https://www.peoplegrowthafrica.com';

function eventUrl(slug: string): string {
  return `${SITE_URL}/events/${slug}`;
}

/**
 * Whether the operating system's sheet is the right tool for this click.
 *
 * A phone has nothing better than the sheet: it lists the apps the visitor
 * actually shares in. A desktop is the opposite - Chrome and Edge expose
 * `navigator.share`, but there is often no sheet to show, and the promise
 * resolves having drawn nothing at all. Taking that path made the button look
 * broken, so a mouse always gets the menu below instead.
 */
function hasTouchPointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
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
  const [copyFailed, setCopyFailed] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<number | null>(null);
  const url = eventUrl(slug);

  // The confirmation is a moment, not a state: put the button back once it has
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
    if (hasTouchPointer() && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Dismissing the sheet is an answer, not a failure to recover from.
        if (error instanceof Error && error.name === 'AbortError') return;
        // Anything else (no sheet on this machine, permissions) falls through
        // to the menu, which can always do the job.
      }
    }
    setCopyFailed(false);
    setOpen((current) => !current);
  }

  async function copy() {
    try {
      await copyText(url);
    } catch {
      // Say so where the action was, rather than closing as if it worked.
      setCopyFailed(true);
      return;
    }

    setCopyFailed(false);
    setCopied(true);
    setOpen(false);
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
        className={`inline-flex items-center justify-center gap-2 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 cursor-pointer ${
          copied
            ? 'border-brand-green bg-mint text-deep-green'
            : 'border-brand-green/30 bg-white text-deep-green hover:border-brand-green hover:bg-mint'
        } ${labelled ? 'rounded-full px-5 py-3 font-[family-name:var(--font-body)] text-sm font-semibold' : 'h-12 w-12 rounded-[14px]'}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2 stroke-linecap-round" aria-hidden="true">
          {copied ? (
            <polyline points="20 6 9 17 4 12" />
          ) : (
            <>
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </>
          )}
        </svg>
        {labelled && (copied ? 'Link copied' : 'Share event')}
      </button>

      {/* Always mounted: the confirmation has to be announced after the menu it
          was clicked in has closed. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Link copied to the clipboard' : ''}
      </span>

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
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream cursor-pointer"
          >
            Copy link
            <span className="text-[0.72rem] font-semibold text-brand-green">⌘C</span>
          </button>
          {copyFailed && (
            <p role="alert" className="px-3 pb-2 font-[family-name:var(--font-body)] text-[0.78rem] text-red-600">
              Couldn’t copy the link. Try again.
            </p>
          )}
          <a
            role="menuitem"
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2.5 font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream"
          >
            WhatsApp
          </a>
          <a
            role="menuitem"
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2.5 font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream"
          >
            LinkedIn
          </a>
          <a
            role="menuitem"
            href={x}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2.5 font-[family-name:var(--font-body)] text-sm text-charcoal hover:bg-cream focus:outline-none focus-visible:bg-cream"
          >
            X
          </a>
        </div>
      )}
    </div>
  );
}
