import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ConfirmContext,
  type ConfirmFunction,
  type ConfirmRequest,
  type ConfirmTone,
} from '../context/ConfirmContext';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const toneStyles: Record<
  ConfirmTone,
  { button: string; icon: string; iconColor: string }
> = {
  danger: {
    button: 'bg-[#b3261e] hover:bg-[#9d1f19]',
    icon: 'bg-[#fce9e8]',
    iconColor: 'text-[#b3261e]',
  },
  warning: {
    button: 'bg-[#9a6700] hover:bg-[#805600]',
    icon: 'bg-[#fff3dc]',
    iconColor: 'text-[#9a6700]',
  },
  success: {
    button: 'bg-[#0f6b50] hover:bg-[#0b5942]',
    icon: 'bg-[#e2f4ec]',
    iconColor: 'text-[#0f6b50]',
  },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ConfirmRequest | null>(null);
  const activeRef = useRef<ConfirmRequest | null>(null);
  const queueRef = useRef<ConfirmRequest[]>([]);
  const nextIdRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFunction>((options) => {
    return new Promise<boolean>((resolve) => {
      const request = { id: ++nextIdRef.current, options, resolve };
      if (!activeRef.current) {
        const element = document.activeElement;
        returnFocusRef.current = element instanceof HTMLElement ? element : null;
        activeRef.current = request;
        setActive(request);
      } else {
        queueRef.current.push(request);
      }
    });
  }, []);

  const settle = useCallback((id: number, confirmed: boolean) => {
    const current = activeRef.current;
    if (!current || current.id !== id) return;

    current.resolve(confirmed);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    if (active) return;
    const opener = returnFocusRef.current;
    returnFocusRef.current = null;
    opener?.focus();
  }, [active]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {active && <ConfirmDialog key={active.id} request={active} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  request,
  onSettle,
}: {
  request: ConfirmRequest;
  onSettle: (id: number, confirmed: boolean) => void;
}) {
  const {
    title,
    message,
    note,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger',
    requireText,
    onConfirm,
  } = request.options;
  const [typedText, setTypedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const focusableRef = useRef<HTMLInputElement>(null);
  const styles = toneStyles[tone];
  const titleId = `confirm-title-${request.id}`;
  const messageId = `confirm-message-${request.id}`;
  const textMatches = requireText === undefined || typedText.trim() === requireText.trim();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (tone === 'success' ? confirmRef.current : cancelRef.current)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [tone]);

  async function accept() {
    if (busy || !textMatches) return;
    if (!onConfirm) {
      onSettle(request.id, true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onSettle(request.id, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That action could not be completed. Try again.');
      setBusy(false);
      focusableRef.current?.focus();
    }
  }

  function cancel() {
    if (!busy) onSettle(request.id, false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="confirm-dialog-backdrop fixed inset-0 z-[var(--z-confirm-dialog)] flex items-end justify-center bg-[#0e1e1a]/50 backdrop-blur-[3px] sm:items-center sm:p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <style>{CONFIRM_DIALOG_CSS}</style>
      <div
        ref={dialogRef}
        role={tone === 'success' ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="confirm-dialog-panel w-full rounded-t-[24px] bg-white px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:max-w-[440px] sm:rounded-[22px] sm:p-7"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-8 h-1.5 w-10 rounded-full bg-cream sm:hidden"
        />
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${styles.icon} ${styles.iconColor}`}>
          <ConfirmIcon tone={tone} />
        </div>
        <h2
          id={titleId}
          className="mt-5 font-[family-name:var(--font-heading)] text-[1.375rem] font-semibold leading-tight text-charcoal"
        >
          {title}
        </h2>
        <div
          id={messageId}
          className="mt-2 font-[family-name:var(--font-body)] text-[0.875rem] leading-relaxed text-charcoal/70"
        >
          {message}
        </div>
        {note && (
          <div className="mt-4 rounded-[14px] bg-cream/75 px-4 py-3 font-[family-name:var(--font-body)] text-xs leading-relaxed text-charcoal/60">
            {note}
          </div>
        )}
        {requireText !== undefined && (
          <label className="mt-4 block font-[family-name:var(--font-body)] text-xs font-medium text-charcoal/65">
            Type <span className="font-semibold text-charcoal">{requireText}</span> to continue
            <input
              ref={focusableRef}
              value={typedText}
              onChange={(event) => setTypedText(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-charcoal/15 px-3 text-sm text-charcoal outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
              autoComplete="off"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-3 font-[family-name:var(--font-body)] text-sm text-[#b3261e]">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            disabled={busy}
            className="min-h-12 rounded-full border border-cream bg-white px-6 font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal transition-colors hover:bg-cream/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 sm:min-h-11"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void accept()}
            disabled={busy || !textMatches}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-[family-name:var(--font-body)] text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-11 ${styles.button}`}
          >
            {busy && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmIcon({ tone }: { tone: ConfirmTone }) {
  if (tone === 'success') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }
  if (tone === 'warning') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
        <path d="M3.3 20.7a1 1 0 0 0 1.4 0L17 8.4l-3.4-3.4L1.3 17.3a1 1 0 0 0 0 1.4l2 2ZM20.7 5.3l-2-2a2 2 0 0 0-2.8 0l-1 1 4.8 4.8 1-1a2 2 0 0 0 0-2.8Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
      <path d="M3 7h18" />
    </svg>
  );
}

const CONFIRM_DIALOG_CSS = `
@keyframes confirm-dialog-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes confirm-dialog-panel-in {
  from { opacity: 0; transform: scale(.97); }
  to { opacity: 1; transform: scale(1); }
}
.confirm-dialog-backdrop { animation: confirm-dialog-backdrop-in 180ms ease-out both; }
.confirm-dialog-panel { animation: confirm-dialog-panel-in 180ms ease-out both; }
@media (max-width: 639px) {
  @keyframes confirm-dialog-sheet-in {
    from { opacity: .8; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .confirm-dialog-panel { animation: confirm-dialog-sheet-in 180ms ease-out both; }
}
@media (prefers-reduced-motion: reduce) {
  .confirm-dialog-backdrop, .confirm-dialog-panel { animation: confirm-dialog-backdrop-in 120ms ease-out both; }
}
`;
