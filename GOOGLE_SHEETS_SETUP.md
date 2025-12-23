# Google Sheets Integration Setup Guide

## ✅ What's Already Done:
- Google Sheets API package installed (`googleapis`)
- Server endpoints created (`/api/google-sheets/student-progress`)
- Configuration file created (`google-sheets-config.js`)
- Service module created (`google-sheets-service.js`)
- Student Progress Dashboard created (`/student-progress.html`)
- Link added to homepage

## 📋 What You Need to Do:

### Step 1: Save the Service Account Credentials
You should have downloaded a JSON file from Google Cloud Console (from the steps we discussed earlier).

1. **Rename the file** to: `google-credentials.json`
2. **Place it in the project root folder**:
   ```
   /Users/neildey/Library/CloudStorage/OneDrive-Personal/SHARED/SOFTWARE/LTB Class Web App/google-credentials.json
   ```

⚠️ **IMPORTANT**: This file contains sensitive credentials. Do NOT share it publicly or commit it to git!

### Step 2: Verify the Setup
1. Make sure the file `google-credentials.json` exists in the project folder
2. The server should restart automatically (nodemon)
3. If you see errors, check the console output

### Step 3: Test the Integration

1. **Make sure you have internet** (Google Sheets API requires internet)
2. **Open the homepage**: `http://localhost:3000/`
3. **Click the green "📊 Student Progress" button** (top-left, below Teacher Panel)
4. You should see:
   - List of all students from your Google Sheet
   - Number of completed projects for each student
   - Ability to expand and see all projects
   - Total statistics at the top

## 🎯 Features:

### Student Progress Dashboard:
- ✅ Shows all students from "Child Names" tab
- ✅ Displays completed projects count
- ✅ Shows in-progress projects count
- ✅ Displays total points earned
- ✅ Expandable project lists for each student
- ✅ Color-coded by status (green = completed, yellow = in progress)
- ✅ Auto-refreshes every 5 minutes
- ✅ Manual refresh button
- ✅ Smart caching (reduces API calls)
- ✅ Offline detection

### Data Fetched:
From **"Child Names"** tab:
- Column A: Student ID (unique key)
- Column B: Student Name

From **"Project Log"** tab:
- Student ID (Column C: SID)
- Student Name (Column E)
- Project Name (Column I)
- Project Status (Column J)
- Completed Date (Column Z)
- Project Type (Column AA)
- Child Rating (Column AB)
- Project Points (Column AC)

## 🔧 Troubleshooting:

### Error: "Google credentials file not found"
- Make sure `google-credentials.json` is in the project root folder
- Check the file name is exactly `google-credentials.json`

### Error: "Failed to fetch student progress"
- Check internet connection (Google Sheets API requires internet)
- Verify you shared the Google Sheet with the service account email
- Make sure the sheet ID in `google-sheets-config.js` is correct

### Error: "Permission denied" or "Forbidden"
- Go to your Google Sheet
- Click "Share"
- Make sure the service account email has "Viewer" access
- Service account email looks like: `name@project-id.iam.gserviceaccount.com`

### No students showing up
- Check that the "Child Names" tab has data in columns A and B
- Check that row 1 is the header row (it gets skipped)
- Open browser console (F12) to see detailed error messages

## 📊 How It Works:

1. **Server starts** → Loads Google Sheets service
2. **User visits `/student-progress.html`** → Fetches data from API
3. **API calls Google Sheets** → Uses service account credentials
4. **Data is cached** → Stored for 5 minutes to reduce API calls
5. **Data is displayed** → Pretty cards with project details
6. **Auto-refresh** → Updates every 5 minutes
7. **Manual refresh** → Clears cache and fetches fresh data

## 🔒 Security Notes:

- ⚠️ The `google-credentials.json` file is NOT synced via OneDrive
- ⚠️ Each Windows server needs its own copy of this file
- ⚠️ Keep this file secure - it has access to your Google Sheets
- ✅ The Google Sheet data is read-only (no writing)
- ✅ The service account only has "Viewer" permissions

## 📂 Files Created:

```
LTB Class Web App/
├── google-credentials.json          (YOU NEED TO ADD THIS)
├── google-sheets-config.js          (✅ Created)
├── google-sheets-service.js         (✅ Created)
├── GOOGLE_SHEETS_SETUP.md          (✅ This file)
├── server.js                        (✅ Updated with endpoints)
└── public/
    ├── index.html                   (✅ Updated with link)
    └── student-progress.html        (✅ Created)
```

## 🚀 Next Steps:

1. Place `google-credentials.json` in the project folder
2. Restart the server if needed
3. Test by visiting: `http://localhost:3000/student-progress.html`
4. Share feedback or report any issues!
