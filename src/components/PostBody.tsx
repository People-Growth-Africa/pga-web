import type { ReactNode } from 'react';

/**
 * Renders a manager-written post or event body.
 *
 * The same job as `SafeContent`, with two more block types. `SafeContent` is
 * also the renderer for sheet content that predates this feature, and widening
 * it would quietly change how those existing posts are drawn - a sheet cell
 * containing a line that happens to start with "- " would suddenly become a
 * list. So this is a second renderer with the same rules, used only for
 * manager-written posts, and the old one is left exactly as it was.
 *
 * Safety is identical and is the whole point: every node is created here as a
 * React element. The body is never handed to `dangerouslySetInnerHTML` and is
 * never parsed as HTML, so a post body cannot carry a script, an event handler
 * or an <iframe>. Even a link target is restricted to http(s) with no
 * credentials, so `javascript:` cannot survive being written into a post.
 *
 * Supported, all of it as text a person typed:
 *   ## Heading      ### Heading
 *   - bullet        1. numbered
 *   **bold**  *italic*  [label](https://…)
 *   blank line between paragraphs; one line break inside a paragraph is kept.
 */

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
const LINK_TOKEN = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;
const ORDERED_ITEM = /^(\d+)\.\s+(.*)$/;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;

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

/** One block of the body, decided by what its first line looks like. */
type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

/** Splits on blank lines, then classifies each chunk from its first line. */
function toBlocks(body: string): Block[] {
  const chunks = body
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const blocks: Block[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim());

    if (lines[0]?.startsWith('## ')) {
      blocks.push({ kind: 'heading', level: 2, text: lines[0].slice(3).trim() });
      continue;
    }
    if (lines[0]?.startsWith('### ')) {
      blocks.push({ kind: 'heading', level: 3, text: lines[0].slice(4).trim() });
      continue;
    }

    const unordered = lines.every((line) => UNORDERED_ITEM.test(line));
    const ordered = lines.every((line) => ORDERED_ITEM.test(line));

    if (unordered) {
      blocks.push({ kind: 'list', ordered: false, items: lines.map((line) => UNORDERED_ITEM.exec(line)?.[1] ?? line) });
      continue;
    }
    if (ordered) {
      blocks.push({ kind: 'list', ordered: true, items: lines.map((line) => ORDERED_ITEM.exec(line)?.[2] ?? line) });
      continue;
    }

    // Anything else is a paragraph. A single newline inside it is kept as a
    // line break, which is how most people write when they paste a note in.
    blocks.push({ kind: 'paragraph', lines });
  }

  return blocks;
}

export default function PostBody({ body, className = '' }: { body: string; className?: string }) {
  const blocks = toBlocks(body);

  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const key = `b${index}`;

        if (block.kind === 'heading') {
          return block.level === 2 ? (
            <h2
              key={key}
              className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mt-10 mb-4"
            >
              {block.text}
            </h2>
          ) : (
            <h3
              key={key}
              className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mt-8 mb-3"
            >
              {block.text}
            </h3>
          );
        }

        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={key}
              className={`mb-5 space-y-2 ${block.ordered ? 'list-decimal' : 'list-disc'} pl-6`}
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={`${key}-${itemIndex}`}
                  className="font-[family-name:var(--font-body)] text-[1.02rem] leading-[1.8] text-charcoal/70"
                >
                  {renderInline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </Tag>
          );
        }

        return (
          <p
            key={key}
            className="mb-5 whitespace-pre-line font-[family-name:var(--font-body)] text-[1.02rem] leading-[1.8] text-charcoal/70"
          >
            {renderInline(block.lines.join('\n'), key)}
          </p>
        );
      })}
    </div>
  );
}
