# Google Meet Link Generation - Quick Start Guide

## TL;DR - How It Works

When you create an **online event** in the admin panel and add a Google Meet link to the **Link URL** field, it automatically shows up:

✅ **On the public event page** - Visitors see "Join Meeting" button  
✅ **In registration confirmation** - Meeting link displayed after registration  
✅ **In confirmation emails** - "Add to Google Calendar" button includes the link  
✅ **In calendar events** - Link embedded in Google Calendar description

---

## Where Meeting Links Are Already Displayed

### 1. Public Event Page (`/events/your-event-slug`)

If the event has `linkUrl` set and `is_online = true`:
- Meeting link button appears on the event page
- Visitors can click to join the meeting

### 2. Registration Confirmation Modal

After someone registers:
```
✓ Registration received

Event: Your Event Name
Meeting Link: [Join Meeting] ← Clickable
[Add to Google Calendar] ← Includes meeting link
```

### 3. Confirmation Email

Email includes:
- "Join the meeting: https://meet.google.com/abc-defg-hij"
- "Add to Google Calendar" button (link embedded)

### 4. Google Calendar Event

When users click "Add to Calendar":
- Meeting link in event description
- Meeting link in location field
- Clickable in most calendar apps

---

## How to Generate a Google Meet Link for Your Event

### Option 1: Using Postman / API Client (Recommended)

1. **Open Postman** (or any API client)

2. **Create a POST request:**
   ```
   POST https://www.peoplegrowthafrica.com/api/admin/create-meet-link
   ```

3. **Set Headers:**
   ```
   Content-Type: application/json
   ```

4. **Set Body (JSON):**
   ```json
   {
     "eventSlug": "career-advancement-agriculture",
     "title": "Career Advancement in Agriculture",
     "description": "Build your career in agriculture",
     "startTime": "2026-11-15T19:00:00.000Z",
     "endTime": "2026-11-15T21:00:00.000Z",
     "isOnline": true,
     "secret": "pga-backfill-xyz-789-secret"
   }
   ```

5. **Send the request**

6. **Copy the `meetingLink` from the response:**
   ```json
   {
     "success": true,
     "meetingLink": "https://meet.google.com/abc-defg-hij",
     "calendarLink": "https://calendar.google.com/calendar/event?eid=...",
     "eventId": "calendar-event-123"
   }
   ```

7. **Paste the meeting link** into your event's **Link URL** field in the admin panel

8. **Save and publish** the event

### Option 2: Using curl (Command Line)

```bash
curl -X POST https://www.peoplegrowthafrica.com/api/admin/create-meet-link \
  -H "Content-Type: application/json" \
  -d '{
    "eventSlug": "your-event-slug",
    "title": "Your Event Title",
    "description": "Event description",
    "startTime": "2026-12-01T14:00:00.000Z",
    "endTime": "2026-12-01T16:00:00.000Z",
    "isOnline": true,
    "secret": "pga-backfill-xyz-789-secret"
  }'
```

Copy the `meetingLink` from the output.

---

## Step-by-Step Workflow

### Creating a New Online Event with Google Meet

1. **Go to Admin Panel** → `/admin/content`
2. **Click "New Event"**
3. **Fill in basic details:**
   - Title: "Career Advancement in Agriculture"
   - Slug: `career-advancement-agriculture`
   - Description/Body: Event details
   
4. **Go to "Event details" tab:**
   - Set start date/time: November 15, 2026, 8:00 PM
   - Set end date/time: November 15, 2026, 10:00 PM
   - ✅ Check "This event is online"

5. **Save as Draft** first

6. **Generate Google Meet link** using the API (see Option 1 or 2 above)
   - Use the event slug, title, and times you just entered
   - Convert times to UTC (Lagos 8:00 PM = 19:00 UTC)
   - Get the `meetingLink` from response

7. **Back in Admin Panel**, edit the event:
   - Go to "Basics" tab
   - Find "Link URL" field (for blog posts, shown for events in future)
   - Paste the Meet link: `https://meet.google.com/abc-defg-hij`
   - Save

8. **Publish the event**

9. **Done!** The meeting link now appears:
   - ✅ On public event page
   - ✅ In registration confirmations
   - ✅ In emails
   - ✅ In calendar events

---

## Time Conversion (Lagos to UTC)

Lagos is **UTC+1** (West Africa Time - WAT)

| Lagos Time (WAT) | UTC Time |
|------------------|----------|
| 8:00 AM | 07:00 UTC |
| 12:00 PM (noon) | 11:00 UTC |
| 6:00 PM | 17:00 UTC |
| 8:00 PM | 19:00 UTC |
| 10:00 PM | 21:00 UTC |

**Formula:** Lagos time - 1 hour = UTC

**Example:**
- Event: November 15, 2026, 8:00 PM - 10:00 PM (Lagos)
- API startTime: `"2026-11-15T19:00:00.000Z"` (7:00 PM UTC = 8:00 PM WAT)
- API endTime: `"2026-11-15T21:00:00.000Z"` (9:00 PM UTC = 10:00 PM WAT)

---

## Troubleshooting

### "meetingLink" is empty in the response

**Cause:** Google Meet is not enabled for your calendar.

**Fix:**
1. Go to [Google Calendar Settings](https://calendar.google.com/calendar/u/0/r/settings)
2. Select the calendar you're using (check `GOOGLE_CALENDAR_ID`)
3. Scroll to "Event settings"
4. Enable "Add video conferencing" → **Google Meet**
5. Save settings
6. Try generating the link again

### "calendar_not_configured" error

**Cause:** `GOOGLE_CALENDAR_ID` not set in Vercel environment variables.

**Fix:**
1. Go to Vercel → Settings → Environment Variables
2. Add `GOOGLE_CALENDAR_ID` with your calendar ID
3. Redeploy the site

### "Invalid or missing secret" error

**Cause:** Wrong secret in the request.

**Fix:**
Use the same secret as `SHEETS_BACKFILL_SECRET` environment variable:
```
"secret": "pga-backfill-xyz-789-secret"
```

### Meeting link not showing on public event page

**Cause:** Event is not marked as "online" or `linkUrl` is not saved.

**Fix:**
1. Edit event in admin panel
2. Check "This event is online" checkbox
3. Make sure Link URL field has the Google Meet link
4. Save and publish

---

## Where is the Link URL Field in Admin Panel?

Currently, the **Link URL** field is shown for **blog posts** in the "Basics" tab.

For **events**, you need to:
1. Temporarily switch the post type to "Blog"
2. Enter the Meet link in "Link URL"
3. Switch back to "Event"
4. Save

**OR** (better):

The Link URL field will be visible in a future update to the event editor. For now, you can:
1. Create the event as draft
2. Use the API to generate Meet link
3. Manually update the database (if you have access), or
4. Edit the post as "Blog", add link, switch back to "Event"

---

## API Response Fields

```json
{
  "success": true,
  "meetingLink": "https://meet.google.com/abc-defg-hij",    // ← Save this to event's link_url
  "calendarLink": "https://calendar.google.com/calendar/event?eid=XYZ",  // Public calendar event URL
  "eventId": "abc123xyz"  // Google Calendar event ID (for your records)
}
```

**What to do with each:**
- `meetingLink` → Paste into event's **Link URL** field in admin panel
- `calendarLink` → Optional: Share with your team to see the calendar event
- `eventId` → Optional: Keep for your records (in case you need to delete/update the calendar event)

---

## Benefits of This Approach

✅ **Automatic Meet creation** - No manual setup  
✅ **Persistent links** - Won't expire  
✅ **Calendar integration** - Meet link tied to calendar event  
✅ **Consistent management** - All meetings in one place  
✅ **Professional** - Google Meet URLs look trustworthy  
✅ **Works everywhere** - Link shows on site, emails, and calendars

---

## Example: Complete Workflow

Let's create an event called "Tech in Agriculture 2026":

**1. Create event in admin:**
- Title: Tech in Agriculture 2026
- Slug: `tech-in-agriculture-2026`
- Date: December 10, 2026
- Time: 2:00 PM - 4:00 PM Lagos (13:00 - 15:00 UTC)
- Mark as "Online"
- Save as draft

**2. Generate Meet link (Postman):**
```json
POST https://www.peoplegrowthafrica.com/api/admin/create-meet-link

{
  "eventSlug": "tech-in-agriculture-2026",
  "title": "Tech in Agriculture 2026",
  "description": "Exploring technology opportunities in African agriculture",
  "startTime": "2026-12-10T13:00:00.000Z",
  "endTime": "2026-12-10T15:00:00.000Z",
  "isOnline": true,
  "secret": "pga-backfill-xyz-789-secret"
}
```

**3. Response:**
```json
{
  "meetingLink": "https://meet.google.com/xyz-tech-agric"
}
```

**4. Add to event:**
- Edit event in admin
- Paste `https://meet.google.com/xyz-tech-agric` in Link URL
- Save

**5. Publish**

**6. Done! ✅**
- Public page: Shows "Join Meeting" button
- Registrations: Show Meet link in confirmation
- Emails: Include Meet link
- Calendar: Meet link embedded

---

## Future Improvements

Planned features:
- [ ] "Generate Meet Link" button directly in admin panel event editor
- [ ] Auto-fill Link URL when button clicked
- [ ] Show existing Meet links in content list
- [ ] Bulk generate links for multiple events
- [ ] Update/delete Meet links from admin

For now, use the API endpoint method above - it's quick once you get the hang of it!

---

## Need Help?

Check:
- [Google Calendar Setup Guide](./google-calendar-setup.md) - Initial calendar integration setup
- [Google Sheets Setup Guide](./google-sheets-setup.md) - If you need Sheets integration too
- Environment variables in Vercel → Settings → Environment Variables
- Server logs in Vercel → Deployments → Function logs

Your Google Meet integration is ready to use! 🚀
