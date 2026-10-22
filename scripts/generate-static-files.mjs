import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The text files that still have to exist before the build: robots.txt and the
 * two llms.txt indexes.
 *
 * The sitemap used to be written here, as an index of a static child and an API
 * child. Both children were dead ends (a 404 and a JSON 404), so the sitemap is
 * now one urlset written by scripts/prerender.mjs from the same route list that
 * produces the HTML - the only way for it to list what the build actually ships.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const publicDir = path.join(root, 'public');

/** The apex redirects to www, so www is the canonical origin for every URL. */
const DOMAIN = 'https://www.peoplegrowthafrica.com';

// Extract post slugs, titles and excerpts from src/data/posts.ts. Kept as a
// regex read rather than an import so this file stays plain JavaScript that any
// Node version on the build image can run.
const postsContent = fs.readFileSync(path.join(root, 'src', 'data', 'posts.ts'), 'utf-8');

const collect = (field) =>
  [...postsContent.matchAll(new RegExp(`${field}:\\s*['"]([^'"]+)['"]`, 'g'))].map((m) => m[1]);

const slugs = collect('slug');
const titles = collect('title');
const excerpts = collect('excerpt');

fs.mkdirSync(publicDir, { recursive: true });

/* ── robots.txt ───────────────────────────────────────────────────────────── */

// Private routes are deliberately NOT disallowed here: a crawler that is kept
// out cannot read their noindex (vercel.json sends X-Robots-Tag, and their HTML
// carries a robots meta tag). Disallowing /admin would hide the one signal that
// keeps it out of an index.
//
// The named groups below are not needed to *allow* a crawler - the wildcard
// already does - but they make it explicit that the engines this site is aimed
// at are welcome, and they are the first thing to check if a robots.txt change
// ever goes wrong.
const robotsTxt = `# Standard web crawlers
User-agent: *
Allow: /

# Search engines, named so a future disallow cannot accidentally catch them
User-agent: Bingbot
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Bravebot
Allow: /

User-agent: YandexBot
Allow: /

User-agent: Baiduspider
Allow: /

# AI Crawlers & LLM Agents
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

Sitemap: ${DOMAIN}/sitemap.xml
`;

fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt, 'utf-8');
console.log('Generated robots.txt with AI crawler permissions.');

/* ── llms.txt ─────────────────────────────────────────────────────────────── */

let llmsTxt = `# People Growth Africa (PGA)

> Practical HR and people systems for growing African businesses.

Based in Apapa, Lagos, People Growth Africa (PGA) helps SMEs, agribusinesses and growing companies across Africa build structured, compliant and genuinely useful people systems.

## Core Specialities & Advisory Portfolio
- HR Strategic Advisory & Retainerships
- Nigerian Labour Law & Regulatory Compliance
- Organisational Architecture & Grade Bands
- Performance Management & OKR Systems
- Agribusiness Workforce Systems
- Talent Acquisition & Onboarding
- Leadership & Capability Development
- Culture & Employee Engagement

## Core Website Pages
- Homepage: ${DOMAIN}/
- Advisory Retainerships & Services: ${DOMAIN}/#services
- Firm Overview & Mission: ${DOMAIN}/#about
- Upcoming Events & Workshops: ${DOMAIN}/events
- Knowledge Hub / Blog: ${DOMAIN}/blog
- Book a Free Consultation: ${DOMAIN}/consultation
`;

// The site ships no built-in articles any more: every article is a row in the
// posts table. A build with none must not print a heading with nothing under it.
if (slugs.length > 0) {
  llmsTxt += '\n## Knowledge Articles & Insights\n';
  slugs.forEach((slug, i) => {
    const title = titles[i] || slug;
    const excerpt = excerpts[i] || 'Article insight on African HR and enterprise growth.';
    llmsTxt += `- [${title}](${DOMAIN}/blog/${slug}): ${excerpt}\n`;
  });
}

llmsTxt += `\n## Contact Information
- Address: Lagos, Nigeria
- Operating Hours: Mon-Fri: 8:00 AM - 6:00 PM WAT | Sat: 11:00 AM - 4:00 PM WAT
- Consultation Booking: ${DOMAIN}/consultation
`;

fs.writeFileSync(path.join(publicDir, 'llms.txt'), llmsTxt, 'utf-8');
console.log('Generated llms.txt standard file for AI web crawlers.');

/* ── llms-full.txt ────────────────────────────────────────────────────────── */

let llmsFullTxt = `# People Growth Africa (PGA) - Full Knowledge & Services Index\n\n`;
llmsFullTxt += llmsTxt;

if (slugs.length > 0) {
  llmsFullTxt += `\n---\n\n## Full Article Index\n\n`;
  slugs.forEach((slug, i) => {
    const title = titles[i] || slug;
    const excerpt = excerpts[i] || '';
    llmsFullTxt += `### ${title}\nURL: ${DOMAIN}/blog/${slug}\nSummary: ${excerpt}\n\n`;
  });
}

fs.writeFileSync(path.join(publicDir, 'llms-full.txt'), llmsFullTxt, 'utf-8');
console.log('Generated llms-full.txt successfully.');
