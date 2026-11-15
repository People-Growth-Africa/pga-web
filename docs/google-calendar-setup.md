# Google Calendar Integration Setup Guide

This guide shows you how to set up automatic Google Calendar integration for event registrations. When someone registers for an event, they'll get an "Add to Google Calendar" button that includes the meeting link.

## Overview

**What This Does:**
- ✅ Adds "Add to Google Calendar" button in registration confirmation
- ✅ Includes meeting link directly in calendar event
- ✅ Shows meeting link in confirmation modal and email
- ✅ Replaces manual `.ics` file downloads with Google Calendar links
- ✅ Works across all devices with Google Calendar sync

**What Changed:**
- ❌ Removed "Add to calendar (.ics)" button
- ✅ Now using "Add to Google Calendar" with meeting links embedded
- ✅ Meeting link visible in success modal and email

---

## Prerequisites

If you already set up **Google Sheets integration**, you're 90% done! The Calendar integration reuses the same service account credentials.

If you haven't set up Google Sheets yet, follow these steps:

### 1. Create Google Cloud Project & Service Account

See [Google Sheets Setup Guide](./google-sheets-setup.md) Steps 1-4 for detailed instructions.

**Quick summary:**
1. Create a Google Cloud project
2. Enable Google Calendar API (in addition to Sheets API)
3. Create a service account
4. Download the JSON key file

---

## Step 1: Enable Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (the one you created for Sheets, or create a new one)
3. Go to **APIs & Services** → **Library**
4. Search for `Google Calendar API`
5. Click **Google Calendar API**
6. Click **Enable**
7. Wait for the API to be enabled

---

## Step 2: Get Your Calendar ID

You need to tell the system which Google Calendar to use.

### Option A: Use Your Personal Calendar (Simplest)

1. Go to [Google Calendar](https://calendar.google.com)
2. In the left sidebar, find **"My calendars"**
3. Click the three dots next to your calendar → **Settings and sharing**
4. Scroll down to **"Integrate calendar"**
5. Copy the **Calendar ID** (looks like: `your-email@gmail.com`)

### Option B: Create a Dedicated Calendar (Recommended)

1. Go to [Google Calendar](https://calendar.google.com)
2. Next to "Other calendars", click **+** → **Create new calendar**
3. Name it: `PGA Event Registrations` (or any name)
4. Click **Create calendar**
5. Find the new calendar in the left sidebar
6. Click three dots → **Settings and sharing**
7. Scroll down to **"Integrate calendar"**
8. Copy the **Calendar ID** (looks like: `abc123xyz@group.calendar.google.com`)

---

## Step 3: Share Calendar with Service Account

**This is critical!** The service account needs permission to create events.

1. In Google Calendar, go to your calendar's **Settings and sharing**
2. Scroll to **"Share with specific people or groups"**
3. Click **Add people**
4. Paste your **service account email** (from your JSON key file)
   - Format: `pga-sheets-sync@your-project-id.iam.gserviceaccount.com`
5. Set permission to **"Make changes to events"**
6. **Uncheck** "Send email notification"
7. Click **Send**

---

## Step 4: Configure Environment Variables

### For Vercel (Production/Preview)

Go to your Vercel project → **Settings** → **Environment Variables**

#### If You Already Have Google Sheets Set Up:

**Add just ONE variable:**

- **Key:** `GOOGLE_CALENDAR_ID`
- **Value:** `your-email@gmail.com` (or `abc123@group.calendar.google.com`)
- **Environments:** ✅ Production, ✅ Preview

The system will automatically reuse your existing:
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`

#### If You Don't Have Google Sheets Set Up:

**Add THREE variables:**

**Variable 1:**
- **Key:** `GOOGLE_CALENDAR_ID`
- **Value:** `your-email@gmail.com`
- **Environments:** ✅ Production, ✅ Preview

**Variable 2:**
- **Key:** `GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL`
- **Value:** `your-service-account@project.iam.gserviceaccount.com`
- **Environments:** ✅ Production, ✅ Preview

**Variable 3:**
- **Key:** `GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY`
- **Value:** (Paste the entire `private_key` from your JSON file)
- **Environments:** ✅ Production, ✅ Preview

### For Local Development

Edit `.env.development.local`:

```bash
# Google Calendar Integration
GOOGLE_CALENDAR_ID="your-email@gmail.com"

# If you don't have Sheets variables already, add these:
GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Step 5: Deploy and Test

1. **Push your changes** (already done - commit `1e202ac`)
2. **Vercel will automatically deploy**
3. **Wait for deployment to complete**

### Test It

1. Go to your live site: `https://www.peoplegrowthafrica.com/events`
2. Click on an **online event** (one with a meeting link)
3. Click **"Register"** and fill out the form
4. Submit the registration
5. **Check the success modal** - you should see:
   - ✅ Meeting link displayed (if online event)
   - ✅ "Add to Google Calendar" button (green button with calendar icon)
6. **Click "Add to Google Calendar"**
7. **Verify** the Google Calendar page opens with:
   - Event title
   - Date and time (in WAT timezone)
   - Description with meeting link
   - Location field with meeting link

### Check Your Email

1. Open the confirmation email
2. You should see:
   - ✅ "Add to Google Calendar" button
   - ✅ Meeting link (if online event)
   - ❌ No more mention of ".ics file" or "team will email link"

---

## Troubleshooting

### "Add to Google Calendar" button doesn't appear

**Cause:** Environment variables not set or deployment not complete.

**Fix:**
1. Check Vercel environment variables are saved
2. Redeploy: **Deployments** → **⋯** → **Redeploy**
3. Clear browser cache and reload

### Calendar page shows wrong time

**Cause:** Timezone mismatch.

**Fix:** The system uses `Africa/Lagos` timezone (WAT). Google Calendar will convert to your local timezone automatically.

### Meeting link not showing in calendar event

**Cause:** Event doesn't have a `link_url` set in the admin panel.

**Fix:**
1. Go to `/admin/content`
2. Edit the event
3. Set the **Link URL** field (e.g., Zoom meeting link)
4. Save and publish

### Service account doesn't have permission

**Error message:** "Failed to create calendar event" in logs

**Cause:** Service account not shared with calendar.

**Fix:**
1. Go to Google Calendar → Settings for your calendar
2. Check if service account email is listed under "Share with specific people"
3. If not, add it with "Make changes to events" permission

---

## What Happens Now

### For New Registrations

When someone registers for an event:

1. ✅ **Registration saved to database** (as before)
2. ✅ **Synced to Google Sheets** (if configured)
3. ✅ **Confirmation email sent** with:
   - "Add to Google Calendar" button
   - Meeting link (for online events)
4. ✅ **Success modal shows**:
   - Meeting link (clickable, for online events)
   - "Add to Google Calendar" button

### For Existing Users

Want to send Google Calendar links to people who already registered?

**Option 1: Update Email Template**

1. Go to `/admin/email-templates`
2. Edit "Event registration" template
3. Update the copy to mention Google Calendar
4. Users will get new emails if you re-send confirmations

**Option 2: Manual Calendar Event**

1. Go to [Google Calendar](https://calendar.google.com)
2. Create a new event manually
3. Add all registered attendees as guests
4. Google will send them calendar invites

---

## Advanced: Optional Calendar Event Creation

Currently, the system generates **"Add to Calendar" links** that users click to add events to their own calendars.

If you want the system to **automatically create calendar events** on your Google Calendar (visible to your team), see the optional `createCalendarEvent()` function in `api/_lib/google-calendar.ts`.

**Note:** This is not needed for basic functionality. The "Add to Calendar" links work perfectly for attendees.

---

## Summary Checklist

- [ ] Google Calendar API enabled in Google Cloud Console
- [ ] Service account created (or reusing from Sheets setup)
- [ ] Calendar ID copied
- [ ] Calendar shared with service account email (Make changes permission)
- [ ] `GOOGLE_CALENDAR_ID` set in Vercel environment variables
- [ ] Service account credentials set (or reusing from Sheets)
- [ ] Redeployed on Vercel after adding variables
- [ ] Tested registration flow with online event
- [ ] Verified "Add to Google Calendar" button appears
- [ ] Checked email includes Google Calendar button

Once all boxes are checked, your Google Calendar integration is live! 🎉

---

## Migration from .ics Files

**Old behavior (before):**
- Users clicked "Add to calendar (.ics)"
- Downloaded `.ics` file to their device
- Manually opened file in their calendar app
- Meeting link in description (not clickable in some apps)

**New behavior (now):**
- Users click "Add to Google Calendar"
- Opens Google Calendar in browser
- One click to add to their calendar
- Meeting link clickable in calendar event
- Syncs across all devices automatically

**No action needed for existing users** - future registrations will use the new system automatically.
