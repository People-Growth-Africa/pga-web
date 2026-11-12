/**
 * The HTML half of the transactional emails.
 *
 * Every message keeps its plain text twin and that is still what a text-only
 * client shows, what the logs print and what the tests read, so this file only
 * has to make the rich version look like the site: the same greens, a serif
 * heading, one obvious button, and the raw link underneath in case a client
 * strips the button away.
 *
 * The layout is tables with inline styles. That is not nostalgia: Gmail drops
 * <style> blocks in its mobile apps, Outlook lays mail out with Word, and flex
 * or grid simply does not exist there. A table with inline styles renders the
 * same in all of them.
 *
 * Zoho Mail's Night Mode is the awkward one: it ignores
 * @media (prefers-color-scheme: dark) and forces its own inversion. So every
 * table and cell below names both a bgcolor attribute and an inline
 * background-color, text never inherits a colour, the mark sits on a solid
 * brand fill instead of a transparent cell, and the <style> block only exists
 * as a second line of defence for Gmail web and Apple Mail.
 */

const GREEN_DEEP = '#0F6E56';
/**
 * The lighter brand green only reaches about 3:1 against white text, which is
 * below the readable threshold for a 15px button label. This darkened sibling
 * keeps the family look and clears 4.5:1.
 */
const GREEN = '#14805E';
const MINT = '#E1F5EE';
const TERRACOTTA = '#C4773B';
/** Terracotta is a fill colour; as small text on white it is too pale. */
const TERRACOTTA_INK = '#A85E28';
const CREAM = '#F2EDE4';
const WHITE = '#FFFFFF';
const CHARCOAL = '#1A1E1B';
const INK = '#4A524D';
/** Was #838B85 (about 3.2:1 on white). Small print has to stay readable. */
const MUTED = '#5B625D';
const RULE = '#E7E3DA';
const MINT_INK = '#2C5B4C';

const HEADING_FONT = "'Fraunces', Georgia, 'Times New Roman', serif";
const BODY_FONT =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Everything that reaches a template started life in a form, so nothing is raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The frame every message shares: brand band, white card, quiet footer. The
 * mark is the site's own white leaf, so a blocked image costs the leaf and not
 * the name - the wordmark under it is text.
 */
function shell(input: { preheader: string; body: string; reason: string; site: string }): string {
  const site = escapeHtml(input.site);
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>People Growth Africa</title>
    <style>
      :root { color-scheme: light only; supported-color-schemes: light only; }
      /* Gmail web and Apple Mail honour this and keep the light surfaces. Zoho
         ignores it, so every table and cell also carries bgcolor and an inline
         background-color. */
      @media (prefers-color-scheme: dark) {
        .pg-outer { background-color: ${CREAM} !important; }
        .pg-card, .pg-body, .pg-footer { background-color: ${WHITE} !important; }
        .pg-heading { color: ${CHARCOAL} !important; }
        .pg-text { color: ${INK} !important; }
        .pg-muted { color: ${MUTED} !important; }
      }
    </style>
  </head>
  <body bgcolor="${CREAM}" class="pg-outer" style="margin:0;padding:0;background-color:${CREAM};color:${CHARCOAL};">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${CREAM};">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" class="pg-outer" style="background-color:${CREAM};">
      <tr>
        <td align="center" bgcolor="${CREAM}" class="pg-outer" style="padding:28px 14px 36px;background-color:${CREAM};">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" class="pg-card" style="width:100%;max-width:600px;background-color:${WHITE};border-radius:20px;overflow:hidden;">
            <tr>
              <td align="center" bgcolor="${GREEN_DEEP}" style="background-color:${GREEN_DEEP};padding:26px 32px 22px;">
                <!-- Was: width="75" height="56" (the old 683x512 canvas). The mark file
                     is a square now, so its box is square too and the leaf is not stretched.
                     The badge keeps a solid brand fill and a light rim, so the white mark
                     never sits on a transparent surface that Zoho could paint black. -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="${GREEN_DEEP}" style="background-color:${GREEN_DEEP};">
                  <tr>
                    <td align="center" width="76" height="76" bgcolor="${GREEN_DEEP}" style="width:76px;height:76px;background-color:${GREEN_DEEP};border:1px solid #3E8A76;border-radius:16px;">
                      <img src="${site}/images/icon-white.png" alt="" width="56" height="56" style="display:block;width:56px;height:56px;border:0;outline:none;" />
                    </td>
                  </tr>
                </table>
                <p style="margin:12px 0 0;font-family:${HEADING_FONT};font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;">People Growth Africa</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="${TERRACOTTA}" style="background-color:${TERRACOTTA};height:4px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td bgcolor="${WHITE}" class="pg-body" style="background-color:${WHITE};padding:34px 32px 0;">${input.body}</td>
            </tr>
            <tr>
              <td bgcolor="${WHITE}" class="pg-footer" style="background-color:${WHITE};padding:26px 32px 34px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="background-color:${WHITE};">
                  <tr>
                    <td bgcolor="${WHITE}" class="pg-muted" style="background-color:${WHITE};border-top:1px solid ${RULE};padding-top:18px;font-family:${BODY_FONT};font-size:12.5px;line-height:1.65;color:${MUTED};">
                      ${escapeHtml(input.reason)}<br />
                      <a href="${site}" style="color:${GREEN_DEEP};text-decoration:none;font-weight:600;">peoplegrowthafrica.com</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function heading(text: string): string {
  return `<h1 class="pg-heading" style="margin:0 0 18px;font-family:${HEADING_FONT};font-size:25px;line-height:1.28;font-weight:600;color:${CHARCOAL};">${escapeHtml(text)}</h1>`;
}

function paragraph(text: string): string {
  return `<p class="pg-text" style="margin:0 0 18px;font-family:${BODY_FONT};font-size:16px;line-height:1.65;color:${INK};">${escapeHtml(text)}</p>`;
}

/**
 * A green pill. The padding lives on the anchor rather than the cell so the
 * whole shape is clickable in every client, and the link is repeated as text
 * below it because a stripped button should not leave the reader stuck.
 *
 * The anchor names its own background as well as the cell: if a dark-mode
 * client rewrites one of the two, the label still has the other to sit on.
 */
type ButtonStyle = 'solid-green' | 'solid-deep-green' | 'outline-green' | 'soft-mint';

const BUTTON_STYLE: Record<ButtonStyle, { background: string; color: string; border: string }> = {
  'solid-green': { background: GREEN, color: WHITE, border: GREEN },
  'solid-deep-green': { background: GREEN_DEEP, color: WHITE, border: GREEN_DEEP },
  'outline-green': { background: WHITE, color: GREEN_DEEP, border: GREEN_DEEP },
  'soft-mint': { background: MINT, color: MINT_INK, border: MINT },
};

function safeHref(raw: string): string | null {
  if (raw.includes('\\') || [...raw].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return escapeHtml(raw);
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:' || url.protocol === 'mailto:') return escapeHtml(raw);
  } catch {
    return null;
  }
  return null;
}

function button(action: { label: string; url: string; style?: ButtonStyle }): string {
  const safeUrl = safeHref(action.url);
  if (!safeUrl) return '';
  const style = BUTTON_STYLE[action.style ?? 'solid-green'] ?? BUTTON_STYLE['solid-green'];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${style.background}" style="margin:6px 0 0;background-color:${style.background};border-radius:100px;">
                <tr>
                  <td align="center" bgcolor="${style.background}" style="border:1px solid ${style.border};border-radius:100px;background-color:${style.background};">
                    <a href="${safeUrl}" style="display:inline-block;padding:15px 34px;font-family:${BODY_FONT};font-size:15px;font-weight:600;line-height:1;color:${style.color};text-decoration:none;border-radius:100px;background-color:${style.background};">${escapeHtml(action.label)}</a>
                  </td>
                </tr>
              </table>
              <p class="pg-muted" style="margin:18px 0 0;font-family:${BODY_FONT};font-size:12.5px;line-height:1.6;color:${MUTED};">
                Button not working? Paste this into your browser:<br />
                <a href="${safeUrl}" style="color:${GREEN_DEEP};text-decoration:none;word-break:break-all;">${escapeHtml(action.url)}</a>
              </p>`;
}

function additionalLinks(links: { label: string; url: string }[]): string {
  return links.map((link) => {
    const url = safeHref(link.url);
    if (!url) return '';
    return `<p style="margin:12px 0 0;font-family:${BODY_FONT};font-size:14px;line-height:1.5;"><a href="${url}" style="color:${GREEN_DEEP};text-decoration:underline;">${escapeHtml(link.label)}</a></p>`;
  }).join('');
}

export function renderEmailText(input: {
  paragraphs: string[];
  action?: { label: string; url: string };
  links?: { label: string; url: string }[];
  notes?: string[];
}): string {
  return [
    ...input.paragraphs,
    ...(input.action ? ['', `${input.action.label}:`, input.action.url] : []),
    ...(input.links ?? []).flatMap((link) => ['', `${link.label}:`, link.url]),
    ...(input.notes ?? []).flatMap((note) => ['', note]),
  ].join('\n');
}

/** The "expires in an hour"/"you can ignore this" details, on a mint card. */
function notes(lines: string[]): string {
  if (lines.length === 0) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MINT}" style="margin:26px 0 0;background-color:${MINT};border-radius:14px;">
                <tr>
                  <td bgcolor="${MINT}" style="padding:16px 20px;font-family:${BODY_FONT};font-size:13.5px;line-height:1.7;color:${MINT_INK};background-color:${MINT};">
                    ${lines.map(escapeHtml).join('<br />')}
                  </td>
                </tr>
              </table>`;
}

/**
 * One message: heading, a few paragraphs, at most one call to action, and the
 * small print that belongs to the flow rather than to this particular send.
 */
export function renderEmail(input: {
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string; style?: ButtonStyle };
  links?: { label: string; url: string }[];
  notes?: string[];
  reason: string;
  site: string;
}): string {
  const body = [
    heading(input.heading),
    ...input.paragraphs.map(paragraph),
    input.action ? button(input.action) : '',
    additionalLinks(input.links ?? []),
    notes(input.notes ?? []),
  ]
    .filter(Boolean)
    .join('\n              ');

  return shell({
    preheader: input.preheader,
    body: body ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="background-color:${WHITE};"><tr><td bgcolor="${WHITE}" style="padding-bottom:30px;background-color:${WHITE};">${body}</td></tr></table>` : '',
    reason: input.reason,
    site: input.site,
  });
}

// --- internal lead notifications ---------------------------------------------

/**
 * The lead routes hand their notification over as lines, the same text the
 * plain part carries, grouped by blank lines: a block of "Label: value" pairs,
 * then whatever prose the visitor wrote. Rendering those pairs as a table is
 * what makes the mail scannable without every route having to describe its own
 * fields a second time.
 */
function splitGroups(lines: string[]): string[][] {
  const groups: string[][] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      groups.push([]);
      continue;
    }
    if (groups.length === 0) groups.push([]);
    groups[groups.length - 1]?.push(line);
  }
  return groups.filter((group) => group.length > 0);
}

const PAIR = /^([^:]{1,40}):\s+(.*)$/;

function pair(line: string): { label: string; value: string } | null {
  const match = PAIR.exec(line);
  return match ? { label: match[1] ?? '', value: match[2] ?? '' } : null;
}

function detailTable(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="margin:0 0 18px;background-color:${WHITE};">
    ${rows
      .map(
        (row) => `<tr>
      <td class="pg-muted" bgcolor="${WHITE}" style="padding:9px 16px 9px 0;font-family:${BODY_FONT};font-size:13px;line-height:1.5;color:${MUTED};white-space:nowrap;vertical-align:top;background-color:${WHITE};">${escapeHtml(row.label)}</td>
      <td class="pg-text" bgcolor="${WHITE}" style="padding:9px 0;font-family:${BODY_FONT};font-size:14.5px;line-height:1.5;color:${CHARCOAL};font-weight:500;background-color:${WHITE};">${escapeHtml(row.value)}</td>
    </tr>`,
      )
      .join('\n    ')}
  </table>`;
}

/** Whatever the visitor typed, kept as typed but never as live HTML. */
function transcript(lines: string[]): string {
  const [lead, ...rest] = lines;
  const label = lead?.endsWith(':') ? lead.slice(0, -1) : null;
  const body = (label ? rest : lines).map(escapeHtml).join('<br />');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="margin:0 0 18px;background-color:${WHITE};">
                <tr>
                  <td bgcolor="${WHITE}" style="border-left:3px solid ${MINT};padding:4px 0 4px 18px;font-family:${BODY_FONT};font-size:15px;line-height:1.7;color:${INK};background-color:${WHITE};">
                    ${label ? `<span style="display:block;font-size:13px;font-weight:600;color:${MUTED};margin-bottom:6px;">${escapeHtml(label)}</span>` : ''}
                    ${body}
                  </td>
                </tr>
              </table>`;
}

export function renderLeadEmail(input: {
  kind: string;
  lines: string[];
  replyTo: string;
  site: string;
  template?: {
    preheader: string;
    heading: string;
    paragraphs: string[];
    actionLabel: string;
    actionUrl?: string;
    links: { label: string; url: string }[];
    buttonStyle: ButtonStyle;
    notes: string[];
  };
}): string {
  const groups = splitGroups(input.lines).map((group) => {
    const rows: { label: string; value: string }[] = [];
    let index = 0;
    while (index < group.length) {
      const parsed = pair(group[index] ?? '');
      if (!parsed) break;
      rows.push(parsed);
      index += 1;
    }
    const rest = group.slice(index);
    return `${detailTable(rows)}${rest.length > 0 ? transcript(rest) : ''}`;
  });

  const template = input.template;
  const actionUrl = template?.actionUrl ?? `mailto:${input.replyTo}`;
  const actionLabel = template?.actionLabel || `Reply to ${input.replyTo}`;
  const body = `<p class="pg-text" style="margin:0 0 6px;font-family:${BODY_FONT};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${TERRACOTTA_INK};">New lead</p>
              ${heading(template?.heading ?? input.kind)}
              ${template ? template.paragraphs.map(paragraph).join('') : ''}
              ${groups.join('\n              ')}
              ${button({ label: actionLabel, url: actionUrl, style: template?.buttonStyle })}
              ${additionalLinks(template?.links ?? [])}
              ${notes(template?.notes ?? [])}`;

  return shell({
    preheader: template?.preheader ?? `${input.kind} from ${input.replyTo}`,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WHITE}" style="background-color:${WHITE};"><tr><td bgcolor="${WHITE}" style="padding-bottom:26px;background-color:${WHITE};">${body}</td></tr></table>`,
    reason: 'This notification is only ever sent to the People Growth Africa team inbox.',
    site: input.site,
  });
}
