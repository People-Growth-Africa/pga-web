/**
 * The rules that decide what the blog and events pages show, tested without a
 * network.
 *
 *   npm run test:content
 *
 * Two layers are covered. api/_lib/content/parse.ts turns CSV text into typed
 * entries; src/lib/contentMerge.ts joins those entries to the content that ships
 * with the site. Both are pure, so no fetch, database or browser is involved.
 */
import { registerHooks } from 'node:module';

// src/ uses bundler-style extensionless imports. Node needs a file name, so the
// same rule the api-server uses for `.js` specifiers is extended to those.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.')) {
      if (!specifier.endsWith('.ts') && !specifier.endsWith('.js')) {
        try {
          return nextResolve(`${specifier}.ts`, context);
        } catch {
          // Fall through.
        }
      }
      if (specifier.endsWith('.js')) {
        try {
          return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
        } catch {
          // Fall through.
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  normaliseImageUrl,
  normaliseLinkUrl,
  parseDateTime,
  parsePublishDate,
  parseSheet,
  slugify,
} = await import('../api/_lib/content/parse.ts');

const {
  findBlog,
  findEvent,
  mergeBlogCategories,
  mergeBlogPosts,
  mergeEvents,
  splitEvents,
} = await import('../src/lib/contentMerge.ts');

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

/* ── A tiny sheet builder, so the CSV reads like the sheet ───────────── */

const COLUMNS = [
  'type',
  'title',
  'slug',
  'category',
  'summary',
  'body',
  'image_url',
  'source_url',
  'platform',
  'author',
  'publish_date',
  'status',
  'event_date',
  'end_date',
  'location',
  'registration_url',
];

function quote(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function line(values) {
  return COLUMNS.map((column) => quote(values[column] ?? '')).join(',');
}

function row(overrides = {}) {
  return {
    type: 'Blog',
    title: 'A blog post',
    category: 'HR Strategy',
    body: 'The body of the post.',
    author: 'PGA Team',
    publish_date: '2026-10-01',
    status: 'Published',
    ...overrides,
  };
}

function parse(rows) {
  const csv = [COLUMNS.join(','), ...rows.map(line)].join('\r\n');
  return parseSheet(csv, { today: '2026-10-19' });
}

console.log('\nCSV and types\n');

const quoted = parse([
  row({
    title: 'Commas, quotes and lines',
    summary: 'One summary, with a comma.',
    body: 'He said "hello" twice.\n\nA second paragraph,\nwith a line break.',
  }),
]);
check(
  1,
  'Quoted commas, doubled quotes and multi-line cells survive parsing',
  quoted.entries.length === 1 &&
    quoted.entries[0].summary === 'One summary, with a comma.' &&
    quoted.entries[0].body.includes('He said "hello" twice.') &&
    quoted.entries[0].body.includes('\n'),
  `${quoted.entries.length} entry(ies)`,
);

const typed = parse([
  row({ title: 'A blog' }),
  row({ type: ' event ', title: 'An event', event_date: '2026-11-12 09:00' }),
]);
check(
  2,
  'Type is trimmed and case-insensitive: Blog and Event',
  typed.entries.length === 2 &&
    typed.entries.find((entry) => entry.title === 'A blog')?.type === 'blog' &&
    typed.entries.find((entry) => entry.title === 'An event')?.type === 'event',
  typed.entries.map((entry) => `${entry.type}:${entry.title}`).join(', '),
);

const badTypes = parse([
  row({ title: 'No type', type: '' }),
  row({ title: 'Wrong type', type: 'Newsletter' }),
  row({ title: 'Still fine' }),
]);
check(
  3,
  'A missing or unknown type is skipped with a warning, and the rest still load',
  badTypes.entries.length === 1 &&
    badTypes.skipped.length === 2 &&
    badTypes.skipped.every((entry) => entry.reason.includes('not Blog or Event')),
  badTypes.skipped.map((entry) => entry.reason).join(' | '),
);

console.log('\nVisibility rules\n');

const statuses = parse([
  row({ title: 'Published', status: 'Published' }),
  row({ title: 'Approved', status: ' approved ' }),
  row({ title: 'Hidden', status: 'Hidden' }),
  row({ title: 'Draft', status: 'Draft' }),
]);
check(
  4,
  'Only Published and Approved are shown; Hidden and Draft are not',
  statuses.entries.map((entry) => entry.title).join(', ') === 'Published, Approved' &&
    statuses.skipped.some((entry) => entry.reason === 'status is Hidden'),
  statuses.entries.map((entry) => entry.title).join(', '),
);

const publishDates = parse([
  row({ title: 'Yesterday', publish_date: '2026-10-18' }),
  row({ title: 'Today', publish_date: '2026-10-19' }),
  row({ title: 'Tomorrow', publish_date: '2026-10-20' }),
]);
check(
  5,
  'A future publish_date hides the row; today is visible',
  publishDates.entries.map((entry) => entry.title).join(', ') === 'Yesterday, Today',
  publishDates.entries.map((entry) => entry.title).join(', '),
);

const eventDates = parse([
  row({ type: 'Event', title: 'Past event', event_date: '2026-05-01 10:00' }),
  row({ type: 'Event', title: 'Future event', event_date: '2027-03-01 10:00' }),
  row({ type: 'Event', title: 'Hidden event', status: 'Hidden', event_date: '2027-03-02' }),
]);
check(
  6,
  'An event is never hidden by event_date, past or future; only publish_date and status hide it',
  eventDates.entries.length === 2 &&
    eventDates.entries.some((entry) => entry.title === 'Past event') &&
    eventDates.entries.some((entry) => entry.title === 'Future event') &&
    !eventDates.entries.some((entry) => entry.title === 'Hidden event'),
  eventDates.entries.map((entry) => entry.title).join(', '),
);

console.log('\nEvent fields\n');

const eventFields = parse([
  row({
    type: 'Event',
    title: 'Registration and location',
    event_date: '2027-01-15 2:30 pm',
    end_date: '2027-01-15 16:00',
    location: 'Apapa, Lagos',
    registration_url: 'https://forms.gle/abc',
  }),
  row({ type: 'Event', title: 'No event date' }),
  row({ type: 'Event', title: 'Bad event date', event_date: 'sometime' }),
]);
check(
  7,
  'An event without a readable event_date is invalid and skipped',
  eventFields.entries.length === 1 &&
    eventFields.skipped.length === 2 &&
    eventFields.skipped.every((entry) => entry.reason.includes('event_date')),
  `${eventFields.entries.length} valid, ${eventFields.skipped.length} skipped`,
);

check(
  8,
  'event_date carries a 24-hour start time; location and registration_url are kept',
  eventFields.entries[0]?.eventDate === '2027-01-15' &&
    eventFields.entries[0]?.eventTime === '14:30' &&
    eventFields.entries[0]?.eventEndDate === '2027-01-15' &&
    eventFields.entries[0]?.eventEndTime === '16:00' &&
    eventFields.entries[0]?.location === 'Apapa, Lagos' &&
    eventFields.entries[0]?.registrationUrl === 'https://forms.gle/abc',
  JSON.stringify({
    date: eventFields.entries[0]?.eventDate,
    time: eventFields.entries[0]?.eventTime,
    end: eventFields.entries[0]?.eventEndTime,
  }),
);

check(
  9,
  'An end_date before the start is ignored, not a reason to drop the event',
  (() => {
    const parsed = parse([
      row({ type: 'Event', title: 'Typo end', event_date: '2027-02-10', end_date: '2027-01-01' }),
    ]);
    return parsed.entries.length === 1 && parsed.entries[0]?.eventEndDate === null;
  })(),
);

check(
  10,
  'A blog needs a body; an event may have an empty one',
  (() => {
    const parsed = parse([
      row({ title: 'Empty body', body: '' }),
      row({ type: 'Event', title: 'Event without body', body: '', event_date: '2027-04-01' }),
    ]);
    return (
      parsed.entries.length === 1 &&
      parsed.entries[0]?.type === 'event' &&
      parsed.skipped.some((entry) => entry.reason.includes('blog post needs a body'))
    );
  })(),
);

console.log('\nSlugs\n');

const perTypeSlugs = parse([
  row({ title: 'Shared blog', slug: 'shared' }),
  row({ type: 'Event', title: 'Shared event', slug: 'shared', event_date: '2027-05-01' }),
  row({ title: 'Second shared blog', slug: 'shared' }),
]);
check(
  11,
  'A slug only has to be unique within its type; a second blog gets -2',
  perTypeSlugs.entries
    .map((entry) => `${entry.type}:${entry.slug}`)
    .sort()
    .join(', ') === 'blog:shared, blog:shared-2, event:shared',
  perTypeSlugs.entries.map((entry) => `${entry.type}:${entry.slug}`).join(', '),
);

check(
  12,
  'Slugs are URL-safe and generated from the title when blank',
  slugify("Why We're Betting on African Talent!") === 'why-were-betting-on-african-talent' &&
    parse([row({ title: 'Café Société', slug: '' })]).entries[0]?.slug === 'cafe-societe',
);

console.log('\nDates\n');

check(
  13,
  'Dates accept ISO, day-first, month-first and month names, with optional times',
  parsePublishDate('2026-10-12T09:30:00Z') === '2026-10-12' &&
    parsePublishDate('13/10/2026') === '2026-10-13' &&
    parsePublishDate('10/13/2026') === '2026-10-13' &&
    parsePublishDate('12 October 2026') === '2026-10-12' &&
    parsePublishDate('31/02/2026') === null,
);

check(
  14,
  'parseDateTime separates the date from the time and ignores unreadable times',
  parseDateTime('2027-01-15 2:30 pm')?.date === '2027-01-15' &&
    parseDateTime('2027-01-15 2:30 pm')?.time === '14:30' &&
    parseDateTime('2027-01-15')?.time === null &&
    parseDateTime('2027-01-15 99:99')?.time === null,
  JSON.stringify(parseDateTime('2027-01-15 2:30 pm')),
);

console.log('\nImages and links\n');

check(
  15,
  'A Drive share link becomes a thumbnail; other hosts and schemes are refused',
  normaliseImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view') ===
    'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345&sz=w1200' &&
    normaliseImageUrl('https://example.com/x.png') === null &&
    normaliseImageUrl('javascript:alert(1)') === null,
);

check(
  16,
  'registration_url and source_url accept http(s) only',
  normaliseLinkUrl('https://forms.gle/abc') === 'https://forms.gle/abc' &&
    normaliseLinkUrl('javascript:alert(1)') === null,
);

console.log('\nMerging with the built-in content\n');

const builtInBlogCount = mergeBlogPosts([]).length;
const builtInEventCount = mergeEvents([], [], '2026-10-19').length;

const duplicateBlog = parse([row({ title: 'A different title', slug: 'from-whatsapp-groups-to-world-class-hr' })]);
const mergedDuplicate = mergeBlogPosts(duplicateBlog.entries);
check(
  17,
  'A sheet row whose slug matches a built-in post is dropped, and the built-in post wins',
  mergedDuplicate.length === builtInBlogCount &&
    mergedDuplicate.find((post) => post.slug === 'from-whatsapp-groups-to-world-class-hr')?.title !==
      'A different title',
  `${mergedDuplicate.length} posts, ${builtInBlogCount} built in`,
);

const newBlog = parse([
  row({ title: 'A brand new sheet post', slug: 'brand-new-sheet-post', category: 'New Category' }),
]);
const mergedNewBlog = mergeBlogPosts(newBlog.entries);
check(
  18,
  'A new sheet blog is added alongside every built-in post, and its category gets a filter',
  mergedNewBlog.length === builtInBlogCount + 1 &&
    mergedNewBlog.some((post) => post.slug === 'brand-new-sheet-post') &&
    mergeBlogCategories(mergedNewBlog).some((category) => category.id === 'New Category') &&
    findBlog('brand-new-sheet-post', newBlog.entries)?.origin === 'sheet',
  `${mergedNewBlog.length} posts`,
);

const eventEntries = parse([
  row({ type: 'Event', title: 'Far future', slug: 'far-future', event_date: '2027-06-01 10:00' }),
  row({ type: 'Event', title: 'Past sheet event', slug: 'past-sheet-event', event_date: '2026-01-15' }),
  row({
    type: 'Event',
    title: 'Duplicate of a built-in event',
    slug: 'nigerian-labour-law-compliance-2026',
    event_date: '2027-08-01',
  }),
]);
const mergedEvents = mergeEvents(eventEntries.entries, [], '2026-10-19');
const { upcoming, past } = splitEvents(mergedEvents);
check(
  19,
  'Built-in events are kept, new sheet events are added and duplicate slugs are dropped',
  mergedEvents.length === builtInEventCount + 2 &&
    !mergedEvents.some((event) => event.title === 'Duplicate of a built-in event') &&
    findEvent('far-future', eventEntries.entries, [], '2026-10-19')?.origin === 'sheet',
  `${mergedEvents.length} events, ${builtInEventCount} built in`,
);

check(
  20,
  'A future sheet event is upcoming, a past one is past, and built-in events keep their status',
  upcoming.some((event) => event.slug === 'far-future') &&
    past.some((event) => event.slug === 'past-sheet-event') &&
    upcoming.length >= builtInEventCount,
  `upcoming ${upcoming.length}, past ${past.length}`,
);

check(
  21,
  'Upcoming events are soonest first and past events newest first',
  (() => {
    const upcomingDates = upcoming.map((event) => event.isoDate);
    const pastDates = past.map((event) => event.isoDate);
    const asc = [...upcomingDates].sort((a, b) => a.localeCompare(b));
    const desc = [...pastDates].sort((a, b) => b.localeCompare(a));
    return upcomingDates.join() === asc.join() && pastDates.join() === desc.join();
  })(),
);

check(
  22,
  'Sheet blog posts sort newest first alongside built-in posts',
  (() => {
    const dates = mergeBlogPosts(newBlog.entries).map((post) => post.date);
    return dates.join() === [...dates].sort((a, b) => b.localeCompare(a)).join();
  })(),
);

console.log('\nDegenerate input\n');

let threw = false;
let garbage;
try {
  garbage = parseSheet('<html><body>Sign in to continue</body></html>', { today: '2026-10-19' });
} catch {
  threw = true;
}
check(
  23,
  'Garbage input returns no entries instead of throwing',
  !threw && Array.isArray(garbage?.entries) && garbage.entries.length === 0,
  threw ? 'threw' : `${garbage?.entries.length} entry(ies)`,
);

check(24, 'An empty sheet returns an empty list', parseSheet('', { today: '2026-10-19' }).entries.length === 0);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.log('\nFailing checks:');
  for (const result of results.filter((entry) => !entry.passed)) {
    console.log(`  ${result.number}. ${result.description} (${result.detail})`);
  }
}
process.exit(failures > 0 ? 1 : 0);
