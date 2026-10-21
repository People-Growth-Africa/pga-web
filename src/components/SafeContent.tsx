import type { ReactNode } from 'react';

/**
 * A sheet body, rendered as text plus a tiny safe markdown subset.
 *
 * The body comes from a spreadsheet cell, which means it is exactly as
 * trustworthy as anything else a stranger can type. It is never passed to
 * `dangerouslySetInnerHTML` and never parsed as HTML: `**bold**`, `*italic*` and
 * `[label](https://...)` are turned into React elements here, and anything else
 * is drawn as the literal characters the author wrote. Even the link target is
 * restricted to http(s) with no credentials, so `javascript:` cannot survive.
 *
 * Paragraphs are split on blank lines, matching the instruction to the people
 * filling the sheet. A single newline inside a paragraph is kept as a line break
 * (`whitespace-pre-line`), because that is how most social copy is written.
 */

/** Bold, italic or an http(s) link. Order matters: bold is tried before italic. */
const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

const LINK_TOKEN = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  INLINE_TOKEN.lastIndex = 0;
  for (let match = INLINE_TOKEN.exec(text); match !== null; match = INLINE_TOKEN.exec(text)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-charcoal">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('[')) {
      const link = LINK_TOKEN.exec(token);
      if (!link) {
        nodes.push(token);
      } else {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-deep-green underline decoration-brand-green/50 underline-offset-2 transition-colors hover:text-terracotta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
          >
            {link[1]}
          </a>,
        );
      }
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    cursor = match.index + token.length;
    index += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function SafeContent({ body, className = '' }: { body: string; className?: string }) {
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="mb-5 whitespace-pre-line font-[family-name:var(--font-body)] text-[1.02rem] leading-[1.8] text-charcoal/70"
        >
          {renderInline(paragraph, `p${index}`)}
        </p>
      ))}
    </div>
  );
}
