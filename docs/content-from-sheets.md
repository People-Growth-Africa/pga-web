# Blog posts and events from a Google Sheet

The existing `/blog` and `/events` pages read extra entries from a Google Sheet
published to the web as CSV. The social media team adds a row through a Google
Form; the form fills the sheet; an approved row appears on the site within five
minutes. **No redeploy is needed for a new post or event.**

- Data layer: [`api/_lib/content/parse.ts`](../api/_lib/content/parse.ts) (CSV →
  typed entries) and [`api/_lib/content/source.ts`](../api/_lib/content/source.ts)
  (fetch, cache, fallback).
- Endpoint: `GET /api/content`, cached at the edge for 300 seconds.
- Merge rules: [`src/lib/contentMerge.ts`](../src/lib/contentMerge.ts).
- Sitemap: `/sitemap.xml` is one static urlset written at build time from the
  built-in pages and posts. Sheet entries are not in it (a new row appears
  without a redeploy, but the sitemap is only as fresh as the last deploy).
  They are still linked from `/blog` and `/events` once the feed answers.

## The exact header row, in order

```
type,title,slug,category,summary,body,image_url,source_url,platform,author,publish_date,status,event_date,end_date,location,registration_url
```

| Column            | Required        | Notes |
| ----------------- | --------------- | ----- |
| `type`            | yes             | `Blog` or `Event` (case-insensitive). Anything else is skipped. |
| `title`           | yes             | 1–200 characters. |
| `slug`            | no              | URL-safe. Blank → generated from the title. Duplicates get `-2`, `-3`… **within the same type only**, so a blog and an event can share a slug. |
| `category`        | no              | Blog: a category chip (matches the built-in ones when it can, otherwise it becomes a new filter). Event: the badge, e.g. `Webinar`, `Workshop`. |
| `summary`         | no              | Max 600. Blank → the opening of the body. |
| `body`            | blogs: yes      | Plain text. Blank line = paragraph. `**bold**`, `*italic*`, `[label](https://…)` only. No HTML. |
| `image_url`       | no              | `http(s)`, allowlisted host. Drive share links are converted to thumbnails. Missing/failing → branded placeholder. |
| `source_url`      | no              | Link to the original social post. |
| `platform`        | no              | e.g. `Instagram`, `LinkedIn`. |
| `author`          | no              | Defaults to `People Growth Africa`. |
| `publish_date`    | yes             | When it goes live. A future date hides the row. |
| `status`          | yes             | `Published` / `Approved` show. `Hidden` and `Draft` are hidden. |
| `event_date`      | events: yes     | Start date and time. **Events only**; an event row without a readable date is skipped. |
| `end_date`        | no              | Events only. A date before `event_date` is ignored. |
| `location`        | no              | Events only. |
| `registration_url`| no              | Events only. Adds a **Register** button that opens it in a new tab. |

### Dates

`YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD`, `DD/MM/YYYY`, `DD-MM-YYYY`,
`DD.MM.YYYY`, `M/D/YYYY`, `12 Oct 2026`, `12 October 2026`, `Oct 12, 2026`.
A time may follow any of them (`2026-11-12 09:00`, `12/11/2026 2:30 pm`,
`2026-11-12T09:00:00Z`) and is shown as part of the event.

When both numbers in `a/b/YYYY` are 12 or less it is read **day-first**
(`10/12/2026` = 10 December). Sheets set to a US locale write month-first, so a
post meant for 12 October would land in December. Writing the date as
`YYYY-MM-DD` removes the ambiguity; the `Live` tab does that with
`TEXT(...,"yyyy-mm-dd")` below.

### Visibility, per type

- **Blog:** shown when `status` is Published/Approved and `publish_date` is not in
  the future. Sorted newest first.
- **Event:** shown when `status` is Published/Approved and `publish_date` is not
  in the future. **`event_date` never hides an event** - a future event is
  published so people can register, and a past one stays published under *Past
  events*.

## How the sheet content is merged with the built-in content

The built-in arrays in [`src/data/posts.ts`](../src/data/posts.ts) and
[`src/data/events.ts`](../src/data/events.ts) are never replaced or deleted.

1. Every built-in post and event is rendered exactly as before.
2. Sheet entries are appended.
3. A sheet row whose slug already belongs to a built-in entry is **dropped**, so
   the built-in page keeps its URL and its content. Editing a sheet row can
   therefore never quietly rewrite a hand-written page. The fix, if that is what
   you want, is to change the sheet row's slug.
4. Slug collisions are per type: `/blog/x` and `/events/x` are different pages.
5. Blogs are sorted by `publish_date` together with the built-in posts, newest
   first. Events are split into **Upcoming** (soonest first) and **Past**
   (newest first); built-in events keep the `status` they were written with, which
   is why they still appear as upcoming.

## Setup checklist

1. **Create the Google Form** with questions matching the columns: Type
   (dropdown: Blog / Event), Title, Slug, Category, Summary, Body (paragraph),
   Image URL, Source URL, Platform, Author, **Publish Date** (date), Status
   (dropdown: Published / Approved / Hidden / Draft), **Event Date** (date +
   time), End Date, Location, Registration URL. Make Type, Title, Body, Publish
   Date and Status required.
2. **Link the form to a spreadsheet**: Responses → Link to Sheets.
3. **Add a tab named `Live`** and put this in `A1` (adjust the column letters to
   your form's order; the date column is wrapped so it exports as `YYYY-MM-DD`):

   ```gs
   =IFERROR(
     {
       "type","title","slug","category","summary","body","image_url","source_url","platform","author","publish_date","status","event_date","end_date","location","registration_url";
       FILTER(
         {
           'Form Responses 1'!B2:B,
           'Form Responses 1'!C2:C,
           'Form Responses 1'!D2:D,
           'Form Responses 1'!E2:E,
           'Form Responses 1'!F2:F,
           'Form Responses 1'!G2:G,
           'Form Responses 1'!H2:H,
           'Form Responses 1'!I2:I,
           'Form Responses 1'!J2:J,
           'Form Responses 1'!K2:K,
           IF('Form Responses 1'!L2:L = "", "", TEXT('Form Responses 1'!L2:L, "yyyy-mm-dd")),
           'Form Responses 1'!M2:M,
           IF('Form Responses 1'!N2:N = "", "", TEXT('Form Responses 1'!N2:N, "yyyy-mm-dd hh:mm")),
           IF('Form Responses 1'!O2:O = "", "", TEXT('Form Responses 1'!O2:O, "yyyy-mm-dd")),
           'Form Responses 1'!P2:P,
           'Form Responses 1'!Q2:Q
         },
         REGEXMATCH(LOWER(TRIM('Form Responses 1'!M2:M)), "^(published|approved)$")
       )
     },
     "type","title","slug","category","summary","body","image_url","source_url","platform","author","publish_date","status","event_date","end_date","location","registration_url"
   )
   ```

   The last row keeps the header present while the tab is empty.

4. **Publish only `Live`**: File → Share → Publish to web → the `Live` tab → CSV.
   The URL looks like
   `https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv`.

5. **Set `SHEET_CSV_URL`** in Vercel → Settings → Environment Variables
   (Production and Preview), and in `.env.development.local` locally. Optionally
   set `REVALIDATE_SECRET` for the manual refresh hook.

6. **Redeploy once.** After that, new rows need no deploy.

## Manual refresh

```bash
curl -X POST https://www.peoplegrowthafrica.com/api/revalidate \
  -H "x-revalidate-secret: $REVALIDATE_SECRET"
```

It clears the server's copy immediately; the edge copy still expires within five
minutes. The endpoint answers 503 when the variable is unset and 401 for a wrong
secret, and it clears `/blog`, `/blog/:slug`, `/events`, `/events/:slug` and
`/api/content`.

## Images

Allowlisted hosts live in `IMAGE_HOSTS` in `api/_lib/content/parse.ts`:
`drive.google.com`, `lh3.googleusercontent.com`, `*.googleusercontent.com`,
`images.unsplash.com` and the site's own domain. Add another host there **and**
in `img-src` in `vercel.json`.

## Tests

```bash
npm run test:content   # CSV, types, visibility, event fields, slugs, merging, garbage input
```
