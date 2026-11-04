export type ConfirmationMessagePart =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const LINK_TOKEN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi;

function isSafeLink(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function parseConfirmationMessage(message: string): ConfirmationMessagePart[] {
  if (!message) return [];

  const parts: ConfirmationMessagePart[] = [];
  let cursor = 0;
  let foundLink = false;

  LINK_TOKEN.lastIndex = 0;
  for (let match = LINK_TOKEN.exec(message); match !== null; match = LINK_TOKEN.exec(message)) {
    const [, label, href] = match;
    if (!isSafeLink(href)) continue;

    if (match.index > cursor) {
      parts.push({ type: 'text', value: message.slice(cursor, match.index) });
    }
    parts.push({ type: 'link', value: label, href });
    cursor = match.index + match[0].length;
    foundLink = true;
  }

  if (cursor < message.length) {
    parts.push({ type: 'text', value: message.slice(cursor) });
  }

  return foundLink ? parts : [{ type: 'text', value: message }];
}
