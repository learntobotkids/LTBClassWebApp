# Windows 11 Server Setup Instructions

## Quick Start (Manual)

1. **Double-click `START_SERVER.bat`**
   - This will automatically install dependencies (first time only)
   - Then start the web server
   - A window will show the server URLs

2. **Access the webpage:**
   - Server laptop: Open browser → `http://localhost:3000`
   - Student laptops: Open browser → `http://[SERVER-IP]:3000`

3. **To stop the server:**
   - Close the command window, or press `Ctrl+C`

---

## Auto-Start on Windows Boot (Optional)

### Method 1: Startup Folder (Simplest)

1. Press `Win + R`
2. Type: `shell:startup` and press Enter
3. Right-click `START_SERVER.bat` → "Create shortcut"
4. Move the shortcut to the Startup folder that opened
5. Restart computer to test

### Method 2: Task Scheduler (More Control)

1. Press `Win + R`, type `taskschd.msc`, press Enter
2. Click "Create Basic Task"
3. Name: `LearnToBot Server`
4. Trigger: "When the computer starts"
5. Action: "Start a program"
6. Browse to: `START_SERVER.bat`
7. Check "Open the Properties dialog" at the end
8. In Properties:
   - General tab → Check "Run with highest privileges"
   - Conditions tab → Uncheck "Start only if on AC power"
9. Click OK

---

## Troubleshooting

**If Node.js is not installed on Windows:**
1. Download from: https://nodejs.org/
2. Install the LTS version
3. Restart computer
4. Run `START_SERVER.bat` again

**If port 3000 is already in use:**
- Edit `server.js` and change `const PORT = 3000;` to another port like `3001`

**Check if server is running:**
- Open Command Prompt
- Type: `netstat -ano | findstr :3000`
- If you see results, server is running

---

## OneDrive Sync Notes

- Make sure this entire folder is set to "Always keep on this device" in OneDrive
- Wait for OneDrive to show green checkmarks before starting server on another laptop
- Any changes to files will sync automatically across all server laptops

---

## Auto-Restart Feature

The server now uses **nodemon** to automatically restart when backend code changes:

**When the server WILL restart automatically:**
- When `server.js` is modified (backend code changes)
- When `package.json` is modified (dependencies change)

**When restart is NOT needed:**
- When HTML files change (index.html, project.html, connections.html)
- When any files in the `public/` folder change
- These changes are picked up instantly - just refresh the browser

**What this means for OneDrive sync:**
- When you update code on one server and OneDrive syncs it to other servers
- The other servers will automatically restart within a few seconds
- No manual intervention needed
- Students won't experience any interruption (connection just needs a refresh)
