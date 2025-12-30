/*
 * ============================================================================
 * LEARNTOBOT CLASS WEB APP - MAIN SERVER
 * ============================================================================
 *
 * PURPOSE:
 * This is the main server file that runs the entire LearnToBot classroom web application.
 * Think of this as the "brain" that coordinates everything - serving web pages,
 * tracking students, managing projects, and enabling teacher control.
 *
 * WHAT THIS FILE DOES:
 * 1. Creates a web server that students and teachers connect to
 * 2. Serves web pages (HTML files) to browsers
 * 3. Provides APIs (data endpoints) for the frontend to use
 * 4. Manages real-time connections using WebSockets
 * 5. Tracks who's connected and what they're doing
 * 6. Scans folders to find all available projects
 * 7. Integrates with Google Sheets for student data
 * 8. Manages student files and folders
 *
 * HOW TO RUN THIS:
 * - Double-click START_SERVER.bat, OR
 * - Open terminal and type: node server.js
 *
 * DEPENDENCIES (What this file needs to work):
 * - express: Web server framework
 * - socket.io: Real-time communication (like instant messaging)
 * - path: Working with file paths
 * - fs: Reading/writing files
 * - os: Getting computer information
 * - csv-parser: Reading CSV files
 * - google-sheets-service: Custom module for Google Sheets integration
 *
 * ============================================================================
 */

// ============================================================================
// STEP 0: LOAD ENVIRONMENT VARIABLES
// ============================================================================
// Load .env file if it exists (for local development)
// In production (Render), env vars are set in the dashboard
require('dotenv').config();

// ============================================================================
// STEP 1: IMPORT ALL THE TOOLS WE NEED
// ============================================================================
// These are like importing tools from a toolbox - each one does something specific

const express = require('express');        // Creates web server and handles web requests
const path = require('path');              // Helps work with file/folder paths (works on Windows, Mac, Linux)
const os = require('os');                  // For getting system info (and temp dir)
const fs = require('fs');                  // Reading/writing files
const csv = require('csv-parser');         // Tool for reading CSV files (simple spreadsheets)
const { google } = require('googleapis');  // Google API client
const multer = require('multer');          // Middleware for handling file uploads

// Configure Multer for file uploads (store in temp directory)
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 500 * 1024 * 1024 } // Limit to 500MB
});
const http = require('http');              // Creates HTTP server (the foundation of web servers)
const socketIO = require('socket.io');     // Enables real-time, two-way communication (like walkie-talkies)
const googleSheetsService = require('./google-sheets-service'); // Our custom code for Google Sheets
const config = require('./google-sheets-config'); // Configuration file
const { exec } = require('child_process'); // Execute system commands (to open folders)

// ============================================================================
// STEP 2: CREATE THE MAIN APPLICATION OBJECTS
// ============================================================================

const app = express();                     // Create the Express application (our web server)
const server = http.createServer(app);     // Create HTTP server using our Express app
const io = socketIO(server);               // Add Socket.IO to enable real-time features

// DEBUG MIDDLEWARE: Log all requests
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Port: Use environment variable for cloud hosting (Render), default to 3000 for local/classroom use
const PORT = process.env.PORT || 3000;
const SERVER_START_TIME = Date.now();     // Remember when we started (for uptime tracking)

// ============================================================================
// STEP 3: CONFIGURE FOLDER PATHS
// ============================================================================
// These paths tell the server where to find important folders
// They use relative paths so it works even if you move the project folder

// Path to PROJECT_INSTRUCTIONS folder (where all lesson videos and materials are stored)
// Goes up two levels (..), then into PROJECT INSTRUCTIONS folder
// Example: If server.js is in C:\Web App\, this points to C:\PROJECT INSTRUCTIONS\
const PROJECT_FOLDER = path.join(__dirname, '..', '..', 'PROJECT INSTRUCTIONS');

// Path to data folder (where we cache student information)
// Stays in the same folder as server.js
// Example: C:\Web App\data\
const DATA_FOLDER = path.join(__dirname, 'data');

// Path to RATINGS folder (distributed sync for videos)
// Server-specific log files will go here
const RATINGS_FOLDER = path.join(DATA_FOLDER, 'ratings');

// Ensure ratings folder exists
if (!fs.existsSync(RATINGS_FOLDER)) {
    try {
        fs.mkdirSync(RATINGS_FOLDER, { recursive: true });
        console.log(`Created ratings folder at: ${RATINGS_FOLDER}`);
    } catch (err) {
        console.error(`Failed to create ratings folder: ${err.message}`);
    }
}

// Path to FINAL KIDS FILES folder (where students' work is saved)
// We try to dynamically find the OneDrive folder on both Windows and Mac
function findKidsFilesFolder() {
    const homeDir = os.homedir();

    // Potential OneDrive root paths to check
    const candidates = [
        // Windows Environment Variables
        process.env.OneDrive,
        process.env.OneDriveConsumer,
        process.env.OneDriveCommercial,

        // Common Mac Paths
        path.join(homeDir, 'Library/CloudStorage/OneDrive-Personal'),
        path.join(homeDir, 'OneDrive'),

        // Common Windows Paths (if env vars fail)
        path.join(homeDir, 'OneDrive'),
        path.join(homeDir, 'OneDrive - Personal')
    ];

    // Filter out undefined/null and check if they exist
    for (const root of candidates) {
        if (root && fs.existsSync(root)) {
            // Check for the specific subfolder structure
            const fullPath = path.join(root, 'SHARED', 'FINAL KIDS FILES');
            if (fs.existsSync(fullPath)) {
                console.log(`Found Kids Files Folder at: ${fullPath}`);
                return fullPath;
            }
        }
    }

    // Fallback: Try relative path from this project
    // Assuming project might be inside the SHARED folder
    const relativePath = path.join(__dirname, '..', '..', 'FINAL KIDS FILES');
    if (fs.existsSync(relativePath)) {
        console.log(`Found Kids Files Folder via relative path: ${relativePath}`);
        return relativePath;
    }

    console.warn('WARNING: Could not find "FINAL KIDS FILES" folder automatically.');
    return path.join(homeDir, 'OneDrive', 'SHARED', 'FINAL KIDS FILES'); // Default guess
}

const KIDS_FILES_FOLDER = findKidsFilesFolder();

// ============================================================================
// STEP 4: SET UP CONNECTION TRACKING
// ============================================================================
// We need to track who's connected so teachers can see active students

// Map to store active connections (like a phone book of currently connected users)
// Key: IP address (like "192.168.1.15")
// Value: Object with connection info (when they connected, last page viewed, etc.)
const activeConnections = new Map();

// How long before we consider someone disconnected (in milliseconds)
// 60000 ms = 60 seconds = 1 minute
// If we haven't heard from them in 60 seconds, they're probably gone
const CONNECTION_TIMEOUT = 60000;

// Map to store WebSocket connections (for real-time communication)
// Key: Socket ID (unique identifier for each connection)
// Value: Object with student info (name, current page, etc.)
const connectedClients = new Map();

// ============================================================================
// STEP 5: MIDDLEWARE TO TRACK ALL HTTP REQUESTS
// ============================================================================
// "Middleware" is code that runs BEFORE handling each request
// Think of it like a security checkpoint that everyone passes through

app.use((req, res, next) => {
    // Get the client's IP address (like their phone number)
    // req.ip or req.connection.remoteAddress gives us who's connecting
    const clientIP = req.ip || req.connection.remoteAddress;

    // Get current time in milliseconds (for tracking when they connected/last active)
    const now = Date.now();

    // Look up existing connection data for this IP
    let connectionData = activeConnections.get(clientIP);

    // If this is a brand new connection (we've never seen this IP before)
    if (!connectionData) {
        connectionData = {
            ip: clientIP,                          // Save their IP address
            firstSeen: now,                        // When we first saw them
            connectionNumber: activeConnections.size + 1  // Assign them a number
        };
    }

    // Update connection data with latest activity
    connectionData.lastSeen = now;                 // Update last activity time
    connectionData.currentPage = req.path;         // What page are they visiting?
    connectionData.userAgent = req.get('user-agent') || 'Unknown';  // What browser/device?

    // Save updated connection data back to our Map
    activeConnections.set(clientIP, connectionData);

    // Continue to the next middleware/route handler
    next();
});

// ============================================================================
// STEP 6: CLEAN UP STALE CONNECTIONS AUTOMATICALLY
// ============================================================================
// Every 10 seconds, check for connections that have timed out
// This keeps our connection list accurate

setInterval(() => {
    const now = Date.now();

    // Loop through all active connections
    for (const [ip, data] of activeConnections.entries()) {
        // Calculate how long since we last heard from them
        const timeSinceLastSeen = now - data.lastSeen;

        // If it's been longer than our timeout period, remove them
        if (timeSinceLastSeen > CONNECTION_TIMEOUT) {
            activeConnections.delete(ip);
        }
    }
}, 10000); // Run every 10000 milliseconds (10 seconds)

// ============================================================================
// STEP 7: CONFIGURE STATIC FILE SERVING
// ============================================================================
// "Static files" are files that don't change - HTML, CSS, JavaScript, images, etc.
// These tell the server where to find these files

// Serve files from the 'public' directory
// If someone requests /index.html, serve public/index.html
app.use(express.static('public'));

// Serve student headshots
// Mapped to 'headshots' folder in the project root
app.use('/headshots', express.static(path.join(__dirname, 'headshots')));

// Serve project videos and instruction materials
// If someone requests /projects/101-Calculator/video.mp4,
// serve it from PROJECT_FOLDER/101-Calculator/video.mp4
app.use('/projects', express.static(PROJECT_FOLDER));

// Serve student work files
// If someone requests /student-files/John/calculator.py,
// serve it from KIDS_FILES_FOLDER/John/calculator.py
app.use('/student-files', express.static(KIDS_FILES_FOLDER));

// ============================================================================
// STEP 8: SIMPLE PAGE REDIRECTS
// ============================================================================

// Redirect /teacher to /teacher.html for easier access
// So teachers can just type /teacher instead of /teacher.html
app.get('/teacher', (req, res) => {
    res.redirect('/teacher.html');
});

// ============================================================================
// STEP 9: HELPER FUNCTIONS FOR PROJECT DISCOVERY
// ============================================================================
// These functions help us find and organize all the project folders

/**
 * Checks if a folder name contains a 3-digit number
 * We use this to identify project folders (like "101 - Calculator")
 *
 * @param {string} folderName - Name of the folder to check
 * @returns {boolean} - True if folder name has 3 consecutive digits
 *
 * Examples:
 * - "101 - Calculator" → true (has 101)
 * - "Python 205 - Game" → true (has 205)
 * - "Scratch Projects" → false (no 3-digit number)
 * - "12 - Small Project" → false (only 2 digits)
 */
function hasThreeDigitNumber(folderName) {
    // Regular expression: \d{3} means "exactly 3 digits in a row"
    // .test() checks if the pattern exists in the string
    return /\d{3}/.test(folderName);
}

/**
 * Checks if a file is a video based on its extension
 *
 * @param {string} fileName - Name of the file to check
 * @returns {boolean} - True if file is a video format we support
 *
 * Supported video formats:
 * - .mp4 (most common, works everywhere)
 * - .mkv (high quality, open format)
 * - .avi (older format, widely compatible)
 * - .mov (Apple QuickTime format)
 */
function isVideoFile(fileName) {
    // Convert to lowercase so .MP4 and .mp4 both work
    const ext = fileName.toLowerCase();

    // Check if filename ends with any supported extension
    return ext.endsWith('.mp4') ||
        ext.endsWith('.mkv') ||
        ext.endsWith('.avi') ||
        ext.endsWith('.mov');
}

/**
 * Recursively finds ALL video files in a folder and all its subfolders
 * "Recursively" means if there are folders inside folders, we check those too
 *
 * @param {string} folderPath - The folder to search in
 * @param {string} basePath - The original starting folder (for calculating relative paths)
 * @returns {Array<string>} - Array of relative video file paths
 *
 * Example:
 * If folderPath = C:\Projects\101-Calc\
 * And we find:
 *   - C:\Projects\101-Calc\intro.mp4
 *   - C:\Projects\101-Calc\lessons\part1.mp4
 * We return:
 *   - ["intro.mp4", "lessons/part1.mp4"]
 */
function findAllVideosRecursively(folderPath, basePath = folderPath) {
    const videos = [];  // Array to collect all video files we find

    try {
        // Read all items in this folder
        // withFileTypes: true gives us info about whether each item is a file or folder
        const items = fs.readdirSync(folderPath, { withFileTypes: true });

        // Loop through each item in the folder
        for (const item of items) {
            // Build the full path to this item
            const fullPath = path.join(folderPath, item.name);

            if (item.isDirectory()) {
                // This item is a folder - look inside it recursively
                const subVideos = findAllVideosRecursively(fullPath, basePath);
                // Add all videos found in subfolder to our list
                videos.push(...subVideos);

            } else if (item.isFile() && isVideoFile(item.name)) {
                // This item is a video file!

                // Calculate relative path from the base folder
                // Example: If fullPath = C:\Projects\101\video.mp4
                //          And basePath = C:\Projects\101\
                //          Then relativePath = "video.mp4"
                const relativePath = path.relative(basePath, fullPath);

                // Replace backslashes with forward slashes for URLs
                // Windows uses \ but web URLs use /
                videos.push(relativePath.replace(/\\/g, '/'));
            }
        }
    } catch (error) {
        // If we can't read a folder (permissions issue, etc.), log error but keep going
        console.error(`Error reading folder ${folderPath}:`, error);
    }

    // Sort videos alphabetically for consistent ordering
    return videos.sort();
}

/**
 * Recursively finds all project folders in the PROJECT_INSTRUCTIONS directory
 * A "project folder" is any folder with a 3-digit number in its name
 *
 * @param {string} currentPath - Current folder we're examining
 * @param {string[]} categoryPath - Array of parent folder names (for categorization)
 * @returns {Array<Object>} - Array of project objects with all their info
 *
 * Example:
 * If we have:
 *   PROJECT INSTRUCTIONS/
 *     PYTHON/
 *       Beginner/
 *         101 - Calculator/
 *           icon.png
 *           instructions.pdf
 *           video1.mp4
 *           video2.mp4
 *
 * We'll return an object like:
 * {
 *   id: "PYTHON/Beginner/101 - Calculator",
 *   name: "101 - Calculator",
 *   category: "PYTHON > Beginner",
 *   categoryArray: ["PYTHON", "Beginner"],
 *   videos: ["video1.mp4", "video2.mp4"],
 *   icon: "icon.png",
 *   pdf: "instructions.pdf",
 *   videoCount: 2
 * }
 */
function findProjects(currentPath, categoryPath = []) {
    const projects = [];  // Array to collect all projects we find

    try {
        // Read all items in current folder
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        const folderName = path.basename(currentPath);

        // Check if THIS folder is a project folder (has 3-digit number in name)
        if (hasThreeDigitNumber(folderName)) {
            // This is a project folder!

            // Find all videos in this folder and its subfolders
            const videos = findAllVideosRecursively(currentPath);

            // Only include this project if it has at least one video
            if (videos.length > 0) {
                // Read files at project folder level to find icon and PDF
                const files = fs.readdirSync(currentPath);

                // Look for icon file (any JPG/PNG with "icon" in the name)
                const icon = files.find(f =>
                    f.toLowerCase().includes('icon') &&
                    (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'))
                );

                // Look for PDF instruction file
                const pdf = files.find(f => f.endsWith('.pdf'));

                // Calculate relative path from PROJECT_FOLDER
                // This becomes the project's unique ID
                const relativePath = path.relative(PROJECT_FOLDER, currentPath);

                // Category is parent folders (exclude the project folder itself)
                // Example: If categoryPath = ["PYTHON", "Beginner", "101 - Calculator"]
                //          We want category = "PYTHON > Beginner"
                const parentCategoryPath = categoryPath.slice(0, -1);
                const category = parentCategoryPath.length > 0
                    ? parentCategoryPath.join(' > ')
                    : 'Uncategorized';

                // Create project object with all info
                projects.push({
                    id: relativePath.replace(/\\/g, '/'),  // Unique identifier (path)
                    name: folderName,                       // Display name
                    category: category,                     // Human-readable category
                    categoryArray: parentCategoryPath,      // Array form for filtering
                    videos: videos,                         // Array of video paths
                    icon: icon || null,                     // Icon filename or null
                    pdf: pdf || null,                       // PDF filename or null
                    videoCount: videos.length               // Count for display
                });
            }
        }

        // Continue searching in all subdirectories
        // (Even if this was a project folder, there might be more projects nested inside)
        const directories = items.filter(item => item.isDirectory());

        directories.forEach(dir => {
            // Build path to subdirectory
            const subPath = path.join(currentPath, dir.name);

            // Build category path for subdirectory
            // (Add this directory's name to the category path)
            const newCategoryPath = [...categoryPath, dir.name];

            // Recursively search subdirectory
            const subProjects = findProjects(subPath, newCategoryPath);

            // Add all projects found in subdirectory
            projects.push(...subProjects);
        });

    } catch (error) {
        console.error(`Error reading folder ${currentPath}:`, error);
    }

    return projects;
}

// ============================================================================
// STEP 10: API ENDPOINT - GET ALL PROJECTS
// ============================================================================
// This endpoint returns a list of all available projects
// Frontend calls this to display project cards

/**
 * GET /api/projects
 *
 * Returns all projects found in the PROJECT_INSTRUCTIONS folder
 * Also returns category information for filtering
 *
 * Response format:
 * {
 *   projects: [...],              // Array of all projects
 *   categories: {...},            // Projects grouped by category
 *   topLevelCategories: [...],    // Top-level categories (PYTHON, SCRATCH, etc.)
 *   categoryHierarchy: {...}      // Category tree structure
 * }
 */
app.get('/api/projects', (req, res) => {
    try {
        let projects = [];

        // Check if PROJECT_FOLDER exists (OFFLINE/LOCAL mode)
        if (fs.existsSync(PROJECT_FOLDER)) {
            // OFFLINE MODE: Scan local folder for projects
            projects = findProjects(PROJECT_FOLDER, []);
        } else {
            // ONLINE MODE: Return sample projects with YouTube videos
            console.log('[ONLINE MODE] Returning sample projects with YouTube videos');
            projects = [
                {
                    id: 'SCRATCH/Beginner/101 - Getting Started',
                    name: '101 - Getting Started with Scratch',
                    category: 'SCRATCH > Beginner',
                    categoryArray: ['SCRATCH', 'Beginner'],
                    videos: ['https://youtu.be/M12_LT5lto4?si=EIajoB5SZEZTlsHo'],
                    icon: null,
                    pdf: null,
                    videoCount: 1,
                    isYouTube: true
                },
                {
                    id: 'SCRATCH/Beginner/102 - Animation Basics',
                    name: '102 - Animation Basics',
                    category: 'SCRATCH > Beginner',
                    categoryArray: ['SCRATCH', 'Beginner'],
                    videos: ['https://youtu.be/UiMg566PREA?si=jU77yyoh1B3KfDmS'],
                    icon: null,
                    pdf: null,
                    videoCount: 1,
                    isYouTube: true
                },
                {
                    id: 'PYTHON/Beginner/201 - Python Intro',
                    name: '201 - Introduction to Python',
                    category: 'PYTHON > Beginner',
                    categoryArray: ['PYTHON', 'Beginner'],
                    videos: ['https://youtu.be/KIsuIj-Ll3k?si=ykO2VTY1mJHfW9RJ'],
                    icon: null,
                    pdf: null,
                    videoCount: 1,
                    isYouTube: true
                },
                {
                    id: 'PYTHON/Beginner/202 - Variables',
                    name: '202 - Variables and Data Types',
                    category: 'PYTHON > Beginner',
                    categoryArray: ['PYTHON', 'Beginner'],
                    videos: ['https://youtu.be/hS7_ejQ5mA4?si=l9qxLVbGD2lOSnZ7'],
                    icon: null,
                    pdf: null,
                    videoCount: 1,
                    isYouTube: true
                },
                {
                    id: 'PYTHON/Intermediate/301 - Functions',
                    name: '301 - Functions in Python',
                    category: 'PYTHON > Intermediate',
                    categoryArray: ['PYTHON', 'Intermediate'],
                    videos: ['https://youtu.be/vxt4mcOxvFU?si=3fIVcrQfzIK3rT_n'],
                    icon: null,
                    pdf: null,
                    videoCount: 1,
                    isYouTube: true
                }
            ];
        }

        // Sort projects alphabetically by name
        projects.sort((a, b) => a.name.localeCompare(b.name));

        // Build category structures for frontend filtering
        const topLevelCategories = new Set();    // PYTHON, SCRATCH, etc.
        const categoryHierarchy = {};             // Tree of categories
        const categoriesFlat = {};                // Projects grouped by full category path

        // Process each project to build category data
        projects.forEach(project => {
            // Only process projects that have a category
            if (project.categoryArray.length >= 1) {
                // Get top-level category (PYTHON, SCRATCH, etc.)
                const topLevel = project.categoryArray[0];
                topLevelCategories.add(topLevel);

                // Build full path for two-level categories
                // Example: "PYTHON > Beginner"
                const topTwoLevels = project.categoryArray.slice(0, 2);
                const fullPath = topTwoLevels.join(' > ');

                // Group projects by this category path
                if (!categoriesFlat[fullPath]) {
                    categoriesFlat[fullPath] = [];
                }
                categoriesFlat[fullPath].push(project);

                // Build hierarchy (which subcategories belong to which top-level categories)
                if (!categoryHierarchy[topLevel]) {
                    categoryHierarchy[topLevel] = new Set();
                }
                if (project.categoryArray.length >= 2) {
                    // Add second-level category to this top-level category
                    categoryHierarchy[topLevel].add(project.categoryArray[1]);
                }
            }
        });

        // Convert Sets to Arrays for JSON response
        // (Sets can't be converted to JSON directly)
        const hierarchy = {};
        Object.keys(categoryHierarchy).forEach(key => {
            hierarchy[key] = Array.from(categoryHierarchy[key]).sort();
        });

        // Send response to frontend
        res.json({
            projects,                                           // All projects
            categories: categoriesFlat,                        // Projects by category
            topLevelCategories: Array.from(topLevelCategories).sort(),  // Top categories
            categoryHierarchy: hierarchy                       // Category tree
        });
    } catch (error) {
        console.error('Error reading projects:', error);
        res.status(500).json({
            error: 'Failed to read projects',
            message: error.message
        });
    }
});

// ============================================================================
// STEP 11: API ENDPOINT - GET CONNECTION STATISTICS
// ============================================================================
// This endpoint returns information about who's currently connected
// Teachers use this to monitor active students

/**
 * GET /api/connections
 *
 * Returns real-time connection statistics
 * Shows who's connected, what they're viewing, server uptime, etc.
 *
 * Response format:
 * {
 *   server: { hostname, ip, port, uptime },
 *   stats: { activeConnections, totalConnectionsSeen },
 *   connections: [ { ip, connectedFor, currentPage, ... }, ... ],
 *   timestamp: <current time>
 * }
 */
app.get('/api/connections', (req, res) => {
    try {
        const now = Date.now();
        const serverUptime = now - SERVER_START_TIME;  // How long server has been running
        const serverHostname = os.hostname();           // Computer name
        const serverIP = getLocalIPAddress();           // Server's IP on network

        // Convert activeConnections Map to Array and add computed fields
        const connections = Array.from(activeConnections.values()).map(conn => {
            const connectedTime = now - conn.firstSeen;        // How long they've been connected
            const lastActivitySeconds = Math.floor((now - conn.lastSeen) / 1000);  // Seconds since last activity

            // Determine activity status based on last activity
            let activityStatus = 'active';      // Default: active
            if (lastActivitySeconds > 30) activityStatus = 'idle';      // 30+ seconds: idle
            if (lastActivitySeconds > 45) activityStatus = 'inactive';  // 45+ seconds: inactive

            // Clean up page path for nice display
            let pageName = 'Home';
            if (conn.currentPage) {
                if (conn.currentPage.includes('project.html')) {
                    pageName = 'Project View';
                } else if (conn.currentPage.includes('connections.html')) {
                    pageName = 'Connection Monitor';
                } else if (conn.currentPage === '/') {
                    pageName = 'Projects Home';
                } else if (conn.currentPage.includes('.mp4') || conn.currentPage.includes('.mkv')) {
                    pageName = 'Watching Video';
                } else {
                    pageName = conn.currentPage;
                }
            }

            // Return connection object with all info
            return {
                ip: conn.ip,
                connectedFor: connectedTime,
                connectedForDisplay: formatDuration(connectedTime),
                lastActivity: lastActivitySeconds,
                currentPage: pageName,
                url: conn.currentPage || '/',
                activityStatus: activityStatus,
                userAgent: conn.userAgent,
                connectionNumber: conn.connectionNumber
            };
        });

        // Sort connections by connection number (oldest first)
        connections.sort((a, b) => a.connectionNumber - b.connectionNumber);

        // Send response
        res.json({
            server: {
                hostname: serverHostname,
                ip: serverIP,
                port: PORT,
                uptime: serverUptime,
                uptimeDisplay: formatDuration(serverUptime)
            },
            stats: {
                activeConnections: connections.length,
                totalConnectionsSeen: activeConnections.size
            },
            connections: connections,
            timestamp: now
        });
    } catch (error) {
        console.error('Error getting connections:', error);
        res.status(500).json({
            error: 'Failed to get connections',
            message: error.message
        });
    }
});

/**
 * Formats milliseconds into human-readable duration
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted string like "2h 15m" or "45s"
 *
 * Examples:
 * - 5000ms → "5s"
 * - 125000ms → "2m 5s"
 * - 7320000ms → "2h 2m"
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// ============================================================================
// STEP 11.5: API ENDPOINT - SERVER CONFIGURATION
// ============================================================================
// Returns public configuration to help frontend decide logic
// (e.g., Should I show the Online Login Modal?)
app.get('/api/config', (req, res) => {

    // Determine mode based on PROJECT_FOLDER existence or explicit env var
    // If PROJECT_FOLDER is missing, we are definitely ONLINE
    // If DEPLOYMENT_MODE is 'cloud', we are ONLINE
    const isOnline = !fs.existsSync(PROJECT_FOLDER) || process.env.DEPLOYMENT_MODE === 'cloud';

    res.json({
        mode: isOnline ? 'online' : 'offline',
        isOnline: isOnline,
        projectFolderExists: fs.existsSync(PROJECT_FOLDER)
    });
});

/**
 * Gets the server's local network IP address
 * This is the IP address students use to connect
 *
 * @returns {string} - IP address like "192.168.1.100" or "localhost"
 *
 * Example:
 * If server computer's IP is 192.168.1.50, returns "192.168.1.50"
 * Students would then connect to http://192.168.1.50:3000
 */
function getLocalIPAddress() {
    // Get all network interfaces (WiFi, Ethernet, etc.)
    const interfaces = os.networkInterfaces();

    // Loop through each network interface
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (127.0.0.1) and IPv6 addresses
            // We want the actual network IPv4 address
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }

    // If we couldn't find a network IP, return localhost
    return 'localhost';
}

// Returns list of student names from local JSON cache
// Used by frontend to populate login dropdown (OFFLINE/LOCAL MODE)
app.get('/api/student-names', async (req, res) => {
    try {
        const studentNames = await googleSheetsService.fetchStudentNamesForLogin();
        res.json({ names: studentNames });
    } catch (error) {
        console.error('Error fetching student names:', error);
        res.status(500).json({ error: 'Failed to fetch student names' });
    }
});

// ============================================================================
// STEP 13: API ENDPOINT - CHECK PARENT EMAIL (ONLINE MODE ONLY)
// ============================================================================
// Validates parent email against Google Sheet and returns matching children
// Uses server-side filtering for security (full email list never sent to client)

app.post('/api/check-parent-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Clean up input email (trim and lowercase)
        const cleanEmail = email.trim().toLowerCase();

        // Get authenticated Sheets API client
        const sheets = await googleSheetsService.getGoogleSheetsClient();

        // Fetch just the columns we need using the SAFE configuration
        // Using config.STUDENT_NAMES_SHEET which is "Child Names"
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!B:G` // Fetch Columns B through G (G is Index 6 / 5 in result)
        });

        const rows = response.data.values || [];

        // Filter rows to find matches
        // Config indices are 0-based relative to the sheet
        // But our fetch range starts at B (Column 1)

        // Response array indices:
        // 0 -> Column B (Email)
        // 1 -> Column C (Child Name)
        // 2 -> Column D (Child Age)
        // 3 -> Column E (Parent Name)
        // 4 -> Column F (Last Name?)
        // 5 -> Column G (Child File Link)

        const matchedChildren = rows
            .slice(1) // Skip header
            .filter(row => {
                // Check Column B (Index 0 in our result)
                const rowEmail = row[0] ? row[0].trim().toLowerCase() : '';
                return rowEmail === cleanEmail;
            })
            .map(row => ({
                name: row[1] ? row[1].trim() : 'Unknown Name', // Column C
                parentName: row[3] ? row[3].trim() : 'Parent',  // Column E
                fileLink: row[5] ? row[5].trim() : ''           // Column G
            }));

        if (matchedChildren.length > 0) {
            console.log(`Parent Email Match: ${cleanEmail} -> Found ${matchedChildren.length} kids`);
            res.json({
                success: true,
                children: matchedChildren
            });
        } else {
            console.log(`Parent Email Failed: ${cleanEmail} -> No match found`);
            // Add a polite message (maybe suggest contacting support)
            res.json({
                success: false,
                message: 'No student accounts found for this email. Please check for typos or use the email you registered with.'
            });
        }

    } catch (error) {
        console.error('Error checking parent email:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while checking email. Please try again.'
        });
    }
});

// ============================================================================
// STEP 14: API ENDPOINT - SYNC STUDENTS
// ============================================================================// Used for login dropdown

/**
 * GET /api/students
 *
 * Returns student names from local JSON file
 * This file is created by syncing from Google Sheets
 *
 * Response format:
 * {
 *   students: ["Alice Johnson", "Bob Smith", ...]
 * }
 */
app.get('/api/students', (req, res) => {
    try {
        // Build path to students.json
        const jsonPath = path.join(DATA_FOLDER, 'students.json');

        // Check if file exists
        if (!fs.existsSync(jsonPath)) {
            return res.status(404).json({
                error: 'Student names file not found',
                path: jsonPath
            });
        }

        // Read and parse JSON file
        const studentsData = fs.readFileSync(jsonPath, 'utf8');
        const students = JSON.parse(studentsData);

        // Send student list to frontend
        res.json({ students: students });
    } catch (error) {
        console.error('Error in /api/students:', error);
        res.status(500).json({
            error: 'Failed to get student names',
            message: error.message
        });
    }
});

// ============================================================================
// STEP 13: WEBSOCKET CONNECTION HANDLING
// ============================================================================
// WebSockets enable real-time, two-way communication
// Like a phone call that stays open - server can push data to clients instantly

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Store client information
    connectedClients.set(socket.id, {
        socketId: socket.id,
        connectedAt: Date.now(),
        studentName: null,
        currentPage: null,
        ip: socket.handshake.address
    });

    // Listen for student login event
    socket.on('student-login', (data) => {
        const client = connectedClients.get(socket.id);
        if (client) {
            client.studentName = data.studentName;
            console.log(`Student logged in: ${data.studentName} (${socket.id})`);
        }
    });

    // Listen for page navigation event
    socket.on('page-change', (data) => {
        const client = connectedClients.get(socket.id);
        if (client) {
            client.currentPage = data.page;
        }
    });

    // Listen for disconnect event
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        connectedClients.delete(socket.id);
    });


});

// ============================================================================
// STEP 14: API ENDPOINT - TEACHER NAVIGATION CONTROL
// ============================================================================
// Allows teacher to send students to specific pages remotely

/**
 * POST /api/teacher/navigate
 *
 * Sends navigation command to student browsers via WebSocket
 * Teacher can send all students or specific students to a URL
 *
 * Request body:
 * {
 *   url: "/project.html?id=101",
 *   targetStudents: "all" | ["socketId1", "socketId2", ...]
 * }
 */
app.post('/api/teacher/navigate', express.json(), (req, res) => {
    const { url, targetStudents } = req.body;

    // Validate URL is provided
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Check if we're sending to everyone or specific students
    if (!targetStudents || targetStudents === 'all') {
        // Broadcast to ALL connected clients
        io.emit('navigate', { url });
        res.json({ success: true, message: 'Navigation command sent to all clients' });
    } else {
        // Send to specific students only
        const socketIds = Array.isArray(targetStudents) ? targetStudents : [targetStudents];

        socketIds.forEach(socketId => {
            // Send navigate event to this specific socket
            io.to(socketId).emit('navigate', { url });
        });

        res.json({
            success: true,
            message: `Navigation command sent to ${socketIds.length} client(s)`
        });
    }
});

// ============================================================================
// STEP 15: API ENDPOINT - GET CONNECTED CLIENTS FOR TEACHER DASHBOARD
// ============================================================================

/**
 * GET /api/teacher/clients
 *
 * Returns list of currently connected WebSocket clients
 * Teacher uses this to see who's online and control them
 *
 * Response format:
 * {
 *   clients: [ { socketId, studentName, currentPage, connectedFor, ip }, ... ],
 *   totalClients: <number>
 * }
 */
app.get('/api/teacher/clients', (req, res) => {
    // Convert connectedClients Map to Array with computed fields
    const clients = Array.from(connectedClients.values()).map(client => ({
        socketId: client.socketId,
        studentName: client.studentName || 'Guest',
        currentPage: client.currentPage || 'Unknown',
        connectedFor: Date.now() - client.connectedAt,
        ip: client.ip
    }));

    res.json({ clients, totalClients: clients.length });
});

// ============================================================================
// STEP 16: GOOGLE SHEETS API ENDPOINTS
// ============================================================================
// These endpoints integrate with Google Sheets for student data

/**
 * GET /api/google-sheets/student-progress
 *
 * Fetches student progress from Google Sheets
 * Returns summary of each student's completed projects, points, etc.
 */
app.get('/api/google-sheets/student-progress', async (req, res) => {
    try {
        const studentProgress = await googleSheetsService.getStudentProgress();
        res.json({ success: true, students: studentProgress });
    } catch (error) {
        console.error('Error fetching student progress:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch student progress',
            message: error.message,
            offline: error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')
        });
    }
});

/**
 * POST /api/mark-attendance
 * Updates student attendance status
 */
app.post('/api/mark-attendance', async (req, res) => {
    try {
        const { rowIndex, status } = req.body;
        if (!rowIndex) {
            return res.status(400).json({ success: false, error: 'Row Index is required' });
        }

        await googleSheetsService.markStudentAttendance(rowIndex, status);
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/all-kids
 * API Endpoint: Get All Kids (Detailed)
 */
app.get('/api/all-kids', async (req, res) => {
    try {
        const kids = await googleSheetsService.fetchAllKids();
        res.json({ success: true, kids });
    } catch (error) {
        console.error('Error fetching all kids:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch kids data' });
    }
});


// Initialize cached data and sync headshots on startup
(async () => {
    try {
        await googleSheetsService.fetchStudents();
        console.log('✅ Initial student data cached');

        // Sync Headshots
        console.log('📸 Syncing headshots from Drive...');
        googleSheetsService.syncHeadshots().then(res => {
            console.log(`Heashot sync finished: ${res.downloaded} new files.`);
        }).catch(err => {
            console.error('Headshot sync warning:', err.message);
        });

    } catch (error) {
        console.error('⚠️ Initial data fetch failed:', error.message);
    }
})();

// Endpoint to force headshot sync
app.get('/api/sync-headshots', async (req, res) => {
    try {
        const result = await googleSheetsService.syncHeadshots();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/google-sheets/student-names
 * API Endpoint: Get list of students (for login dropdown) from Google Sheets
 */
app.get('/api/google-sheets/student-names', async (req, res) => {
    try {
        const studentNames = await googleSheetsService.fetchStudentNamesForLogin();
        res.json({ success: true, students: studentNames });
    } catch (error) {
        console.error('Error fetching student names:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch student names',
            message: error.message,
            offline: error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')
        });
    }
});

/**
 * GET /api/google-sheets/student-projects/:studentName
 *
 * Fetches a specific student's project assignments and progress from Google Sheets
 *
 * URL params:
 * - studentName: Name of the student
 *
 * Returns assigned, in-progress, and completed projects for this student
 */
app.get('/api/google-sheets/student-projects/:studentName', async (req, res) => {
    try {
        const studentName = decodeURIComponent(req.params.studentName);
        const studentData = await googleSheetsService.getStudentProjectsByName(studentName);
        res.json({ success: true, data: studentData });
    } catch (error) {
        console.error('Error fetching student projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch student projects',
            message: error.message,
            offline: error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')
        });
    }
});

/**
 * GET /api/all-projects
 *
 * Fetches ALL projects from Google Sheets "Projects List" tab.
 * Used for displaying the full project catalog in Online mode.
 *
 * Returns array of {id, name, description, category} objects
 */
app.get('/api/all-projects', async (req, res) => {
    try {
        const projects = await googleSheetsService.fetchAllProjectsDetailed();
        res.json({ success: true, projects: projects });
    } catch (error) {
        console.error('Error fetching all projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects',
            message: error.message
        });
    }
});

/**
 * GET /api/project-parts
 *
 * Fetches ALL project parts/videos from the LTBCLASSWEBAPP sheet.
 * Returns object grouped by project code.
 *
 * Response: { success: true, parts: { "PROJ101": [{...}, {...}], "PROJ102": [...] } }
 */
app.get('/api/project-parts', async (req, res) => {
    try {
        const parts = await googleSheetsService.fetchProjectParts();
        res.json({ success: true, parts: parts });
    } catch (error) {
        console.error('Error fetching project parts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project parts',
            message: error.message
        });
    }
});

/**
 * GET /api/project-parts/:projectCode
 *
 * Fetches parts/videos for a SPECIFIC project.
 * 
 * URL params:
 * - projectCode: The project code (e.g., PROJ101)
 *
 * Response: { success: true, projectCode: "PROJ101", parts: [{...}, {...}] }
 */
app.get('/api/project-parts/:projectCode', async (req, res) => {
    try {
        const projectCode = req.params.projectCode.toUpperCase();
        const allParts = await googleSheetsService.fetchProjectParts();
        const projectParts = allParts[projectCode] || [];

        res.json({
            success: true,
            projectCode: projectCode,
            parts: projectParts,
            count: projectParts.length
        });
    } catch (error) {
        console.error('Error fetching project parts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project parts',
            message: error.message
        });
    }
});

/**
 * POST /api/google-sheets/clear-cache
 *
 * Clears the Google Sheets data cache
 * Forces fresh data fetch on next request
 */
app.post('/api/google-sheets/clear-cache', (req, res) => {
    try {
        googleSheetsService.clearCache();
        res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear cache',
            message: error.message
        });
    }
});

// ============================================================================
// STEP 17: API ENDPOINT - SYNC STUDENTS FROM GOOGLE SHEETS TO LOCAL FILES
// ============================================================================
// This is the most important sync operation!
// Downloads data from Google Sheets and saves it locally for offline use

/**
 * POST /api/sync-students
 *
 * Syncs student names and assignments from Google Sheets to local JSON files
 * This enables offline functionality
 *
 * Process:
 * 1. Fetch student names from Google Sheets
 * 2. Save to data/students.json
 * 3. Fetch project log (all assignments/progress)
 * 4. Organize by student
 * 5. Save to data/student-assignments.json
 */
app.post('/api/sync-students', async (req, res) => {
    try {
        console.log('Syncing student names and assignments from Google Sheets...');

        // Step 1: Fetch student names from Google Sheets
        // Force refresh (don't use cache) to get latest data
        const studentNames = await googleSheetsService.fetchStudentNamesForLogin(true);

        // Step 2: Write student names to local JSON file
        const studentsPath = path.join(DATA_FOLDER, 'students.json');
        fs.writeFileSync(studentsPath, JSON.stringify(studentNames, null, 2));

        console.log(`Synced ${studentNames.length} students to local database`);

        // Step 3: Download headshots
        console.log('Syncing headshots...');
        // Sync Headshots from Drive (Non-blocking)
        const headshotResult = await googleSheetsService.syncHeadshots();

        // Sync Master Database (Non-blocking)
        googleSheetsService.syncMasterDatabase();

        // Step 4: Fetch all project log data from Google Sheets
        console.log('Fetching and caching student assignments...');
        const projectLog = await googleSheetsService.fetchProjectLog(true); // force refresh

        // Step 5: Organize assignments by student name
        // Create object where each key is a student name
        const studentAssignments = {};

        // Loop through each project entry
        projectLog.forEach(project => {
            // Skip entries without a student name
            if (!project.studentName) return;

            const studentName = project.studentName.trim();

            // Create student entry if it doesn't exist
            if (!studentAssignments[studentName]) {
                studentAssignments[studentName] = {
                    assignedProjects: [],
                    inProgressProjects: [],
                    completedProjects: []
                };
            }

            // Determine project status and categorize
            const statusLower = project.projectStatus ? project.projectStatus.toLowerCase() : '';

            // Build basic project data object
            const projectData = {
                name: project.projectName,
                status: project.projectStatus,
                type: project.projectType,
                assignType: project.assignType
            };

            // Categorize based on status
            if (statusLower.includes('completed')) {
                // This project is completed
                studentAssignments[studentName].completedProjects.push({
                    ...projectData,
                    completedDate: project.completedDate,
                    rating: project.rating,
                    points: project.points
                });
            } else if (statusLower.includes('progress') || statusLower.includes('working')) {
                // This project is in progress
                studentAssignments[studentName].inProgressProjects.push(projectData);
            } else if (statusLower.includes('assigned') || statusLower.includes('assign')) {
                // This project is newly assigned
                studentAssignments[studentName].assignedProjects.push(projectData);
            }
        });

        // Step 5: Write assignments to local JSON file
        const assignmentsPath = path.join(DATA_FOLDER, 'student-assignments.json');
        fs.writeFileSync(assignmentsPath, JSON.stringify(studentAssignments, null, 2));

        const totalStudentsWithData = Object.keys(studentAssignments).length;
        console.log(`Cached assignments for ${totalStudentsWithData} students`);

        // Send success response
        res.json({
            success: true,
            message: `Successfully synced ${studentNames.length} students, ${headshotResult.downloaded} headshots, and cached assignments for ${totalStudentsWithData} students`,
            studentsCount: studentNames.length,
            headshotsDownloaded: headshotResult.downloaded,
            assignmentsCount: totalStudentsWithData
        });
    } catch (error) {
        console.error('Error syncing students:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync students from Google Sheets',
            message: error.message,
            offline: error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')
        });
    }
});

// ============================================================================
// STEP 18: API ENDPOINT - GET STUDENT ASSIGNMENTS FROM LOCAL CACHE
// ============================================================================
// This endpoint works offline! It reads from local JSON files

/**
 * GET /api/student-assignments/:studentName
 *
 * Gets a student's assignments from local cache (offline-capable)
 *
 * URL params:
 * - studentName: Name of the student
 *
 * Returns:
 * - assignedProjects: Projects newly assigned to this student
 * - inProgressProjects: Projects student is working on
 * - completedProjects: Projects student has finished
 * - totalPoints: Sum of points earned
 */
app.get('/api/student-assignments/:studentName', (req, res) => {
    try {
        const studentName = req.params.studentName;
        const assignmentsPath = path.join(DATA_FOLDER, 'student-assignments.json');

        // Check if assignments cache exists
        if (!fs.existsSync(assignmentsPath)) {
            return res.status(404).json({
                success: false,
                error: 'Assignments cache not found',
                message: 'Please sync students from Google Sheets first',
                needsSync: true
            });
        }

        // Read assignments from cache
        const assignmentsData = fs.readFileSync(assignmentsPath, 'utf8');
        const allAssignments = JSON.parse(assignmentsData);

        // Get this specific student's assignments
        const studentData = allAssignments[studentName];

        // If student not found in cache, return empty data
        if (!studentData) {
            return res.json({
                success: true,
                data: {
                    studentName: studentName,
                    assignedProjects: [],
                    inProgressProjects: [],
                    completedProjects: [],
                    totalAssigned: 0,
                    totalInProgress: 0,
                    totalCompleted: 0,
                    totalPoints: 0
                },
                fromCache: true
            });
        }

        // Calculate total points from completed projects
        const totalPoints = studentData.completedProjects.reduce((sum, p) =>
            sum + (parseInt(p.points) || 0), 0
        );

        // Send student data
        res.json({
            success: true,
            data: {
                studentName: studentName,
                assignedProjects: studentData.assignedProjects || [],
                inProgressProjects: studentData.inProgressProjects || [],
                completedProjects: studentData.completedProjects || [],
                totalAssigned: studentData.assignedProjects ? studentData.assignedProjects.length : 0,
                totalInProgress: studentData.inProgressProjects ? studentData.inProgressProjects.length : 0,
                totalCompleted: studentData.completedProjects ? studentData.completedProjects.length : 0,
                totalPoints: totalPoints
            },
            fromCache: true
        });
    } catch (error) {
        console.error('Error reading student assignments from cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read assignments from cache',
            message: error.message
        });
    }
});

// ============================================================================
// STEP 18.5: API ENDPOINT - GET TODAY'S CLASSES
// ============================================================================
/**
 * GET /api/today-classes
 * 
 * Fetches booking info for today from Google Sheets
 * Returns list of students and their classes.
 */
app.get('/api/today-classes', async (req, res) => {
    try {
        console.log('Fetching today\'s classes...');
        // Force refresh to ensure we have latest bookings
        const bookings = await googleSheetsService.fetchBookingInfo(true);

        // Filter for today's date? 
        // fetchBookingInfo might return all bookings or just today's.
        // Let's assume it returns what is needed or we filter here.
        // If fetchBookingInfo returns a raw list, we might need to filter by date.
        // However, looking at the user request "You can see which are the kids coming to which class today from the 'All Booking Info' tab"
        // Let's rely on fetchBookingInfo to return the data and we send it to frontend.
        // If fetchBookingInfo is generic, we might want to filter, but let's send it all and let frontend filter or check implementation.
        // Actually, let's just return what fetchBookingInfo gives us.

        res.json({
            success: true,
            bookings: bookings
        });
    } catch (error) {
        console.error('Error fetching today\'s classes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch classes',
            message: error.message
        });
    }
});

// ============================================================================
// STEP 19: API ENDPOINT - TRIGGER PROJECT REDISCOVERY
// ============================================================================
// Manually trigger rescan of project folders (if new projects added)

/**
 * POST /api/rediscover-projects
 *
 * Rescans PROJECT_INSTRUCTIONS folder for projects
 * Use this after adding new project folders
 */
app.post('/api/rediscover-projects', (req, res) => {
    try {
        console.log('Rediscovering projects...');

        // Check if PROJECT_FOLDER exists
        if (!fs.existsSync(PROJECT_FOLDER)) {
            return res.status(404).json({
                success: false,
                error: 'PROJECT_INSTRUCTIONS folder not found',
                path: PROJECT_FOLDER
            });
        }

        // Find all projects recursively
        const projects = findProjects(PROJECT_FOLDER, []);

        console.log(`Rediscovered ${projects.length} projects`);

        res.json({
        });
    } catch (error) {
        console.error('Error rediscovering projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to rediscover projects',
            message: error.message
        });
    }
});

// ============================================================================
// API ENDPOINTS FOR INSTRUCTORS
// ============================================================================

/**
 * GET /api/instructors-list
 * Returns list of instructor names for login dropdown
 */
app.get('/api/instructors-list', async (req, res) => {
    try {
        const instructors = await googleSheetsService.fetchInstructors();
        const names = instructors.map(i => i.name).sort();
        res.json({ success: true, instructors: names });
    } catch (error) {
        console.error('Error fetching instructor list:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch instructors' });
    }
});

/**
 * POST /api/instructor-login
 * Validates instructor credentials
 */
app.post('/api/instructor-login', express.json(), async (req, res) => {
    try {
        const { name, passcode } = req.body;

        if (!name || !passcode) {
            return res.status(400).json({ success: false, error: 'Name and passcode required' });
        }

        const instructors = await googleSheetsService.fetchInstructors();
        const instructor = instructors.find(i => i.name === name);

        if (instructor && instructor.passcode === passcode) {
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Error logging in instructor:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

/**
 * GET /api/todays-students
 * Returns list of students booked for today
 */
app.get('/api/todays-students', async (req, res) => {
    try {
        const students = await googleSheetsService.fetchEnrichedBookingInfo();
        res.json({ success: true, students });
    } catch (error) {
        console.error('Error fetching todays students:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
    }
});

app.post('/api/inventory/update', async (req, res) => {
    try {
        const { itemId, kitName, newStatus, userEmail } = req.body;
        await googleSheetsService.updateInventory(itemId, kitName, newStatus, userEmail);
        res.json({ success: true });
    } catch (error) {
        console.error('Inventory update failed:', error);
        res.status(500).json({ success: false, error: 'Failed to update inventory' });
    }
});


// ============================================================================
// VIDEO UPLOAD ENDPOINT
// ============================================================================
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
    console.log('Received video upload request');

    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    // Sanitize filename to remove non-ascii chars which might cause issues
    const fileName = req.file.originalname.replace(/[^\x00-\x7F]/g, "");
    const mimeType = req.file.mimetype;

    try {
        console.log(`Starting upload to Drive: ${fileName} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

        // 1. Authenticate with Google Drive
        let auth;
        if (process.env.GOOGLE_CREDENTIALS) {
            // PROD: Use environment variable
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/drive'],
            });
        } else {
            // LOCAL: Use file
            auth = new google.auth.GoogleAuth({
                keyFile: config.CREDENTIALS_PATH,
                scopes: ['https://www.googleapis.com/auth/drive'],
            });
        }
        const drive = google.drive({ version: 'v3', auth });

        // 2. Stream file to Drive
        const fileMetadata = {
            name: fileName,
            parents: [config.VIDEO_UPLOAD_FOLDER_ID]
        };

        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(filePath)
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
            supportsAllDrives: true
        });

        console.log(`Upload complete! File ID: ${response.data.id}`);

        // 4. Set Permissions to "Anyone with the link"
        // This ensures the video can be played in the dashboard without sign-in
        await drive.permissions.create({
            fileId: response.data.id,
            supportsAllDrives: true, // Required for Shared Drives
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });
        console.log(`Permissions set to Public for File ID: ${response.data.id}`);

        // 3. Cleanup temp file
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });

        res.json({
            success: true,
            fileId: response.data.id,
            webViewLink: response.data.webViewLink
        });

    } catch (error) {
        console.error('Upload error DETAILS:', error);
        console.error('Full stack:', error.stack);
        // Cleanup on error too
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.status(500).json({ success: false, error: 'Server Failure: ' + error.message });
    }
});

// ============================================================================
// STUDENT DETAIL ENDPOINT (FOR INSTRUCTOR DASHBOARD)
// ============================================================================
// ----------------------------------------------------------------------------
// API: Get Student Projects by ID (Updated)
// ----------------------------------------------------------------------------
app.get('/api/student-projects/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        // Decode in case it's URL encoded (e.g. emails)
        const decodedId = decodeURIComponent(studentId);

        console.log(`[REQUEST] GET /api/student-projects/${studentId}`);

        // Force refresh for latest data
        const studentData = await googleSheetsService.getStudentProjects(decodedId, true);

        console.log(`Successfully retrieved projects for ID: ${decodedId}`);

        res.json({
            success: true,
            student: studentData
        });
    } catch (error) {
        console.error('Error fetching student history:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch student projects' });
    }
});

// ============================================================================
// PROJECT COMPLETION & ASSIGNMENT ENDPOINTS
// ============================================================================
app.post('/api/complete-project', async (req, res) => {
    try {
        const { studentId, projectCode, videoLink, rating, instructorName, status, date } = req.body;

        if (!studentId || !projectCode) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        console.log(`Completing project: ${projectCode} for Student ${studentId}`);

        const result = await googleSheetsService.markProjectComplete(studentId, projectCode, videoLink, rating, instructorName, status, date);

        res.json({ success: true, message: 'Project marked as complete' });

    } catch (error) {
        console.error('Error completing project:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// NEW: Assign a new project
app.post('/api/assign-project', async (req, res) => {
    try {
        const { studentId, projectCode, instructorName } = req.body;

        if (!studentId || !projectCode) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await googleSheetsService.assignProject(studentId, projectCode, instructorName || 'Instructor');
        res.json(result);

    } catch (error) {
        console.error('Error assigning project:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// NEW: Get full project list for dropdowns
app.get('/api/project-list', async (req, res) => {
    try {
        const projects = await googleSheetsService.fetchProjectList();
        res.json({ success: true, projects });
    } catch (error) {
        console.error('Error fetching project list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ADMIN: Setup Curriculum Tracks
// ============================================================================
app.post('/api/admin/setup-curriculum', async (req, res) => {
    try {
        const result = await googleSheetsService.setupCurriculumTracks();
        res.json(result);
    } catch (error) {
        console.error('Setup failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LEADERBOARD API
// ============================================================================
app.get('/api/leaderboard', async (req, res) => {
    try {
        const data = await googleSheetsService.getLeaderboard();
        res.json({ success: true, leaderboard: data });
    } catch (error) {
        console.error('Leaderboard fetch failed:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
    }
});

// ============================================================================
// STEP 20: API ENDPOINT - LIST STUDENT FOLDERS
// ============================================================================
// Returns list of all student folders in FINAL KIDS FILES

/**
 * GET /api/student-folders
 *
 * Lists all folders in FINAL KIDS FILES directory
 * Each folder represents one student's work
 */
app.get('/api/student-folders', (req, res) => {
    try {
        console.log('--- Request received for /api/student-folders ---');
        console.log('Resolved KIDS_FILES_FOLDER path:', KIDS_FILES_FOLDER);

        // Check if KIDS_FILES_FOLDER actually exists
        if (!fs.existsSync(KIDS_FILES_FOLDER)) {
            console.error('Error: Directory does not exist at path:', KIDS_FILES_FOLDER);
            return res.status(404).json({
                success: false,
                error: 'FINAL KIDS FILES folder not found on the server.',
                debug_path: KIDS_FILES_FOLDER
            });
        }

        console.log('Directory exists. Reading contents...');
        const items = fs.readdirSync(KIDS_FILES_FOLDER, { withFileTypes: true });
        console.log(`Found ${items.length} items in the directory.`);

        // Filter to only folders, and count files in each
        const folders = items
            .filter(item => item.isDirectory())
            .map(dir => {
                const folderPath = path.join(KIDS_FILES_FOLDER, dir.name);
                let fileCount = 0;
                try {
                    const files = fs.readdirSync(folderPath);
                    fileCount = files.filter(f =>
                        fs.statSync(path.join(folderPath, f)).isFile()
                    ).length;
                } catch (e) {
                    console.warn(`Could not read subdirectory ${dir.name}: ${e.message}`);
                }
                return {
                    name: dir.name,
                    fileCount: fileCount
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        console.log(`Filtered down to ${folders.length} directories.`);
        console.log('--- Request finished successfully ---');

        res.json({
            success: true,
            folders: folders,
            count: folders.length
        });
    } catch (error) {
        console.error('!!! Critical Error in /api/student-folders:', error);
        // Send a detailed error response to the frontend
        res.status(500).json({
            success: false,
            error: 'A critical error occurred on the server while reading folders.',
            message: error.message,
            stack: error.stack, // Send stack trace for debugging
            debug_path: KIDS_FILES_FOLDER
        });
    }
});

// ============================================================================
// STEP 21: API ENDPOINT - LIST FILES IN STUDENT FOLDER
// ============================================================================
// Returns list of files in a specific student's folder

/**
 * GET /api/student-folders/:folderName/files
 *
 * Lists all files in a specific student folder
 * Includes file metadata (size, type, modified date)
 *
 * URL params:
 * - folderName: Name of the student folder
 */
app.get('/api/student-folders/:folderName/files', (req, res) => {
    console.log(`[API] Fetching files for student: "${req.params.folderName}" (Raw URL: ${req.url})`);
    try {
        const folderName = decodeURIComponent(req.params.folderName);

        // --- SMART MATCHING LOGIC ---
        let targetFolderPath = null;
        let matchedName = null;

        // 1. Check for Exact Match first
        const exactPath = path.join(KIDS_FILES_FOLDER, folderName);
        if (fs.existsSync(exactPath)) {
            console.log(`[API] Exact folder match found: "${exactPath}"`);
            targetFolderPath = exactPath;
            matchedName = folderName;
        } else {
            // 2. Search for close matches
            console.log(`[API] Exact match failed. Searching closely in: "${KIDS_FILES_FOLDER}"`);
            if (fs.existsSync(KIDS_FILES_FOLDER)) {
                const allFolders = fs.readdirSync(KIDS_FILES_FOLDER, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const searchName = folderName.toLowerCase().trim();

                // Strategy A: Case-insensitive match
                let match = allFolders.find(f => f.toLowerCase().trim() === searchName);

                // Strategy B: Prefix match
                if (!match) {
                    match = allFolders.find(f => f.toLowerCase().startsWith(searchName));
                }

                if (match) {
                    console.log(`[API] Smart match found: "${match}"`);
                    targetFolderPath = path.join(KIDS_FILES_FOLDER, match);
                    matchedName = match;
                } else {
                    console.log(`[API] No match found for: "${searchName}"`);
                }
            } else {
                console.log(`[API] KIDS_FILES_FOLDER does not exist!`);
            }
        }

        if (!targetFolderPath) {
            console.log(`[API] Returning 404 JSON for folder: ${folderName}`);
            return res.status(404).json({
                success: false,
                error: 'Folder not found',
                path: folderName
            });
        }

        const folderPath = targetFolderPath;

        // SECURITY CHECK: Ensure path is within KIDS_FILES_FOLDER
        // This prevents path traversal attacks (like ../../system32)
        const resolvedPath = path.resolve(folderPath);
        const resolvedBase = path.resolve(KIDS_FILES_FOLDER);

        if (!resolvedPath.startsWith(resolvedBase)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Read files in the folder
        const items = fs.readdirSync(folderPath, { withFileTypes: true });

        const files = items
            .filter(item => item.isFile())
            .map(file => {
                const filePath = path.join(folderPath, file.name);
                const stats = fs.statSync(filePath);
                const ext = path.extname(file.name).toLowerCase();

                // Determine file type based on extension
                let fileType = 'other';
                if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
                    fileType = 'image';
                } else if (['.pdf'].includes(ext)) {
                    fileType = 'pdf';
                } else if (['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext)) {
                    fileType = 'video';
                } else if (['.sb3'].includes(ext)) {
                    fileType = 'scratch';
                } else if (['.py'].includes(ext)) {
                    fileType = 'python';
                } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
                    fileType = 'audio';
                } else if (['.txt', '.md', '.log'].includes(ext)) {
                    fileType = 'text';
                } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
                    fileType = 'archive';
                } else if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) {
                    fileType = 'document';
                }

                // Generate protocol URL for direct file opening
                // This uses custom protocol handlers registered on Windows
                const protocolUrl = `studentfile://${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}`;

                return {
                    name: file.name,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    modified: stats.mtime,
                    type: fileType,
                    extension: ext,
                    protocolUrl: protocolUrl
                };
            })
            .sort((a, b) => b.modified - a.modified);  // Sort by modified date (newest first)

        res.json({
            success: true,
            folderName: folderName,
            resolvedFolderName: matchedName || folderName,
            files: files,
            count: files.length
        });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list files',
            message: error.message
        });
    }
});

/**
 * Formats file size in bytes to human-readable format
 *
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted string like "1.5 MB"
 *
 * Examples:
 * - 500 → "500 Bytes"
 * - 2048 → "2 KB"
 * - 1572864 → "1.5 MB"
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================================================
// STEP 22: API ENDPOINT - GET UNC PATH FOR STUDENT FOLDER
// ============================================================================
// Generates Windows UNC path for opening folders over network

/**
 * GET /api/folder-path/:folderName
 *
 * Generates UNC (Universal Naming Convention) path for a student folder
 * This allows opening network folders from web links on Windows
 *
 * UNC format: \\ComputerName\ShareName\FolderName
 */
app.get('/api/folder-path/:folderName', (req, res) => {
    try {
        const folderName = decodeURIComponent(req.params.folderName);
        const serverName = os.hostname();  // Get computer's network name
        const shareName = 'KidsFiles';     // Network share name

        // Generate UNC path
        const uncPath = `\\\\${serverName}\\${shareName}\\${folderName}`;

        // Generate protocol URL for custom protocol handler
        const protocolUrl = `studentfolder://${encodeURIComponent(folderName)}`;

        res.json({
            success: true,
            uncPath: uncPath,
            protocolUrl: protocolUrl,
            serverName: serverName,
            shareName: shareName,
            folderName: folderName
        });
    } catch (error) {
        console.error('Error generating folder path:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate folder path',
            message: error.message
        });
    }
});

// ============================================================================
// STEP 23: API ENDPOINT - OPEN STUDENT FOLDER ON SERVER
// ============================================================================
// Opens the student's folder in the server's file explorer (Finder/Explorer)

/**
 * POST /api/open-student-folder
 * 
 * Opens a specific student folder on the server machine
 * Implements "Smart Matching" to find folders even if names vary slightly
 * 
 * Request body:
 * {
 *   folderName: "Student Name"
 * }
 */
app.post('/api/open-student-folder', express.json(), (req, res) => {
    try {
        const { folderName } = req.body;

        if (!folderName) {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        console.log(`Request to open folder for: "${folderName}"`);

        // --- SMART MATCHING LOGIC ---
        let targetFolderPath = null;
        let matchedName = null;

        // 1. Check for Exact Match first
        const exactPath = path.join(KIDS_FILES_FOLDER, folderName);
        if (fs.existsSync(exactPath)) {
            targetFolderPath = exactPath;
            matchedName = folderName;
        } else {
            // 2. Search for close matches
            console.log('Exact match not found. Searching for close matches...');

            // Check if we are looking for a file (contains separator)
            const parts = folderName.split(/[/\\]/);
            const isFileSearch = parts.length > 1;

            // If it's a file search, try to match the folder part first
            if (isFileSearch) {
                const fileName = parts.pop();
                const folderPart = parts.join(path.sep); // Reconstruct folder part

                if (fs.existsSync(KIDS_FILES_FOLDER)) {
                    const allFolders = fs.readdirSync(KIDS_FILES_FOLDER, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name);

                    const searchName = folderPart.toLowerCase().trim();
                    let match = allFolders.find(f => f.toLowerCase().trim() === searchName);
                    if (!match) {
                        match = allFolders.find(f => f.toLowerCase().startsWith(searchName));
                    }

                    if (match) {
                        // Found the folder, now check if file exists inside
                        const potentialPath = path.join(KIDS_FILES_FOLDER, match, fileName);
                        if (fs.existsSync(potentialPath)) {
                            targetFolderPath = potentialPath;
                            matchedName = `${match}/${fileName}`;
                            console.log(`Found smart match for file: "${matchedName}"`);
                        }
                    }
                }
            }

            // If not a file search or file not found, try matching as a folder (original logic)
            if (!targetFolderPath && fs.existsSync(KIDS_FILES_FOLDER)) {
                const allFolders = fs.readdirSync(KIDS_FILES_FOLDER, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const searchName = folderName.toLowerCase().trim();

                // Strategy A: Case-insensitive match
                let match = allFolders.find(f => f.toLowerCase().trim() === searchName);

                // Strategy B: Prefix match (e.g. "Jordan Spillers" matches "Jordan Spillers - Server 1")
                if (!match) {
                    match = allFolders.find(f => f.toLowerCase().startsWith(searchName));
                }

                if (match) {
                    targetFolderPath = path.join(KIDS_FILES_FOLDER, match);
                    matchedName = match;
                    console.log(`Found smart match: "${match}"`);
                }
            }
        }

        if (!targetFolderPath) {
            console.warn(`Folder/File not found for: ${folderName}`);
            return res.status(404).json({ error: 'Item not found', searchedFor: folderName });
        }

        // Security check
        if (!path.resolve(targetFolderPath).startsWith(path.resolve(KIDS_FILES_FOLDER))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Normalize path for the specific OS (fixes slash issues on Windows)
        const normalizedPath = path.normalize(targetFolderPath);
        console.log(`Opening item on server: ${normalizedPath}`);

        let command;
        switch (process.platform) {
            case 'darwin': // macOS
                command = `open "${normalizedPath}"`;
                break;
            case 'win32': // Windows
                // Use explorer for better reliability on Windows
                command = `explorer "${normalizedPath}"`;
                break;
            default: // Linux/Other
                command = `xdg-open "${normalizedPath}"`;
                break;
        }

        console.log(`Executing command: ${command}`);

        exec(command, (error) => {
            if (error) {
                console.error('Error opening item:', error);
                return res.status(500).json({ error: 'Failed to open item', details: error.message, command: command });
            }
            console.log('Item opened successfully');
            res.json({
                success: true,
                message: 'Item opened on server',
                matchedName: matchedName
            });
        });

    } catch (error) {
        console.error('Error in /api/open-student-folder:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// ============================================================================
// STEP 24: API ENDPOINT - GET SERVER STATUS
// ============================================================================
// This endpoint returns the server's start time, which can be used to verify restarts.
app.get('/api/server-status', (req, res) => {
    res.json({
        success: true,
        startTime: SERVER_START_TIME,
        uptime: Date.now() - SERVER_START_TIME
    });
});

// ============================================================================
// STEP 18: DISTRIBUTED RATING SYSTEM
// ============================================================================
// Handles student feedback on videos.
// ARCHITECTURE:
// - Writes to host-specific log files (ratings_<HOSTNAME>.jsonl) to avoid sync conflicts.
// - Reads from ALL log files to provide an aggregated view.

/**
 * POST /api/ratings
 * Saves a new rating.
 * Appends to data/ratings/ratings_<HOSTNAME>.jsonl
 */
app.post('/api/ratings', express.json(), (req, res) => {
    try {
        const { student, project, file, rating, comment } = req.body;

        if (!student || !project || !file || !rating) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const ratingRecord = {
            timestamp: new Date().toISOString(),
            hostname: os.hostname(),
            student,
            project,
            file,
            rating,
            comment: comment || ''
        };

        // Hostname-specific file path
        // Sanitize hostname just in case
        const safeHostname = os.hostname().replace(/[^a-zA-Z0-9-]/g, '_');
        const filename = `ratings_${safeHostname}.jsonl`;
        const filePath = path.join(RATINGS_FOLDER, filename);

        // Append to file (JSONL format: one JSON object per line)
        fs.appendFileSync(filePath, JSON.stringify(ratingRecord) + '\n');

        console.log(`[RATING] Saved rating from ${student} for ${file} on host ${safeHostname}`);
        res.json({ success: true });

    } catch (error) {
        console.error('Error saving rating:', error);
        res.status(500).json({ error: 'Failed to save rating' });
    }
});

/**
 * GET /api/ratings
 * Retrieves aggregated ratings from all synced server files.
 */
app.get('/api/ratings', (req, res) => {
    try {
        if (!fs.existsSync(RATINGS_FOLDER)) {
            return res.json({ ratings: [] });
        }

        const allRatings = [];
        const files = fs.readdirSync(RATINGS_FOLDER);

        files.forEach(file => {
            // Only process our partitioned log files
            if (file.startsWith('ratings_') && file.endsWith('.jsonl')) {
                const filePath = path.join(RATINGS_FOLDER, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split('\n');

                    lines.forEach(line => {
                        if (line.trim()) {
                            try {
                                allRatings.push(JSON.parse(line));
                            } catch (e) {
                                // Ignore malformed lines
                            }
                        }
                    });
                } catch (readErr) {
                    console.warn(`Could not read rating file ${file}: ${readErr.message}`);
                }
            }
        });

        // Sort by timestamp descending (newest first)
        allRatings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ ratings: allRatings });

    } catch (error) {
        console.error('Error fetching ratings:', error);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================
// Catches errors from Multer or other middlewares
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Unknown Server Error',
        stack: err.stack
    });
});




// ============================================================================
// STEP 18.5: API ENDPOINTS - INVENTORY Management
// ============================================================================

app.get('/api/inventory', async (req, res) => {
    try {
        const inventory = await googleSheetsService.fetchInventory();
        res.json({ success: true, ...inventory });
    } catch (error) {
        console.error('API Error: /api/inventory', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// ============================================================================
// STEP 19: START THE SERVER
// ============================================================================
// This actually starts the web server and makes it listen for connections
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n\n');
    console.log('=============================================');
    console.log('🚀 LEARNTOBOT SERVER STARTED');
    console.log('=============================================');
    console.log(`📡 Local Access:  http://localhost:${PORT}`);
    console.log('=============================================');
    console.log('\nPress Ctrl+C to stop the server\n');
});

/*
 * ============================================================================
 * END OF SERVER.JS
 * ============================================================================
 *
 * This server is now running and ready to:
 * - Serve web pages to students and teachers
 * - Provide real-time updates via WebSockets
 * - Sync with Google Sheets for student data
 * - Work offline using cached local files
 * - Enable teacher control of student screens
 * - Browse and manage student files
 *
 * The server will keep running until you:
 * - Press Ctrl+C in the terminal
 * - Close the terminal window
 * - Shut down the computer
 *
 * ============================================================================
 */
