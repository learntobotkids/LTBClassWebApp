# LearnToBot Student Files - Setup Guide

## What This Does

This system allows students to click on files and folders in the web browser, and they will automatically open in Windows Explorer (folders) or with their default program (files like PDFs, images, videos, etc.).

---

## Complete Setup Process

### Part 1: Server Setup (One-time, on the server computer)

#### 1. Share the FINAL KIDS FILES Folder

**On the Windows Server computer:**

1. Navigate to: `C:\Users\[Username]\OneDrive\SHARED\`
2. Right-click on **FINAL KIDS FILES** folder
3. Select **Properties**
4. Go to **Sharing** tab
5. Click **Advanced Sharing**
6. Check **"Share this folder"**
7. In **Share name** field, type exactly: **KidsFiles**
8. Click **Permissions**
9. Select **Everyone**
10. Check **Read** permission
11. Click **OK** on all dialogs
12. **Note down your server computer name** (it's shown at the top of the Sharing tab)

#### 2. Install Node.js Dependencies

**On the Windows Server:**

1. Open Command Prompt as Administrator
2. Navigate to the app folder:
   ```cmd
   cd "C:\Users\[YourUsername]\OneDrive\SHARED\SOFTWARE\LTB Class Web App"
   ```
3. Run:
   ```cmd
   npm install
   ```
4. Wait for it to complete

#### 3. Install Protocol Handlers on Server

1. Navigate to the deployment folder:
   ```cmd
   cd deployment
   ```
2. Right-click **Install.bat**
3. Select **"Run as Administrator"**
4. Click **Yes** when prompted
5. Wait for "Installation Complete!"
6. Press any key to close

---

### Part 2: Client Laptop Setup (For each student laptop)

**Repeat these steps on EVERY student laptop:**

#### 1. Ensure App Files Are Synced

1. Open File Explorer
2. Go to: `C:\Users\[Username]\OneDrive\SHARED\SOFTWARE\LTB Class Web App`
3. Verify these files exist:
   - `google-credentials.json`
   - `node_modules` folder
   - If `node_modules` doesn't exist, run `npm install` (see Server Setup step 2)

#### 2. Install Protocol Handlers

1. Navigate to: `C:\Users\[Username]\OneDrive\SHARED\SOFTWARE\LTB Class Web App\deployment`
2. Right-click **Install.bat**
3. Select **"Run as Administrator"**
4. Click **Yes** when prompted
5. Wait for "Installation Complete!"
6. Press any key to close

#### 3. Configure Server Name (if different from server)

Only needed if the student laptop is NOT the server itself:

1. Open: `C:\LearnToBot\OpenStudentFolder.bat` in Notepad
2. Find the line:
   ```batch
   set "SERVER_NAME=%COMPUTERNAME%"
   ```
3. Replace with (use YOUR server's actual name):
   ```batch
   set "SERVER_NAME=YOUR-SERVER-NAME"
   ```
4. Save the file
5. Repeat for `C:\LearnToBot\OpenStudentFile.bat`

---

### Part 3: Testing

#### Test on Server Computer

1. Open web browser
2. Go to: `http://localhost:3000/student-files.html`
3. Click the green **"📋 Open in Explorer"** button on any folder
4. **Windows Explorer should open** showing that student's folder
5. Click **"👁️ View Files"** on a folder
6. Click any file
7. **The file should open** with its default program (PDF Reader, Image Viewer, etc.)

#### Test on Student Laptop

1. Open web browser
2. Go to: `http://[SERVER-IP]:3000/student-files.html`
   - Replace `[SERVER-IP]` with your server's IP address (like `192.168.1.21`)
3. Repeat the same tests as above
4. If folders/files don't open, verify:
   - Protocol handlers are installed (run Install.bat again)
   - Server name is configured correctly in the .bat files
   - File share is accessible (try opening `\\SERVER-NAME\KidsFiles` in Explorer)

---

## Troubleshooting

### "Nothing happens when I click Open in Explorer"

**Possible causes:**
1. Protocol handlers not installed
   - **Solution:** Run `Install.bat` as Administrator again

2. Windows blocked the protocol
   - **Solution:** When you click, browser may show a prompt asking permission - click "Allow" or "Open"

### "Network path not found" error

**Possible causes:**
1. File share not set up correctly on server
   - **Solution:** Follow Part 1 Step 1 again carefully

2. Server name is wrong in .bat files
   - **Solution:** Edit the .bat files with correct server name (Part 2 Step 3)

3. Network connectivity issue
   - **Solution:** Ensure both computers are on same network, test by opening `\\SERVER-NAME\KidsFiles` in Explorer

### Files open in browser instead of default program

**This is expected behavior without the protocol handler!**
- **Solution:** Make sure Install.bat was run on that computer

### "npm install" fails

**Possible causes:**
1. Node.js not installed
   - **Solution:** Download and install Node.js from nodejs.org

2. No internet connection
   - **Solution:** Run `npm install` when internet is available, or copy `node_modules` folder from a working machine

---

## What Gets Installed

On each computer, `Install.bat` creates:

1. **C:\LearnToBot\OpenStudentFolder.bat** - Script to open folders
2. **C:\LearnToBot\OpenStudentFile.bat** - Script to open files
3. **Registry entries** for `studentfolder://` and `studentfile://` protocols

These allow the browser to communicate with Windows to open folders and files.

---

## Uninstalling

To remove the protocol handlers:

1. Delete `C:\LearnToBot` folder
2. Open Registry Editor (Win+R, type `regedit`)
3. Delete these keys:
   - `HKEY_CLASSES_ROOT\studentfolder`
   - `HKEY_CLASSES_ROOT\studentfile`

---

## Security Note

The protocol handlers only provide access to files within the shared `KidsFiles` folder. They cannot access files elsewhere on the computer. The share permissions control who can access the files.

---

## Quick Reference

**Server Computer Name:** _________________ (fill this in)

**Server IP Address:** _________________ (fill this in)

**Share Name:** KidsFiles (must be exactly this)

**Protocol Handlers Location:** C:\LearnToBot\

**Web Access URL:** http://[SERVER-IP]:3000

---

For technical support, refer to the README.txt file in the deployment folder.
