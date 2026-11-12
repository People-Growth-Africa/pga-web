# Google Sheets Integration Setup Guide

This guide walks you through setting up real-time background synchronization of form submissions (event registrations, consultation bookings, and enquiries) to Google Sheets.

## Overview

When configured, every form submission is automatically synced to a Google Spreadsheet in the background after being saved to the database. This gives your team:

- Real-time visibility into leads without database access
- Easy filtering, sorting, and reporting in Google Sheets
- No impact on form submission speed (runs asynchronously)
- Graceful degradation: if sync fails, submissions still work

**Important**: The database remains the source of truth. Google Sheets is a read-only mirror for convenience.

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name: `PGA Forms Integration` (or any name)
4. Click **Create**
5. Wait for the project to be created and ensure it's selected

---

## Step 2: Enable Google Sheets API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for `Google Sheets API`
3. Click on **Google Sheets API**
4. Click **Enable**
5. Wait for the API to be enabled (takes a few seconds)

---

## Step 3: Create a Service Account

A service account is a special type of account used by applications (not humans) to access Google APIs.

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in the details:
   - **Service account name**: `pga-sheets-sync` (or any name)
   - **Service account ID**: Will auto-fill (e.g., `pga-sheets-sync`)
   - **Description**: `Service account for syncing form submissions to Google Sheets`
4. Click **Create and Continue**
5. Skip the optional "Grant this service account access to project" step → Click **Continue**
6. Skip the "Grant users access to this service account" step → Click **Done**

You should now see your service account in the credentials list.

---

## Step 4: Create and Download Service Account Key

1. In the **Service Accounts** list, click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create**
6. A JSON file will download automatically - **keep this file secure!** It contains private credentials.

The downloaded file will look like this:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "pga-sheets-sync@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

**Keep this file safe** - it's like a password for your service account.

---

## Step 5: Create the Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it: `PGA Form Submissions` (or any name)
4. Create three sheets (tabs) with **exact names**:
   - `Event Registrations`
   - `Consultation Bookings`
   - `Enquiries`

### Set up headers for each sheet:

**Sheet 1: Event Registrations**

Add these column headers in the first row:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| ID | Created At | Event Slug | Name | Email | Phone | Organisation | Role | Question |

**Sheet 2: Consultation Bookings**

Add these column headers in the first row:

| A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ID | Created At | Name | Email | Phone | Organisation | Team Size | Service | Meeting Format | Preferred Date | Preferred Slot | Notes | Status | Assigned To |

**Sheet 3: Enquiries**

Add these column headers in the first row:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| ID | Created At | Name | Email | Phone | Subject | Message | Source |

**Pro tip**: Format the header row (bold, background color, freeze) to make it easier to read.

---

## Step 6: Share the Spreadsheet with the Service Account

This is critical! The service account needs permission to write to your spreadsheet.

1. Copy the `client_email` value from your downloaded JSON file
   - It looks like: `pga-sheets-sync@your-project-id.iam.gserviceaccount.com`
2. In your Google Spreadsheet, click **Share** (top right)
3. Paste the service account email in the "Add people and groups" field
4. Set permission level to **Editor**
5. **Uncheck** "Notify people" (the service account won't read emails)
6. Click **Share**

Your service account can now write to the spreadsheet!

---

## Step 7: Get the Spreadsheet ID

The Spreadsheet ID is in the URL when you view your spreadsheet:

```
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
                                      ↑
                                      Copy this part
```

Example:
- URL: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`
- ID: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

Copy the ID - you'll need it for the environment variables.

---

## Step 8: Configure Environment Variables

You need to add three environment variables to your project.

### For Local Development (.env.development.local):

Create or edit `.env.development.local` in your project root:

```bash
# Google Sheets Integration
GOOGLE_SHEETS_SPREADSHEET_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL="pga-sheets-sync@your-project-id.iam.gserviceaccount.com"
GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**Important notes**:
- Copy the `private_key` value **exactly as it appears** in the JSON file, including `\n` characters
- Keep the quotes around the private key
- Never commit this file to git (it's already in `.gitignore`)

### For Vercel (Production/Preview):

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:

   **Variable 1:**
   - Key: `GOOGLE_SHEETS_SPREADSHEET_ID`
   - Value: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` (your spreadsheet ID)
   - Environments: Check **Production** and **Preview**

   **Variable 2:**
   - Key: `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
   - Value: `pga-sheets-sync@your-project-id.iam.gserviceaccount.com` (from JSON)
   - Environments: Check **Production** and **Preview**

   **Variable 3:**
   - Key: `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`
   - Value: Copy the entire `private_key` value from your JSON file, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
   - Environments: Check **Production** and **Preview**

4. Click **Save** for each variable

**After adding all variables**, you need to redeploy:
- Go to **Deployments**
- Click the **⋯** menu on the latest deployment → **Redeploy**
- Or just push a new commit to trigger a deployment

---

## Step 9: Test the Integration

### Test Locally:

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Submit a test form (e.g., event registration at `/events/[slug]`)

3. Check your terminal logs for:
   ```
   [Sheets] Google Sheets client initialized
   [Sheets] Successfully synced row to Event Registrations
   ```

4. Check your Google Spreadsheet - a new row should appear!

### Test in Production:

1. After deploying to Vercel, submit a form on your live site
2. Check the spreadsheet - the submission should appear within seconds
3. Check Vercel function logs if something goes wrong:
   - Go to your Vercel project → **Deployments** → Click on the deployment
   - Click **Functions** → Find the relevant API function → View logs

---

## Troubleshooting

### "Google Sheets credentials not configured, sync disabled"

**Cause**: Environment variables are missing or not loaded.

**Fix**:
- Local: Check `.env.development.local` exists and has all three variables
- Production: Check Vercel environment variables are set and deployment was redeployed after adding them

### "Failed to sync to [Sheet Name]: Invalid credentials"

**Cause**: Service account credentials are incorrect or malformed.

**Fix**:
- Ensure `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` matches the `client_email` from JSON
- Ensure `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` is copied exactly with `\n` characters intact
- In Vercel, make sure there are no extra spaces or line breaks when pasting

### "Failed to sync to [Sheet Name]: The caller does not have permission"

**Cause**: The service account doesn't have access to the spreadsheet.

**Fix**:
- Go to your spreadsheet → **Share**
- Verify the service account email is listed with **Editor** permission
- If not, add it again following Step 6

### "Failed to sync to [Sheet Name]: Unable to parse range"

**Cause**: The sheet (tab) name doesn't match exactly.

**Fix**:
- Check your spreadsheet has tabs named **exactly**:
  - `Event Registrations` (not "Event Registration" or "Registrations")
  - `Consultation Bookings` (not "Consultations")
  - `Enquiries` (not "Enquiry" or "Inquiries")
- Sheet names are case-sensitive!

### Submissions work but nothing appears in Sheets

**Cause**: Sync is running in background and failing silently.

**Fix**:
1. Check server logs (Vercel Functions logs or your terminal)
2. Look for `[Sheets]` log entries to see what's happening
3. Verify all three steps: credentials configured, API enabled, spreadsheet shared

### Testing sync manually

If you want to test without submitting forms, you can temporarily add this to one of your API routes:

```typescript
import { syncEventRegistration } from './api/_lib/sheets-sync.js';

// Add this somewhere in your code
await syncEventRegistration({
  id: 'test-id',
  name: 'Test User',
  email: 'test@example.com',
  phone: '+234 123 456 7890',
  organisation: 'Test Org',
  role: 'Developer',
  question: 'This is a test',
  eventSlug: 'test-event',
  createdAt: new Date(),
});
```

---

## How It Works (Technical Details)

### Architecture

The integration uses a **best-effort background sync** pattern:

1. **Form submission arrives** → validated, rate-limited
2. **Data saved to database** → this is the source of truth
3. **User receives immediate response** (201 Created)
4. **Background sync starts** using Vercel's `waitUntil()` API
   - Syncs to Google Sheets asynchronously
   - Does NOT block the response
   - Failure does not affect form submission
5. **Sync completes** (or fails) in background

### Why This Pattern?

- **Speed**: Forms respond instantly, no latency from Google API
- **Reliability**: Database writes never fail because of Sheets
- **Simple**: No queues, workers, or cron jobs needed
- **Vercel-native**: Uses `@vercel/functions` waitUntil() for background tasks

### Sync Functions

Located in `api/_lib/sheets-sync.ts`:

- `syncEventRegistration()` - Syncs to "Event Registrations" sheet
- `syncConsultationBooking()` - Syncs to "Consultation Bookings" sheet
- `syncEnquiry()` - Syncs to "Enquiries" sheet

Each function:
1. Gets authenticated Google Sheets client (cached after first call)
2. Appends a new row with all submission data
3. Returns true/false (logged but not used)

### Authentication

Uses **JWT service account authentication**:
- No OAuth flow or user consent needed
- Credentials stay on the server (never sent to browser)
- Private key is stored in environment variables
- Client is initialized once and reused

---

## Security Considerations

### Service Account Key

- **Never commit** the JSON key file to git
- **Never share** the private key publicly
- Store securely in environment variables only
- Rotate the key if it's ever compromised (create new key in Google Cloud Console)

### Spreadsheet Access

- The spreadsheet can be private (recommended)
- Only share with service account and your team
- Anyone with the spreadsheet link can view it (if shared)
- Consider using Google Sheets permissions to restrict editing

### Environment Variables

- `.env.development.local` is git-ignored by default
- Vercel environment variables are encrypted at rest
- Use separate service accounts for dev/staging/production if needed

---

## Optional: Disable Sync

If you want to temporarily disable sync without removing environment variables:

1. Comment out or remove the environment variables
2. The sync gracefully degrades with a warning log:
   ```
   [Sheets] Skipping sync to Event Registrations - not configured
   ```
3. Forms continue to work normally, data goes to database only

To re-enable, just add the environment variables back (no code changes needed).

---

## Support

If you encounter issues not covered here:

1. Check the server logs for `[Sheets]` entries
2. Verify each step in this guide was completed
3. Test with a fresh spreadsheet to rule out permission issues
4. Ensure the Google Sheets API is enabled in Google Cloud Console

The integration is designed to fail gracefully - if anything goes wrong, forms will still work and save to the database. Sheets sync is a convenience feature, not a critical dependency.

---

## Summary Checklist

- [ ] Created Google Cloud project
- [ ] Enabled Google Sheets API
- [ ] Created service account
- [ ] Downloaded service account JSON key
- [ ] Created spreadsheet with three sheets
- [ ] Added column headers to each sheet
- [ ] Shared spreadsheet with service account email (Editor access)
- [ ] Copied spreadsheet ID from URL
- [ ] Added all three environment variables (local and/or Vercel)
- [ ] Redeployed on Vercel (if using production)
- [ ] Tested form submission
- [ ] Verified data appears in spreadsheet

Once all boxes are checked, your Google Sheets integration is complete! 🎉
