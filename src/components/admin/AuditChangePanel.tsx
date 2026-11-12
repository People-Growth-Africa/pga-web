import { useMemo, useState, type ReactNode } from 'react';

/**
 * The before/after view for one audit row.
 *
 * Audit records store field-level snapshots, not display text. This turns a
 * snapshot pair into readable fields: strings are diffed word by word, arrays
 * (an email template's paragraphs, for example) are compared paragraph by
 * paragraph, and unchanged values collapse into one line. Nothing is rendered
 * as JSON, and secrets are never shown.
 */

type AuditChangeRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const SECRET_KEY =
  /(password|passwd|token|secret|api[_-]?key|authorization|cookie|hash|private[_-]?key|session)/i;

const FIELD_LABELS: Record<string, string> = {
  subject: 'Subject',
  paragraphs: 'Paragraph',
  role: 'Role',
  is_super_admin: 'Super administrator',
  status: 'Status',
  published: 'Published',
  internal_notes_changed: 'Internal notes',
  assigned_to: 'Assigned to',
  dataset: 'Dataset',
  rowCount: 'Row count',
  filters: 'Filters',
  expires_at: 'Expires at',
  revoked_at: 'Revoked at',
  counts: 'Counts',
};

type Entry = {
  id: string;
  label: string;
  before: unknown;
  after: unknown;
  secret: boolean;
  kind: 'field' | 'paragraph' | 'item';
  unchanged: boolean;
};

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldLabel(action: string, key: string): string {
  const label = FIELD_LABELS[key] ?? humanize(key);
  return action.startsWith('email_template') && key !== 'paragraphs'
    ? `Email template: ${label.toLowerCase()}`
    : label;
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Readable text, never JSON. Arrays and objects become labelled lines. */
function toText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : toText(item)))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${humanize(key)}: ${toText(item)}`)
      .join('\n');
  }
  return String(value);
}

function buildEntries(row: AuditChangeRow): { changed: Entry[]; unchanged: Entry[] } {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed: Entry[] = [];
  const unchanged: Entry[] = [];

  for (const key of keys) {
    const secret = SECRET_KEY.test(key);
    const beforeValue = before[key];
    const afterValue = after[key];
    const isArray = Array.isArray(beforeValue) || Array.isArray(afterValue);

    if (isArray) {
      const beforeItems = Array.isArray(beforeValue) ? beforeValue : [];
      const afterItems = Array.isArray(afterValue) ? afterValue : [];
      const total = Math.max(beforeItems.length, afterItems.length);
      for (let index = 0; index < total; index += 1) {
        const itemBefore = beforeItems[index];
        const itemAfter = afterItems[index];
        const same = JSON.stringify(itemBefore) === JSON.stringify(itemAfter);
        const paragraph = key === 'paragraphs';
        const label = paragraph
          ? `${row.action.startsWith('email_template') ? 'Email template: ' : ''}paragraph ${index + 1} of ${total}`
          : `${humanize(key)} ${index + 1} of ${total}`;
        const entry: Entry = {
          id: `${key}:${index}`,
          label,
          before: itemBefore,
          after: itemAfter,
          secret,
          kind: paragraph ? 'paragraph' : 'item',
          unchanged: same,
        };
        (same ? unchanged : changed).push(entry);
      }
      continue;
    }

    const same = JSON.stringify(beforeValue) === JSON.stringify(afterValue);
    const entry: Entry = {
      id: key,
      label: fieldLabel(row.action, key),
      before: beforeValue,
      after: afterValue,
      secret,
      kind: 'field',
      unchanged: same,
    };
    (same ? unchanged : changed).push(entry);
  }

  return { changed, unchanged };
}

type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

function tokenize(value: string): string[] {
  return value.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * A word-level LCS. The cap keeps a pathological field from building a huge
 * table; past it the whole value is shown as removed then added, which is still
 * readable and still not a dependency.
 */
function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length === 0) return b.map((text) => ({ kind: 'added', text }));
  if (b.length === 0) return a.map((text) => ({ kind: 'removed', text }));
  if (a.length * b.length > 40_000) {
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ];
  }

  const rows = a.length + 1;
  const columns = b.length + 1;
  const dp: Uint16Array[] = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('removed', a[i]);
      i += 1;
    } else {
      push('added', b[j]);
      j += 1;
    }
  }
  while (i < a.length) push('removed', a[i++]);
  while (j < b.length) push('added', b[j++]);
  return parts;
}

/** `{{eventName}}` is a template placeholder, not prose. */
function renderText(text: string, keyPrefix: string): ReactNode {
  return text.split(/(\{\{[^{}]+\}\})/g).map((part, index) => {
    if (/^\{\{[^{}]+\}\}$/.test(part)) {
      return (
        <code
          key={`${keyPrefix}-${index}`}
          className="mx-0.5 rounded bg-deep-green/10 px-1 py-0.5 font-mono text-[0.85em] font-semibold text-deep-green"
        >
          {part}
        </code>
      );
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function EmptyMarker() {
  return (
    <span className="inline-flex items-center rounded border border-dashed border-charcoal/35 px-2 py-0.5 text-[0.72rem] font-medium text-charcoal/45">
      empty
    </span>
  );
}

function DiffSide({ parts, side }: { parts: DiffPart[]; side: 'before' | 'after' }) {
  // A before view shows the removed words, an after view the added ones;
  // unchanged words appear in both.
  const wanted = side === 'before' ? 'removed' : 'added';
  const visible = parts.filter(
    (part) => part.kind === 'same' || part.kind === wanted,
  );
  const hasChange = visible.some((part) => part.kind !== 'same');

  if (!hasChange) {
    return <>{renderText(parts.map((part) => part.text).join(''), side)}</>;
  }

  return (
    <span className="whitespace-pre-wrap">
      {visible.map((part, index) => (
        <span
          key={`${side}-${index}`}
          className={
            part.kind === 'removed'
              ? 'text-terracotta-deep line-through decoration-2'
              : part.kind === 'added'
                ? 'font-bold text-deep-green underline decoration-2 underline-offset-2'
                : undefined
          }
        >
          {renderText(part.text, `${side}-${index}`)}
        </span>
      ))}
    </span>
  );
}

function ValuePanel({
  value,
  secret,
  side,
  diff,
}: {
  value: unknown;
  secret: boolean;
  side: 'before' | 'after';
  diff: DiffPart[] | null;
}) {
  return (
    <div className="max-h-60 overflow-y-auto rounded-[12px] border border-charcoal/10 bg-white p-4 text-[0.9rem] leading-relaxed text-charcoal [overflow-wrap:anywhere]">
      {secret ? (
        <span className="inline-flex items-center rounded bg-charcoal/10 px-2 py-0.5 text-[0.72rem] font-semibold text-charcoal/60">
          redacted
        </span>
      ) : isEmptyValue(value) ? (
        <EmptyMarker />
      ) : diff ? (
        <DiffSide parts={diff} side={side} />
      ) : (
        <span className="whitespace-pre-wrap">{renderText(toText(value), side)}</span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.65rem] font-semibold">
      <span className="rounded bg-terracotta/15 px-1.5 py-0.5 text-terracotta-deep line-through">Removed</span>
      <span className="rounded bg-brand-green/15 px-1.5 py-0.5 text-deep-green underline">Added</span>
    </span>
  );
}

export default function AuditChangePanel({
  row,
  onClose,
}: {
  row: AuditChangeRow;
  onClose: () => void;
}) {
  const { changed, unchanged } = useMemo(() => buildEntries(row), [row]);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const unchangedNoun =
    unchanged.length > 0 && unchanged.every((entry) => entry.kind === 'paragraph')
      ? 'paragraphs'
      : 'fields';

  return (
    <section aria-label="Changes in this audit entry" className="w-full text-left">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-body)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-charcoal/45">
            {row.action}
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal">
            {row.entity_label ?? humanize(row.entity_type)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center rounded-full border border-deep-green px-4 py-2 font-[family-name:var(--font-body)] text-xs font-semibold text-deep-green hover:bg-deep-green hover:text-white"
        >
          Close
        </button>
      </div>

      {changed.length === 0 ? (
        <p className="rounded-[12px] border border-charcoal/10 bg-white px-4 py-5 text-sm text-charcoal/55">
          {unchanged.length > 0
            ? 'Only unchanged values were recorded for this action.'
            : 'No field-level changes were recorded for this action.'}
        </p>
      ) : (
        changed.map((entry) => {
          const beforeText = entry.secret ? '' : toText(entry.before);
          const afterText = entry.secret ? '' : toText(entry.after);
          const diff =
            entry.secret || isEmptyValue(entry.before) || isEmptyValue(entry.after)
              ? null
              : diffWords(beforeText, afterText);

          return (
            <div
              key={entry.id}
              className="mb-4 rounded-[16px] border border-charcoal/10 bg-[#F5F0E7] p-4 last:mb-0 sm:p-5"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal">
                  {entry.label}
                </h3>
                {!entry.secret && <Legend />}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 font-[family-name:var(--font-body)] text-[0.66rem] font-bold uppercase tracking-[0.14em] text-charcoal/45">
                    Before
                  </p>
                  <ValuePanel
                    value={entry.before}
                    secret={entry.secret}
                    side="before"
                    diff={diff}
                  />
                </div>
                <div>
                  <p className="mb-1.5 font-[family-name:var(--font-body)] text-[0.66rem] font-bold uppercase tracking-[0.14em] text-charcoal/45">
                    After
                  </p>
                  <ValuePanel
                    value={entry.after}
                    secret={entry.secret}
                    side="after"
                    diff={diff}
                  />
                </div>
              </div>
            </div>
          );
        })
      )}

      {unchanged.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowUnchanged((current) => !current)}
            aria-expanded={showUnchanged}
            className="inline-flex cursor-pointer items-center rounded-full border border-deep-green px-4 py-2 font-[family-name:var(--font-body)] text-xs font-semibold text-deep-green hover:bg-deep-green hover:text-white"
          >
            {showUnchanged ? 'Hide' : 'Show'} {unchanged.length} unchanged {unchangedNoun}
          </button>
          {showUnchanged && (
            <div className="mt-3 space-y-2">
              {unchanged.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[12px] border border-charcoal/10 bg-white px-4 py-3 text-sm text-charcoal/65"
                >
                  <p className="mb-1 font-[family-name:var(--font-body)] text-[0.66rem] font-bold uppercase tracking-[0.12em] text-charcoal/40">
                    {entry.label}
                  </p>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {entry.secret ? 'redacted' : isEmptyValue(entry.before) ? 'empty' : renderText(toText(entry.before), entry.id)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
