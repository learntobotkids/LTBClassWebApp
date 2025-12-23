# LearnToBot Class Web App - Complete Project Overview

## 📖 Table of Contents
1. [What is This Project?](#what-is-this-project)
2. [Who is This For?](#who-is-this-for)
3. [How Does It Work?](#how-does-it-work)
4. [Technology Stack](#technology-stack)
5. [File Structure](#file-structure)
6. [How Everything Fits Together](#how-everything-fits-together)
7. [Getting Started](#getting-started)
8. [Common Tasks](#common-tasks)

---

## 🤖 What is This Project?

Think of this as a **virtual classroom** that runs on your local network (like the WiFi in your school or home).

**In simple terms:**
- Teachers can share coding/robotics lesson videos with students
- Students can watch these videos on their own computers
- Teachers can see what each student is working on
- Teachers can even control student screens (like "everyone open this project!")
- Everything works even without internet (offline mode)

**Real-world example:**
Imagine a coding class where:
1. Teacher assigns "Build a Game with Scratch" to students
2. Students log in with their name
3. They see their assigned projects highlighted
4. They click a project and watch instruction videos
5. Teacher can see who's watching what
6. Teacher can make everyone's screen show the same project

---

## 👥 Who is This For?

### Students:
- Browse and search for coding projects
- Watch instructional videos
- Track which projects they've completed
- See what's been assigned to them

### Teachers:
- Assign projects to students
- Track student progress
- Send all students to the same page remotely
- Monitor who's connected and what they're viewing
- Access student files

---

## 🔧 How Does It Work?

### The Big Picture:
```
[Teacher's Computer]  ←→  [Server/Main Computer]  ←→  [Student Computer 1]
                                   ↕                   [Student Computer 2]
                          [Google Sheets]              [Student Computer 3]
                          (Student Data)                     ...etc
```

1. **One computer runs the server** (like a central hub)
2. **All other computers connect to it** through the local WiFi network
3. **Google Sheets stores student information** (names, assignments, progress)
4. **The server downloads data from Google Sheets** and saves a backup locally
5. **Students and teachers use web browsers** to access the system (like Chrome or Firefox)

### Key Features:

#### 1. **Project Browsing**
- Videos and instructions are organized in folders
- Each project has instructional videos, images, and PDF guides
- Students can search and filter projects by category

#### 2. **Student Login**
- Students select their name from a list
- The system remembers who they are (using browser storage)
- Shows them personalized information (assigned projects, completed work)

#### 3. **Real-Time Updates**
- Uses "WebSockets" - think of it like a phone call that stays open
- Teacher can send everyone to the same page instantly
- System tracks who's connected in real-time

#### 4. **Offline Mode**
- Downloads student data from Google Sheets
- Saves it locally as backup files
- Works even if internet goes down

---

## 💻 Technology Stack

### High-Level Summary (Simple Version):
- **Language**: JavaScript (runs on both server and web pages)
- **Server**: Node.js (JavaScript that runs on the computer, not in the browser)
- **Framework**: Express (makes it easy to create web servers)
- **Real-Time**: Socket.IO (allows instant communication like a chat app)
- **Data Storage**: Google Sheets + Local JSON files
- **Frontend**: Plain HTML, CSS, and JavaScript (no frameworks - keep it simple!)

### Detailed Breakdown:

#### **Backend (Server-Side):**
| Technology | Version | What It Does |
|------------|---------|--------------|
| **Node.js** | Latest | JavaScript runtime - lets JavaScript run on computers (not just browsers) |
| **Express** | 4.18.2 | Web server framework - handles web requests (like "give me the home page") |
| **Socket.IO** | 4.7.2 | Real-time communication - like a phone line that stays connected for instant messages |
| **Google APIs** | 165.0.0 | Connects to Google Sheets to read student data |
| **csv-parser** | 3.0.0 | Reads CSV files (spreadsheet files) |

#### **Frontend (What Runs in Browser):**
| Technology | What It Does |
|------------|--------------|
| **HTML** | Structure of web pages (headings, buttons, text) |
| **CSS** | Styling/design (colors, layouts, animations) |
| **JavaScript** | Makes pages interactive (clicking buttons, searching, etc.) |
| **Socket.IO Client** | Connects to server for real-time updates |

#### **Data Storage:**
| Type | Location | Purpose |
|------|----------|---------|
| **Google Sheets** | Cloud (online) | Master database of students and their progress |
| **Local JSON Files** | `/data/` folder | Backup/cached copy that works offline |
| **Browser LocalStorage** | Student's browser | Remembers who's logged in |

#### **Deployment:**
| Tool | Purpose |
|------|---------|
| **Windows Batch Files (.bat)** | Simple scripts to start server or open folders |
| **PowerShell Scripts (.ps1)** | Advanced Windows automation (network discovery, installations) |

---

## 📂 File Structure

Here's every file and what it does:

### **Root Directory (Main Folder)**

```
LTB Class Web App/
├── server.js                      ← Main server file (the brain of the operation)
├── package.json                   ← Lists all the tools/libraries needed
├── package-lock.json              ← Locks exact versions of tools (don't edit this)
├── google-sheets-service.js       ← Handles talking to Google Sheets
├── google-sheets-config.js        ← Settings for Google Sheets connection
├── google-credentials.json        ← Secret key to access Google Sheets
├── START_SERVER.bat               ← Windows script to start the server
├── WINDOWS_SETUP.md               ← Instructions for Windows setup
├── GOOGLE_SHEETS_SETUP.md         ← Instructions for Google Sheets setup
├── .gitignore                     ← Tells git which files not to upload
└── .DS_Store                      ← Mac system file (ignore this)
```

**What Each File Does:**

| File | What It Does | Difficulty |
|------|--------------|------------|
| `server.js` | **The Main Program** - Starts web server, handles all requests, manages connections | Advanced |
| `package.json` | **Shopping List** - Lists all Node.js tools this project needs | Beginner |
| `google-sheets-service.js` | **Google Sheets Connector** - Downloads student data from Google Sheets | Intermediate |
| `google-sheets-config.js` | **Google Sheets Settings** - Which spreadsheet to use, which columns have what data | Beginner |
| `google-credentials.json` | **Secret Password File** - Lets the server access Google Sheets (keep this private!) | Beginner |
| `START_SERVER.bat` | **Start Button** - Double-click this to start the server on Windows | Beginner |

### **`/public/` Folder (Web Pages)**

```
public/
├── index.html                ← Home page - browse all projects
├── project.html              ← Project detail page - watch videos for one project
├── student-progress.html     ← View all students' progress (teacher view)
├── teacher.html              ← Teacher control panel
├── student-files.html        ← Browse student work files
└── connections.html          ← Monitor who's connected to the server
```

**What Each Page Does:**

| Page | Who Uses It | What It Does |
|------|-------------|--------------|
| `index.html` | Students & Teachers | **Main Homepage** - Browse and search all projects |
| `project.html` | Students & Teachers | **Project Viewer** - Watch videos and view materials for a specific project |
| `student-progress.html` | Teachers | **Progress Dashboard** - See what everyone has completed |
| `teacher.html` | Teachers Only | **Control Panel** - Assign projects, control student screens |
| `student-files.html` | Teachers & Students | **File Browser** - View student work files |
| `connections.html` | Teachers | **Connection Monitor** - See who's online right now |

### **`/data/` Folder (Saved Data)**

```
data/
├── students.json              ← List of all student names (downloaded from Google Sheets)
├── student-assignments.json   ← What each student is assigned/completed
└── Data_ChildNames.csv        ← CSV backup of student names
```

**What Each Data File Does:**

| File | What It Stores | Updates When |
|------|----------------|--------------|
| `students.json` | List of all student names for login | Teacher clicks "Sync Students" |
| `student-assignments.json` | Each student's assigned/in-progress/completed projects | Teacher clicks "Sync Students" |
| `Data_ChildNames.csv` | Student names in spreadsheet format | Manually updated |

### **`/deployment/` Folder (Installation Tools)**

```
deployment/
├── Install.bat                        ← Installs protocol handlers on Windows
├── Deploy-ProtocolHandlers.ps1        ← PowerShell script for remote deployment
├── Discover-Computers.ps1             ← Finds all computers on network
├── RegisterProtocols.reg              ← Windows registry file for file opening
├── OpenStudentFile.bat                ← Opens student files from web links
├── OpenStudentFolder.bat              ← Opens student folders from web links
├── computers-SAMPLE.txt               ← Example list of computer names
├── error.txt                          ← Log file for errors
├── SETUP_GUIDE.md                     ← Setup instructions
├── REMOTE-DEPLOYMENT-GUIDE.md         ← Remote installation instructions
├── QUICK-START.txt                    ← Quick start guide
└── README.txt                         ← General information
```

**What These Scripts Do:**

| File | What It Does | When You Use It |
|------|--------------|-----------------|
| `Install.bat` | Sets up special "protocol handlers" so web links can open local files/folders | One-time setup on each computer |
| `Deploy-ProtocolHandlers.ps1` | Installs protocol handlers on all classroom computers at once | Initial classroom setup |
| `Discover-Computers.ps1` | Scans network to find all Windows computers | When you need to know what computers are available |
| `RegisterProtocols.reg` | Windows registry settings for file opening | Used by Install.bat |

### **`/.claude/` Folder (AI Assistant Settings)**

```
.claude/
└── settings.local.json        ← Settings for Claude Code AI assistant
```

---

## 🔗 How Everything Fits Together

### Step-by-Step: What Happens When You Start the System

#### 1. **Starting the Server** (`server.js`)
```
Student double-clicks START_SERVER.bat
    ↓
Windows runs: node server.js
    ↓
server.js starts and:
  - Creates a web server on port 3000
  - Connects to Google Sheets API
  - Sets up real-time WebSocket connections
  - Starts serving web pages from /public/
    ↓
Server shows: "Server is running on http://192.168.1.100:3000"
```

#### 2. **Student Opens Their Browser**
```
Student types http://192.168.1.100:3000 in Chrome
    ↓
Browser requests index.html from server
    ↓
server.js sends back index.html
    ↓
Browser loads the page and runs the JavaScript inside
    ↓
JavaScript asks server: "What projects are available?"
    ↓
server.js looks in PROJECT_INSTRUCTIONS folder
    - Scans all folders for folders with 3-digit numbers (those are projects)
    - Finds all video files in each project
    - Sends list back to browser
    ↓
Browser displays project cards with icons and video counts
```

#### 3. **Student Logs In**
```
Student clicks "Login" button
    ↓
JavaScript shows modal with student names
    ↓
Student selects their name (e.g., "John Smith")
    ↓
Browser stores name in localStorage (remembers even after closing)
    ↓
JavaScript asks server: "What are John's assigned projects?"
    ↓
server.js checks data/student-assignments.json
    ↓
Sends back: assigned projects, in-progress, completed
    ↓
Browser highlights assigned projects in purple
    ↓
Browser marks completed projects with green checkmarks
```

#### 4. **Teacher Controls Everyone's Screen**
```
Teacher opens teacher.html
    ↓
Teacher clicks "Send All Students to Project 101"
    ↓
Browser sends request to server: /api/teacher/navigate
    ↓
server.js uses Socket.IO to send message to all connected students:
  { command: "navigate", url: "/project.html?id=101" }
    ↓
All student browsers receive the WebSocket message
    ↓
Their JavaScript automatically changes their page
    ↓
Everyone is now viewing Project 101
```

#### 5. **Syncing with Google Sheets**
```
Teacher clicks "Sync Students" on teacher.html
    ↓
Browser sends request to server: POST /api/sync-students
    ↓
server.js runs google-sheets-service.js:
  1. Connects to Google using google-credentials.json
  2. Reads "Child Names" sheet → gets list of students
  3. Reads "Project Log" sheet → gets all assignments/progress
  4. Organizes data by student name
  5. Saves to data/students.json
  6. Saves to data/student-assignments.json
    ↓
Server sends back: "Successfully synced 25 students"
    ↓
Now works offline using cached files!
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       GOOGLE SHEETS                          │
│  ┌────────────────────┐      ┌────────────────────┐        │
│  │   Child Names      │      │   Project Log      │        │
│  │  (Student list)    │      │  (Assignments)     │        │
│  └────────────────────┘      └────────────────────┘        │
└──────────────────┬───────────────────┬──────────────────────┘
                   │                   │
                   │  ① Sync (when online)
                   ↓                   ↓
        ┌──────────────────────────────────────┐
        │          SERVER (server.js)          │
        │                                       │
        │  ② Saves to local files:             │
        │     - data/students.json             │
        │     - data/student-assignments.json  │
        │                                       │
        │  ③ Serves web pages from /public/    │
        │  ④ Provides APIs for data            │
        │  ⑤ Manages real-time connections     │
        └─────────────┬────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓              ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Student    │ │   Student    │ │   Teacher    │
│   Browser    │ │   Browser    │ │   Browser    │
│              │ │              │ │              │
│ • Views      │ │ • Views      │ │ • Controls   │
│ • Watches    │ │ • Watches    │ │ • Monitors   │
│ • Tracks     │ │ • Tracks     │ │ • Assigns    │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 🚀 Getting Started

### Prerequisites (What You Need):
1. **Windows Computer** (for running the server)
2. **Node.js installed** (download from nodejs.org)
3. **Google Sheets with student data** (optional, can work without)
4. **Local WiFi network** (all devices on same network)

### Quick Start (5 Steps):

#### Step 1: Install Node.js
1. Go to https://nodejs.org
2. Download the LTS (Long Term Support) version
3. Run the installer
4. Open Command Prompt and type: `node --version`
   - Should show something like: `v18.17.0`

#### Step 2: Install Project Dependencies
1. Open Command Prompt or PowerShell
2. Navigate to project folder:
   ```
   cd "C:\Path\To\LTB Class Web App"
   ```
3. Install required packages:
   ```
   npm install
   ```
   - This reads `package.json` and downloads all the tools

#### Step 3: Set Up Google Sheets (Optional)
1. Follow instructions in `GOOGLE_SHEETS_SETUP.md`
2. Place `google-credentials.json` in the root folder
3. Update `google-sheets-config.js` with your spreadsheet ID

#### Step 4: Organize Your Project Files
1. Create folders outside the project:
   ```
   LTB Class Web App/
   ├── (your project files here)

   PROJECT INSTRUCTIONS/        ← Put this folder HERE
   ├── PYTHON/
   │   └── Beginner/
   │       └── 101 - Build a Calculator/
   │           ├── icon.png
   │           ├── instructions.pdf
   │           ├── video1.mp4
   │           └── video2.mp4

   FINAL KIDS FILES/            ← Put this folder HERE
   └── John Smith/
       ├── calculator.py
       └── game.py
   ```

2. **Important**: Project folders must have a 3-digit number in the name
   - ✅ Good: `101 - Calculator`, `Python 205 - Game`
   - ❌ Bad: `Calculator Project`, `Game`

#### Step 5: Start the Server
**Option A: Easy Way**
- Double-click `START_SERVER.bat`

**Option B: Command Line**
```
cd "C:\Path\To\LTB Class Web App"
npm start
```

You should see:
```
========================================
LearnToBot Class Web App - Server Started
========================================

Server is running on:
  - Local:   http://localhost:3000
  - Network: http://192.168.1.100:3000
  - Teacher Panel: http://192.168.1.100:3000/teacher.html

Students should access: http://192.168.1.100:3000
```

#### Step 6: Test It!
1. On the same computer, open browser to: `http://localhost:3000`
2. On other computers on the network: `http://192.168.1.100:3000`
   - Replace `192.168.1.100` with the IP address shown in the server output

---

## 📋 Common Tasks

### For Teachers:

#### **Task**: Sync student data from Google Sheets
1. Open http://YOUR-SERVER-IP:3000/teacher.html
2. Click "Sync Students from Google Sheets"
3. Wait for confirmation
4. Data is now saved locally in `/data/` folder

#### **Task**: Assign a project to a student
1. Open Google Sheets → "Project Log" tab
2. Add a new row:
   - Student Name: John Smith
   - Project Name: 101 - Calculator
   - Project Status: Assigned
3. Save
4. Go to teacher.html and click "Sync Students"
5. John will now see this project highlighted when he logs in

#### **Task**: Send all students to the same page
1. Open teacher.html
2. Find student in the list
3. Click "Navigate" button
4. Enter URL or select from dropdown
5. All students' browsers will automatically navigate

#### **Task**: Monitor who's connected
1. Open http://YOUR-SERVER-IP:3000/connections.html
2. See real-time list of all connected devices
3. Shows IP address, current page, activity status

### For Students:

#### **Task**: Log in
1. Open http://YOUR-SERVER-IP:3000
2. Click "Login" button at top right
3. Search for your name
4. Click your name
5. You're logged in! (stays logged in even if you close browser)

#### **Task**: Find a project
**Option 1: Browse**
- Click on category tabs (PYTHON, SCRATCH, etc.)
- Scroll through project cards

**Option 2: Search**
- Type in the search box at the top
- Dropdown shows matching projects
- Click to open

#### **Task**: Watch a project
1. Click on a project card
2. You'll see all videos for that project
3. Click any video to watch
4. Use video controls to pause, volume, fullscreen, etc.

### For Developers/IT:

#### **Task**: Add a new API endpoint
1. Open `server.js`
2. Find existing endpoint examples (look for `app.get` or `app.post`)
3. Add your endpoint:
   ```javascript
   app.get('/api/my-new-endpoint', (req, res) => {
       // Your code here
       res.json({ message: 'Hello!' });
   });
   ```
4. Save and restart server

#### **Task**: Debug issues
1. Check server console output for error messages
2. Check browser console (F12 → Console tab)
3. Check these log files:
   - Server console output
   - `/deployment/error.txt`
4. Common issues:
   - Port 3000 already in use → Change PORT in server.js
   - Can't find projects → Check PROJECT_FOLDER path in server.js
   - Google Sheets not working → Check google-credentials.json and config

#### **Task**: Change the port
1. Open `server.js`
2. Find: `const PORT = 3000;`
3. Change to: `const PORT = 8080;` (or any port)
4. Save and restart server

#### **Task**: Customize the UI
1. Open the HTML file you want to edit (in `/public/`)
2. Find the `<style>` section
3. Modify colors, sizes, etc.
4. Save (no need to restart server)
5. Refresh browser to see changes

---

## 🆘 Troubleshooting

### Problem: "Cannot find module 'express'"
**Solution**: Run `npm install` in the project folder

### Problem: "Port 3000 is already in use"
**Solution**: Either close the other program using port 3000, or change the PORT in server.js

### Problem: "No projects found"
**Solution**: Check that PROJECT_INSTRUCTIONS folder exists two levels up from the server, and project folders have 3-digit numbers in their names

### Problem: "Google Sheets not working"
**Solution**:
1. Check `google-credentials.json` exists
2. Check `SPREADSHEET_ID` in `google-sheets-config.js` is correct
3. Try the "Sync Students" button on teacher.html

### Problem: "Students can't connect"
**Solution**:
1. Make sure all devices are on the same WiFi network
2. Check Windows Firewall isn't blocking port 3000
3. Use the network IP address (not localhost) from other computers

---

## 🎯 Summary

This project is a **local classroom management system** that helps teachers deliver coding lessons to students. It's built with simple, straightforward technologies (Node.js, Express, vanilla JavaScript) to make it easy to understand and modify.

**Key Strengths:**
- ✅ Works offline after initial sync
- ✅ Simple to set up and use
- ✅ Real-time teacher control
- ✅ No complex frameworks or build processes
- ✅ Easy to customize and extend

**Perfect for:**
- Classroom coding instruction
- Robotics classes
- Any scenario where you need to share videos and track student progress on a local network

---

## 📞 Need Help?

- Check the markdown files in the project root for specific setup guides
- Look at code comments in each file for detailed explanations
- Search for similar endpoints/functions as examples
- All code is commented in simple language for easy understanding

**Remember**: Every file in this project has been thoroughly commented. If you're ever confused about what something does, just open the file and read the comments! They're written to be understood by teenagers and AI assistants alike.

---

*Last Updated: 2025*
*Documentation written in simple, clear language for maximum accessibility*
