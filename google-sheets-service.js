/*
 * ============================================================================
 * GOOGLE SHEETS SERVICE - DATA SYNCHRONIZATION MODULE
 * ============================================================================
 *
 * PURPOSE:
 * This file handles all communication with Google Sheets to fetch student data.
 * Think of it as a "translator" between Google Sheets and our web application.
 *
 * WHAT THIS FILE DOES:
 * 1. Connects to Google Sheets using API credentials
 * 2. Fetches student names from the "Child Names" sheet
 * 3. Fetches project assignments and progress from the "Project Log" sheet
 * 4. Caches data locally to reduce API calls and enable offline mode
 * 5. Provides functions for other parts of the app to get student data
 *
 * WHY WE NEED THIS:
 * - Google Sheets is where teachers manage student data (assignments, progress)
 * - This service downloads that data and makes it available to the web app
 * - Caching reduces internet usage and makes the app work offline
 *
 * IMPORTANT CONCEPTS:
 * - **Caching**: Storing downloaded data temporarily to avoid re-downloading
 * - **API**: A way for programs to talk to each other (we use Google Sheets API)
 * - **Async/Await**: JavaScript keywords for handling operations that take time
 *
 * ============================================================================
 */

// ============================================================================
// IMPORT DEPENDENCIES
// ============================================================================

const { google } = require('googleapis');  // Official Google APIs library
const fs = require('fs');                   // File system - for reading credential files
const path = require('path');               // Path utilities - for file paths
const config = require('./google-sheets-config');  // Our configuration settings

// ============================================================================
// CACHE VARIABLES
// ============================================================================
// These variables store downloaded data in memory to avoid repeated API calls
// Think of them as temporary storage bins

// Cache for student data from "Child Names" sheet
let studentsCache = null;          // Stores: [{id: "1", name: "Alice"}, ...]
let lastStudentsFetch = 0;         // Timestamp of last fetch

// Cache for project progress data from "Project Log" sheet
let progressCache = null;          // Stores: [{studentName: "Alice", projectName: "Calculator", ...}, ...]
let lastProgressFetch = 0;         // Timestamp of last fetch

// Cache for project list (Code -> Name map)
let projectListCache = null;       // Stores: Map("PROJ101" -> "Intro to Scratch")
let lastProjectListFetch = 0;      // Timestamp of last fetch

// Cache for login names (just the names, for login dropdown)
let loginNamesCache = null;        // Stores: ["Alice", "Bob", "Charlie", ...]
let lastLoginNamesFetch = 0;       // Timestamp of last fetch

// Cache for booking info
// Cache for booking info
let bookingCache = null;           // Stores filtered bookings for today
let lastBookingFetch = 0;          // Timestamp of last fetch

// Cache for instructor data
let instructorsCache = null;       // Stores: [{name: "Prof. Oak", passcode: "1234"}, ...]
let lastInstructorsFetch = 0;      // Timestamp of last fetch

// ============================================================================
// FUNCTION: Initialize Google Sheets API Client
// ============================================================================

/**
 * Creates and returns a Google Sheets API client
 * This client is used to make requests to Google Sheets
 *
 * @returns {Promise<Object>} - Google Sheets API client object
 * @throws {Error} - If credentials file is missing or invalid
 *
 * How it works:
 * 1. Check for GOOGLE_CREDENTIALS environment variable (for cloud deployment)
 * 2. Fall back to reading google-credentials.json file (for local/offline mode)
 * 3. Create an authentication object
 * 4. Create a Sheets API client with that auth
 * 5. Return the client ready to use
 */
async function getGoogleSheetsClient() {
    try {
        let credentials;

        // Check for environment variable first (for cloud deployment like Render)
        if (process.env.GOOGLE_CREDENTIALS) {
            try {
                credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
                console.log('Using Google credentials from environment variable');
            } catch (parseError) {
                throw new Error('Failed to parse GOOGLE_CREDENTIALS env var: ' + parseError.message);
            }
        } else {
            // Fall back to file for local/offline mode
            const credentialsPath = path.join(__dirname, config.CREDENTIALS_PATH);

            if (!fs.existsSync(credentialsPath)) {
                throw new Error('Google credentials not found. Set GOOGLE_CREDENTIALS env var or provide ' + config.CREDENTIALS_PATH);
            }

            credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            console.log('Using Google credentials from file');
        }

        // Create Google Auth object with credentials
        // This is like logging into Google with a special service account
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
        });

        // Get authenticated client
        const client = await auth.getClient();

        // Create Sheets API client
        const sheets = google.sheets({ version: 'v4', auth: client });

        return sheets;
    } catch (error) {
        console.error('Error initializing Google Sheets client:', error.message);
        throw error;
    }
}

/**
 * Creates and returns a Google Drive API client
 */
async function getGoogleDriveClient() {
    try {
        let credentials;
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            const credentialsPath = path.join(__dirname, config.CREDENTIALS_PATH);
            if (fs.existsSync(credentialsPath)) {
                credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            } else {
                throw new Error('Credentials not found');
            }
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });

        const client = await auth.getClient();
        return google.drive({ version: 'v3', auth: client });
    } catch (error) {
        console.error('Error initializing Google Drive client:', error.message);
        throw error;
    }
}

// ============================================================================
// FUNCTION: Sync Headshots from Drive
// ============================================================================

/**
 * Downloads all headshots from the configured Drive folder to public/headshots
 */
async function syncHeadshots() {
    console.log('🔄 Starting Headshot Sync...');
    const localDir = path.join(__dirname, 'public', 'headshots');

    // Ensure directory exists
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }

    try {
        const drive = await getGoogleDriveClient();
        const folderId = config.DRIVE_HEADSHOTS_FOLDER_ID;

        // List files in the folder
        // We only want images
        const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
            fields: 'files(id, name, mimeType)',
            pageSize: 1000
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            console.log('No headshots found in Drive folder.');
            return { success: true, count: 0, downloaded: 0 }; // Return success with 0 files
        }

        console.log(`Found ${files.length} headshots in Drive.`);
        let downloadCount = 0;

        for (const file of files) {
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_'); // Safety
            const localPath = path.join(localDir, sanitizedName);

            // Skip if exists (simple caching strategy)
            // Ideally we check mod time, but this suffices for static headshots
            if (fs.existsSync(localPath)) {
                continue;
            }

            console.log(`Downloading new headshot: ${file.name}...`);

            const dest = fs.createWriteStream(localPath);
            const response = await drive.files.get(
                { fileId: file.id, alt: 'media' },
                { responseType: 'stream' }
            );

            await new Promise((resolve, reject) => {
                response.data
                    .on('end', () => {
                        downloadCount++;
                        resolve();
                    })
                    .on('error', err => {
                        console.error(`Error downloading ${file.name}:`, err);
                        reject(err);
                    })
                    .pipe(dest);
            });
        }

        console.log(`✅ Headshot Sync Complete. Downloaded ${downloadCount} new images.`);
        return { success: true, count: files.length, downloaded: downloadCount };

    } catch (error) {
        console.error('❌ Headshot Sync Failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// FUNCTION: Fetch Students from Google Sheets
// ============================================================================

/**
 * Fetches student list from the "Child Names" sheet in Google Sheets
 * Uses caching to avoid unnecessary API calls
 *
 * @param {boolean} forceRefresh - If true, ignore cache and fetch fresh data
 * @returns {Promise<Array>} - Array of student objects: [{id, name}, ...]
 *
 * Example result:
 * [
 *   {id: "1", name: "Alice Johnson"},
 *   {id: "2", name: "Bob Smith"},
 *   ...
 * ]
 */
async function fetchStudents(forceRefresh = false) {
    const now = Date.now();

    // Check if we can use cached data
    // Cache is valid if:
    // 1. We're not forcing a refresh
    // 2. Cache exists
    // 3. Cache is not expired (less than CACHE_DURATION old)
    const cacheAge = now - lastStudentsFetch;
    if (!forceRefresh && studentsCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached students data');
        return studentsCache;
    }

    try {
        console.log('Fetching students from Google Sheets...');

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Fetch data from Google Sheets
        // Range "A:AH" to include Total Points (Column AH)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A:AH`,
        });

        // Extract rows from response
        const rows = response.data.values || [];

        // Process rows into student objects
        // Skip first row (header) and filter out empty rows

        // Cache local headshots for checking (Logic ported from fetchStudentNamesForLogin)
        let localHeadshots = new Set();
        const headshotsDir = path.join(__dirname, 'public', 'headshots');
        if (fs.existsSync(headshotsDir)) {
            const files = fs.readdirSync(headshotsDir);
            files.forEach(f => localHeadshots.add(f));
        }

        const students = rows.slice(1)
            .filter(row => row[0])  // Must have ID
            .map(row => {
                const headshotRaw = row[8] ? row[8].trim() : ''; // Column I (Index 8)
                let headshot = headshotRaw;

                // Map to local file if exists
                if (headshotRaw) {
                    let filename = path.basename(headshotRaw);
                    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

                    if (localHeadshots.has(filename)) {
                        headshot = `/headshots/${filename}`;
                    } else if (localHeadshots.has(sanitized)) {
                        headshot = `/headshots/${sanitized}`;
                    }
                }

                // NAME LOGIC: Prefer Column C (Login Name/Index 2) as it's cleaner. 
                // Fallback to Column B (Name/Index 1), then ID.
                // Also clean up if it looks like an email.
                let rawName = (row[2] && row[2].trim().length > 0) ? row[2].trim() : (row[1] ? row[1].trim() : 'Unknown');

                // Extra safety: if it's still an email, strip domain
                if (rawName.includes('@')) {
                    rawName = rawName.split('@')[0];
                    // Capitalize first letter
                    rawName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                }

                return {
                    id: row[0].trim(),    // Column A: Student ID
                    name: row[1] ? row[1].trim() : 'Unknown',  // Column B: Student Name
                    loginName: row[2] ? row[2].trim() : '',   // Column C: Login Name
                    fileLink: row[6] ? row[6].trim() : '',    // Column G: Drive Link
                    headshot: headshot,
                    note: row[23] ? row[23].trim() : '', // Column X
                    totalPoints: row[33] ? parseInt(row[33].replace(/\D/g, '') || '0', 10) : 0 // Column AH (Total Points)
                };
            });

        // Update cache
        studentsCache = students;
        lastStudentsFetch = now;

        console.log(`Fetched ${students.length} students`);
        return students;
    } catch (error) {
        console.error('Error fetching students:', error.message);

        // If fetch failed but we have old cached data, return it anyway
        // Better to show old data than no data
        if (studentsCache) {
            console.log('Returning stale cached data due to error');
            return studentsCache;
        }

        throw error;
    }
}

// ============================================================================
// FUNCTION: Fetch Project Log from Google Sheets
// ============================================================================

/**
 * Fetches the complete project log from Google Sheets
 * This log contains all student assignments, progress, and completions
 *
 * @param {boolean} forceRefresh - If true, ignore cache and fetch fresh data
 * @returns {Promise<Array>} - Array of project log entries
 *
 * Each entry contains:
 * - studentName: Name of the student
 * - projectName: Name of the project
 * - projectStatus: Status (Assigned, In Progress, Completed, etc.)
 * - completedDate: When completed (if applicable)
 * - rating: Student's rating of the project
 * - points: Points earned
 * - etc.
 */
async function fetchProjectLog(forceRefresh = false) {
    const now = Date.now();

    // Check if we can use cached data
    const cacheAge = now - lastProgressFetch;
    if (!forceRefresh && progressCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached progress data');
        return progressCache;
    }

    try {
        console.log('Fetching project log from Google Sheets...');

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Fetch data from Project Log sheet
        // Range "A:AC" means columns A through AC (all columns we need)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.PROGRESS_SHEET}!A:AC`,
        });

        // Extract rows from response
        const rows = response.data.values || [];

        // Process rows into project objects
        // Skip first row (header) and filter empty rows
        const projects = rows.slice(1)
            .filter(row => row.length > 0)
            .map(row => ({
                // Map each column to a named field using config
                id: row[config.PROGRESS_COLUMNS.ID] || '',
                date: row[config.PROGRESS_COLUMNS.DATE] || '',
                studentId: row[config.PROGRESS_COLUMNS.SID] || '',
                studentEmail: row[config.PROGRESS_COLUMNS.STUDENT_EMAIL] || '',
                studentName: row[config.PROGRESS_COLUMNS.STUDENT_NAME] || '',
                parentsName: row[config.PROGRESS_COLUMNS.PARENTS_NAME] || '',
                track: row[config.PROGRESS_COLUMNS.TRACK] || '',
                assignType: row[config.PROGRESS_COLUMNS.ASSIGN_TYPE] || '',
                projectName: row[config.PROGRESS_COLUMNS.PROJECT_NAME] || '',
                projectStatus: row[config.PROGRESS_COLUMNS.PROJECT_STATUS] || '',
                completedDate: row[config.PROGRESS_COLUMNS.COMPLETED_DATE] || '',
                projectType: row[config.PROGRESS_COLUMNS.PROJECT_TYPE] || '',
                rating: row[config.PROGRESS_COLUMNS.RATING] || '',
                projectType: row[config.PROGRESS_COLUMNS.PROJECT_TYPE] || '',
                rating: row[config.PROGRESS_COLUMNS.RATING] || '',
                points: row[config.PROGRESS_COLUMNS.POINTS] || '',
                videoLink: row[config.PROGRESS_COLUMNS.VIDEO_LINK] || ''
            }));

        // Update cache
        progressCache = projects;
        lastProgressFetch = now;

        console.log(`Fetched ${projects.length} project log entries`);
        return projects;
    } catch (error) {
        console.error('Error fetching project log:', error.message);

        // If fetch failed but we have old cached data, return it
        if (progressCache) {
            console.log('Returning stale cached progress data due to error');
            return progressCache;
        }

        // Try Offline Master DB
        console.warn('⚠️ Google API failed. Trying local Master DB...');
        const localDB = getLocalMasterDB();
        if (localDB && localDB.sheets && localDB.sheets[config.PROGRESS_SHEET]) {
            const rows = localDB.sheets[config.PROGRESS_SHEET] || [];

            // Re-process rows same as above
            const projects = rows.slice(1)
                .filter(row => row.length > 0)
                .map(row => ({
                    id: row[config.PROGRESS_COLUMNS.ID] || '',
                    date: row[config.PROGRESS_COLUMNS.DATE] || '',
                    studentId: row[config.PROGRESS_COLUMNS.SID] || '',
                    studentEmail: row[config.PROGRESS_COLUMNS.STUDENT_EMAIL] || '',
                    studentName: row[config.PROGRESS_COLUMNS.STUDENT_NAME] || '',
                    parentsName: row[config.PROGRESS_COLUMNS.PARENTS_NAME] || '',
                    track: row[config.PROGRESS_COLUMNS.TRACK] || '',
                    assignType: row[config.PROGRESS_COLUMNS.ASSIGN_TYPE] || '',
                    projectName: row[config.PROGRESS_COLUMNS.PROJECT_NAME] || '',
                    projectStatus: row[config.PROGRESS_COLUMNS.PROJECT_STATUS] || '',
                    completedDate: row[config.PROGRESS_COLUMNS.COMPLETED_DATE] || '',
                    projectType: row[config.PROGRESS_COLUMNS.PROJECT_TYPE] || '',
                    rating: row[config.PROGRESS_COLUMNS.RATING] || '',
                    points: row[config.PROGRESS_COLUMNS.POINTS] || ''
                }));

            console.log(`✅ Loaded ${projects.length} project log entries from Local Master DB.`);
            return projects;
        }

        throw error;
    }
}

// ============================================================================
// FUNCTION: Fetch Student Names for Login Dropdown
// ============================================================================

/**
 * Fetches just the student names (from column C) for login dropdown
 * This is simpler than fetchStudents() - just a list of names
 *
 * @param {boolean} forceRefresh - If true, ignore cache and fetch fresh data
 * @returns {Promise<Array<string>>} - Array of student names
 *
 * Example result:
 * ["Alice Johnson", "Bob Smith", "Charlie Brown", ...]
 */
async function fetchStudentNamesForLogin(forceRefresh = false) {
    const now = Date.now();

    // Check if we can use cached data
    const cacheAge = now - lastLoginNamesFetch;
    if (!forceRefresh && loginNamesCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached login names data');
        return loginNamesCache;
    }

    try {
        console.log('Fetching student login names and headshots from Google Sheets...');

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Fetch columns D (Name) through I (Headshot)
        // Range: "Child Names!D:I"
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!D:I`,
        });

        // Extract rows from response
        const rows = response.data.values || [];

        // Process rows into array of student objects
        // Skip header row, filter out empty cells
        // Column mapping relative to fetch range (D=0, E=1, ..., I=5)
        // Name is at index 0 (Column D)
        // Headshot is at index 5 (Column I)

        // Cache local headshots for checking
        let localHeadshots = new Set();
        const headshotsDir = path.join(__dirname, 'public', 'headshots');
        if (fs.existsSync(headshotsDir)) {
            const files = fs.readdirSync(headshotsDir);
            files.forEach(f => localHeadshots.add(f));
        }

        const students = rows.slice(1)
            .filter(row => row[0] && row[0].trim())
            .map(row => {
                const name = row[0].trim();
                let headshot = row[5] ? row[5].trim() : '';

                // Try to map to local file
                // Start by assuming Column I is the filename
                // Handle cases where it might be a full path "Folder/Image.jpg"
                let filename = path.basename(headshot);

                // Also handle sanitized versions we might have downloaded
                const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

                if (localHeadshots.has(filename)) {
                    headshot = `/headshots/${filename}`;
                } else if (localHeadshots.has(sanitized)) {
                    headshot = `/headshots/${sanitized}`;
                }

                return { name, headshot };
            });

        // Remove duplicates (based on name) and sort alphabetically
        // Using a Map to keep unique names (last one wins if duplicate)
        const uniqueStudentsMap = new Map();
        students.forEach(student => {
            uniqueStudentsMap.set(student.name, student);
        });

        const uniqueStudents = Array.from(uniqueStudentsMap.values())
            .sort((a, b) => a.name.localeCompare(b.name));

        // Update cache
        loginNamesCache = uniqueStudents;
        lastLoginNamesFetch = now;

        console.log(`Fetched ${uniqueStudents.length} students for login`);
        return uniqueStudents;
    } catch (error) {
        console.error('Error fetching student login names:', error.message);

        // If fetch failed but we have old cached data, return it
        if (loginNamesCache) {
            console.log('Returning stale cached login names due to error');
            return loginNamesCache;
        }

        throw error;
    }
}

/**
 * Fetches the list of all projects and creates a map of Code -> Full Name
 * 
 * @param {boolean} forceRefresh - If true, ignore cache
 * @returns {Promise<Map>} - Map of project code to full project name
 */
async function fetchProjectList(forceRefresh = false) {
    const now = Date.now();

    // Check cache
    const cacheAge = now - lastProjectListFetch;
    if (!forceRefresh && projectListCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached project list');
        return projectListCache;
    }

    try {
        console.log('Fetching project list from Google Sheets...');

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Fetch columns A (Code) and B (Name)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.PROJECT_LIST_SHEET}!A:B`,
        });

        const rows = response.data.values || [];
        const projectMap = new Map();

        // Skip header, process rows
        rows.slice(1).forEach(row => {
            const code = row[config.PROJECT_LIST_COLUMNS.CODE]; // Column A
            const name = row[config.PROJECT_LIST_COLUMNS.NAME]; // Column B

            if (code) {
                // If name is present, use it. If not, use code or empty string.
                // We want to return just the Name part if possible, or maybe both?
                // Requirement: "PROJxxx: <full project name>"
                // So this map will store the Full Name part.
                projectMap.set(code.trim().toUpperCase(), name ? name.trim() : '');
            }
        });

        // Update cache
        projectListCache = projectMap;
        lastProjectListFetch = now;

        return projectMap;

    } catch (error) {
        console.error('Error fetching project list:', error.message);
        if (projectListCache) return projectListCache;

        // Try Offline Master DB
        console.warn('⚠️ Google API failed. Trying local Master DB...');
        const localDB = getLocalMasterDB();
        if (localDB && localDB.sheets && localDB.sheets[config.PROJECT_LIST_SHEET]) {
            const rows = localDB.sheets[config.PROJECT_LIST_SHEET] || [];
            const projectMap = new Map();

            rows.slice(1).forEach(row => {
                const code = row[config.PROJECT_LIST_COLUMNS.CODE];
                const name = row[config.PROJECT_LIST_COLUMNS.NAME];

                if (code) {
                    projectMap.set(code.trim().toUpperCase(), name ? name.trim() : '');
                }
            });

            console.log(`✅ Loaded ${projectMap.size} project definitions from Local Master DB.`);
            return projectMap;
        }

        // Return empty map on failure if no cache
        return new Map();
    }
}

// ============================================================================
// FUNCTION: Fetch All Projects with Detailed Info (for Online UI)
// ============================================================================

// Cache for detailed projects
let projectDetailedCache = null;
let lastProjectDetailedFetch = 0;

/**
 * Fetches all projects from "Projects List" tab with full details for UI display.
 * Returns an array of project objects, not a map.
 *
 * @param {boolean} forceRefresh - If true, ignore cache and refetch
 * @returns {Promise<Array>} - Array of {id, name, description, category} objects
 */
async function fetchAllProjectsDetailed(forceRefresh = false) {
    const now = Date.now();

    // Check cache
    const cacheAge = now - lastProjectDetailedFetch;
    if (!forceRefresh && projectDetailedCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached detailed project list');
        return projectDetailedCache;
    }

    try {
        console.log('Fetching detailed project list from Google Sheets...');

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Fetch columns A through BF (1-58) to get all required data
        // BF is the 58th column (0-indexed = 57)
        // Using A:BF range to get Code, Name, Description, and Category
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.PROJECT_LIST_SHEET}!A:BF`,
        });

        const rows = response.data.values || [];
        const projects = [];

        // Skip header, process rows
        rows.slice(1).forEach(row => {
            const code = row[config.PROJECT_LIST_COLUMNS.CODE]; // Column A
            const name = row[config.PROJECT_LIST_COLUMNS.NAME]; // Column B
            const description = row[config.PROJECT_LIST_COLUMNS.DESCRIPTION]; // Column C
            const category = row[config.PROJECT_LIST_COLUMNS.CATEGORY]; // Column BF (index 57)

            if (code && code.trim()) {
                projects.push({
                    id: code.trim().toUpperCase(),
                    name: name ? name.trim() : code.trim(),
                    description: description ? description.trim() : '',
                    category: category ? category.trim() : 'Uncategorized'
                });
            }
        });

        // Update cache
        projectDetailedCache = projects;
        lastProjectDetailedFetch = now;

        console.log(`Fetched ${projects.length} detailed projects`);
        return projects;

    } catch (error) {
        console.error('Error fetching detailed project list:', error.message);
        if (projectDetailedCache) return projectDetailedCache;

        // Return empty array on failure if no cache
        console.warn('⚠️ Could not fetch detailed projects. Returning empty array.');
        return [];
    }
}

// ============================================================================
// FUNCTION: Fetch Project Parts (YouTube Videos) from LTBCLASSWEBAPP sheet
// ============================================================================

// Cache for project parts
let projectPartsCache = null;
let lastProjectPartsFetch = 0;

/**
 * Fetches all project parts/videos from the LTBCLASSWEBAPP sheet.
 * Returns grouped by project code for easy lookup.
 *
 * @param {boolean} forceRefresh - If true, ignore cache and refetch
 * @returns {Promise<Object>} - Object with projectCode as key, array of parts as value
 * 
 * Example return:
 * {
 *   "PROJ101": [
 *     { partNumber: 1, title: "Introduction", youtubeUrl: "...", duration: "5:30", coverImage: "..." },
 *     { partNumber: 2, title: "Your First Sprite", youtubeUrl: "...", duration: "8:15", coverImage: "..." }
 *   ],
 *   "PROJ102": [...]
 * }
 */
async function fetchProjectParts(forceRefresh = false) {
    const now = Date.now();

    // Check cache
    const cacheAge = now - lastProjectPartsFetch;
    if (!forceRefresh && projectPartsCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached project parts');
        return projectPartsCache;
    }

    try {
        console.log('Fetching project parts from Google Sheets (LTBCLASSWEBAPP)...');

        const sheets = await getGoogleSheetsClient();

        // Fetch all columns A through G
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.PROJECT_PARTS_SHEET}!A:G`,
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) {
            console.log('No project parts found (empty sheet or headers only)');
            return {};
        }

        // Group parts by project code
        const projectParts = {};

        rows.slice(1).forEach(row => {
            const projectCode = row[config.PROJECT_PARTS_COLUMNS.PROJECT_CODE];
            const youtubeUrl = row[config.PROJECT_PARTS_COLUMNS.YOUTUBE_URL];

            // Only include if we have at least project code and YouTube URL (required fields)
            if (!projectCode || !youtubeUrl) return;

            const code = projectCode.trim().toUpperCase();

            // Build part object - include all fields, but only if they have values
            const part = {
                projectCode: code,
                youtubeUrl: youtubeUrl.trim()
            };

            // Optional fields - only add if present
            const projectTitle = row[config.PROJECT_PARTS_COLUMNS.PROJECT_TITLE];
            const partNumber = row[config.PROJECT_PARTS_COLUMNS.PART_NUMBER];
            const partTitle = row[config.PROJECT_PARTS_COLUMNS.PART_TITLE];
            const duration = row[config.PROJECT_PARTS_COLUMNS.DURATION];
            const coverImage = row[config.PROJECT_PARTS_COLUMNS.COVER_IMAGE];

            if (projectTitle) part.projectTitle = projectTitle.trim();
            if (partNumber) part.partNumber = parseInt(partNumber) || 0;
            if (partTitle) part.partTitle = partTitle.trim();
            if (duration) part.duration = duration.trim();
            if (coverImage) part.coverImage = coverImage.trim();

            // Auto-generate cover image from YouTube URL if not provided
            if (!part.coverImage && part.youtubeUrl) {
                const videoId = extractYouTubeVideoId(part.youtubeUrl);
                if (videoId) {
                    part.coverImage = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                }
            }

            // Add to grouped result
            if (!projectParts[code]) {
                projectParts[code] = [];
            }
            projectParts[code].push(part);
        });

        // Sort parts by part number within each project
        Object.keys(projectParts).forEach(code => {
            projectParts[code].sort((a, b) => (a.partNumber || 0) - (b.partNumber || 0));
        });

        // Update cache
        projectPartsCache = projectParts;
        lastProjectPartsFetch = now;

        const totalParts = Object.values(projectParts).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`Fetched ${totalParts} parts for ${Object.keys(projectParts).length} projects`);
        return projectParts;

    } catch (error) {
        console.error('Error fetching project parts:', error.message);
        if (projectPartsCache) return projectPartsCache;
        return {};
    }
}

/**
 * Helper: Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url) {
    if (!url) return null;

    // Match various YouTube URL formats
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/  // Just the video ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}




/**
 * Builds a summary of each student's progress
 * Takes the project log and organizes it by student
 *
 * @returns {Promise<Array>} - Array of student progress objects
 *
 * Each object contains:
 * - id: Student ID
 * - name: Student name
 * - projects: Array of all their projects
 * - completedCount: How many projects completed
 * - inProgressCount: How many in progress
 * - totalPoints: Sum of points earned
 */
async function getStudentProgress() {
    try {
        // Fetch all project log entries
        const projects = await fetchProjectLog();

        // Build a map to organize projects by student
        // Key: student name
        // Value: student object with their projects
        const studentProgressMap = {};

        // Process each project entry
        projects.forEach(project => {
            const studentName = project.studentName;
            const studentId = project.studentId;

            // Skip entries without a student name
            if (!studentName || !studentName.trim()) {
                return;
            }

            // Create student entry if it doesn't exist yet
            if (!studentProgressMap[studentName]) {
                studentProgressMap[studentName] = {
                    id: studentId,
                    name: studentName,
                    projects: [],
                    completedCount: 0,
                    inProgressCount: 0,
                    totalPoints: 0
                };
            }

            // Add this project to the student's list
            studentProgressMap[studentName].projects.push(project);

            // Update counts based on project status
            const status = project.projectStatus || '';
            const statusLower = status.toLowerCase();

            if (statusLower.includes('completed')) {
                studentProgressMap[studentName].completedCount++;
            }

            if (statusLower.includes('progress') || statusLower.includes('working')) {
                studentProgressMap[studentName].inProgressCount++;
            }

            // Add points (convert to number, default to 0 if invalid)
            const points = parseInt(project.points) || 0;
            studentProgressMap[studentName].totalPoints += points;
        });

        // Convert map to array and sort by name
        const studentProgressArray = Object.values(studentProgressMap)
            .sort((a, b) => a.name.localeCompare(b.name));

        return studentProgressArray;
    } catch (error) {
        console.error('Error building student progress:', error.message);
        throw error;
    }
}

// ============================================================================
// FUNCTION: Get Projects for a Specific Student (ByName Wrapper)
// ============================================================================

/**
 * Wrapper to get projects by Name instead of ID
 * Resolves name to ID then calls getStudentProjects
 */
async function getStudentProjectsByName(studentName, forceRefresh = false) {
    try {
        console.log(`Getting projects for Name: ${studentName}`);

        // 1. Fetch all students to find the ID
        const students = await fetchStudents(false);
        const student = students.find(s =>
            (s.name && s.name.trim().toLowerCase() === studentName.trim().toLowerCase()) ||
            (s.loginName && s.loginName.trim().toLowerCase() === studentName.trim().toLowerCase())
        );

        if (!student) {
            console.error(`Student not found with name: "${studentName}". Available: ${students.length}`);
            throw new Error(`Student not found with name: ${studentName}`);
        }

        console.log(`Resolved Name "${studentName}" to ID "${student.id}"`);

        // 2. Reuse existing function with the found ID
        const result = await getStudentProjects(student.id, forceRefresh);

        // 3. Add studentName and fileLink to result for UI consistency
        result.studentName = student.name;
        result.fileLink = student.fileLink; // Pass the Drive Link to the frontend

        return result;

    } catch (error) {
        console.error(`Error resolving project by name ${studentName}:`, error);
        throw error;
    }
}

// ============================================================================
// FUNCTION: Get Projects for a Specific Student
// ============================================================================

/**
 * Gets all projects for a specific student, organized by status
 *
 * @param {string} studentName - Name of the student
 * @returns {Promise<Object>} - Object with assigned, in-progress, and completed projects
 *
 * Returns:
 * {
 *   studentName: "Alice Johnson",
 *   assignedProjects: [...],      // Projects newly assigned
 *   inProgressProjects: [...],    // Projects being worked on
 *   completedProjects: [...],     // Projects finished
 *   totalAssigned: 5,
 *   totalInProgress: 2,
 *   totalCompleted: 10,
 *   totalPoints: 1500
 * }
 */
async function getStudentProjects(studentId, forceRefresh = false) {
    try {
        console.log(`Getting projects for ID: ${studentId} (Refresh: ${forceRefresh})`);

        // Fetch all project log entries
        const projects = await fetchProjectLog(forceRefresh);

        // Fetch project name definitions (Code -> Full Name)
        const projectMap = await fetchProjectList(forceRefresh);

        // Helper to formatting
        // Code: "PROJ101" -> Map Value: "Introduction to Scratch"
        // Result: "PROJ101 - Introduction to Scratch"
        const formatProjectName = (code) => {
            if (!code) return 'Unknown Project';
            const cleanCode = code.trim();
            const fullName = projectMap.get(cleanCode.toUpperCase());
            if (fullName) {
                return `${cleanCode} - ${fullName}`;
            }
            return cleanCode; // Fallback to just the code
        };

        // Filter to only this student's projects (by ID)
        const studentProjects = projects.filter(project =>
            project.studentId === studentId
        );

        // Categorize projects by status
        const completedProjects = [];
        const inProgressProjects = [];
        const assignedProjects = [];
        const nextProjects = [];

        studentProjects.forEach(project => {
            const statusLower = project.projectStatus ? project.projectStatus.toLowerCase() : '';

            // Format the display name using our map
            const displayName = formatProjectName(project.projectName);

            // Determine category based on status keywords
            if (statusLower.includes('completed')) {
                // Completed project - include completion details
                completedProjects.push({
                    studentId: project.studentId, // Crucial: specific ID for this entry
                    id: project.projectName, // Frontend expects 'id'
                    name: displayName,
                    originalCode: project.projectName,
                    status: project.projectStatus,
                    email: project.studentEmail,
                    completedDate: project.completedDate,
                    type: project.projectType,
                    rating: project.rating,
                    points: project.points,
                    videoLink: project.videoLink // Includes public link if available
                });
            } else if (statusLower.includes('progress') || statusLower.includes('working')) {
                // In-progress project (treat as assigned for now or separate?)
                // User didn't specify, but "In Progress" is usually active. 
                // Let's keep it in "Assigned" or distinct. 
                // User said: "Assigned", "Next Project", "Completed".
                // "In Progress" fits best with "Assigned" (Active).
                inProgressProjects.push({
                    studentId: project.studentId, // Crucial: specific ID for this entry
                    id: project.projectName, // Frontend expects 'id'
                    name: displayName,
                    originalCode: project.projectName,
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType
                });
            } else if (statusLower.includes('next project')) {
                // Next Project
                nextProjects.push({
                    studentId: project.studentId,
                    id: project.projectName,
                    name: displayName,
                    originalCode: project.projectName,
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType,
                    date: project.date
                });
            } else if (statusLower.includes('assigned') || statusLower.includes('assign')) {
                // Newly assigned project
                assignedProjects.push({
                    studentId: project.studentId, // Crucial: specific ID for this entry
                    id: project.projectName, // Frontend expects 'id'
                    name: displayName,
                    originalCode: project.projectName,
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType,
                    date: project.date // Needed for sorting by latest assignment
                });
            }
        });

        // Calculate total points from completed projects
        const totalPoints = completedProjects.reduce((sum, p) =>
            sum + (parseInt(p.points) || 0), 0
        );

        // Return organized data
        return {
            studentName: studentProjects.length > 0 ? studentProjects[0].studentName : '',
            studentId: studentId,
            assignedProjects: assignedProjects,
            completedProjects: completedProjects,
            inProgressProjects: inProgressProjects,
            nextProjects: nextProjects, // NEW
            totalAssigned: assignedProjects.length,
            totalCompleted: completedProjects.length,
            totalInProgress: inProgressProjects.length,
            totalNext: nextProjects.length,
            totalPoints: totalPoints
        };
    } catch (error) {
        console.error('Error getting student projects:', error.message);
        throw error;
    }
}

// ============================================================================
// FUNCTION: Fetch Class Bookings
// ============================================================================

/**
 * Fetches bookings for TODAY from "All Booking Info"
 * Filters huge dataset efficiently
 *
 * @param {boolean} forceRefresh - If true, ignore cache
 * @returns {Promise<Array>} - Array of booking objects
 */
async function fetchBookingInfo(forceRefresh = false) {
    const now = Date.now();

    // Check cache
    const cacheAge = now - lastBookingFetch;
    if (!forceRefresh && bookingCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached booking data');
        return bookingCache;
    }

    try {
        console.log('Fetching & filtering bookings from Google Sheets...');

        // Get client
        const sheets = await getGoogleSheetsClient();

        // Fetch data
        // We fetch columns A to O (Student ID is in O)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.BOOKING_SHEET}!A:O`,
        });

        const rows = response.data.values || [];

        // Helper to format today's date to match sheet format: "Jan 1, 2024"
        const today = new Date();
        // Force Central Time to match class location, otherwise UTC servers (Render) will be a day ahead in the evening
        const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Chicago' };
        // Clean format: "Dec 6, 2025"
        const todayStr = today.toLocaleDateString('en-US', options);

        console.log(`Filtering for date: ${todayStr}`);

        // Filter for today
        // We map first to preserve the original row index (1-based)
        const bookings = rows
            .map((row, index) => ({ rowData: row, rowIndex: index + 1 })) // 1-based index
            .slice(1) // Skip header
            .filter(({ rowData }) => {
                const dateStr = rowData[config.BOOKING_COLUMNS.CLASS_DATE];
                if (!dateStr) return false;

                // Normalize strings for comparison (remove leading zeros, trim)
                // E.g. "01/02/2025" vs "1/2/2025"
                const normalizeDate = (d) => {
                    try {
                        return new Date(d).toDateString();
                    } catch (e) {
                        return d;
                    }
                };

                // 1. Direct String Match
                if (dateStr === todayStr) return true;

                // 2. Date Object Match
                const rowDate = new Date(dateStr);
                const isMatch = rowDate.toDateString() === today.toDateString();

                if (!isMatch) {
                    // Debug log for close misses
                    console.log(`[DEBUG] Skipping date: "${dateStr}" (Parsed: "${rowDate.toDateString()}") vs Target: "${today.toDateString()}"`);
                }

                return isMatch;
            })
            .map(({ rowData, rowIndex }) => ({
                studentName: rowData[config.BOOKING_COLUMNS.STUDENT_NAME],
                serviceTitle: rowData[config.BOOKING_COLUMNS.SERVICE_TITLE],
                classDate: rowData[config.BOOKING_COLUMNS.CLASS_DATE],
                checkedIn: (rowData[config.BOOKING_COLUMNS.CHECKED_IN] || '').toString().toUpperCase() === 'TRUE',
                studentId: rowData[config.BOOKING_COLUMNS.STUDENT_ID], // New ID field
                rowIndex: rowIndex
            }))
            .filter(b => b.studentName && b.serviceTitle); // Ensure valid data

        // Update cache
        bookingCache = bookings;
        lastBookingFetch = now;


        console.log(`Found ${bookings.length} bookings for today (${todayStr})`);
        return bookings;
    } catch (error) {
        console.error('Error fetching bookings:', error.message);
        if (bookingCache) return bookingCache;

        // Try Offline Master DB
        console.warn('⚠️ Google API failed. Trying local Master DB...');
        const localDB = getLocalMasterDB();
        if (localDB && localDB.sheets && localDB.sheets[config.BOOKING_SHEET]) {
            const rows = localDB.sheets[config.BOOKING_SHEET] || [];

            // Re-apply filtering logic locally
            const today = new Date();
            const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Chicago' };
            const todayStr = today.toLocaleDateString('en-US', options);
            console.log(`[Offline] Filtering for date: ${todayStr}`);

            const bookings = rows
                .map((row, index) => ({ rowData: row, rowIndex: index + 1 }))
                .slice(1)
                .filter(({ rowData }) => {
                    const dateStr = rowData[config.BOOKING_COLUMNS.CLASS_DATE];
                    if (dateStr === todayStr) return true;
                    const rowDate = new Date(dateStr);
                    return rowDate.toDateString() === today.toDateString();
                })
                .map(({ rowData, rowIndex }) => ({
                    studentName: rowData[config.BOOKING_COLUMNS.STUDENT_NAME],
                    serviceTitle: rowData[config.BOOKING_COLUMNS.SERVICE_TITLE],
                    classDate: rowData[config.BOOKING_COLUMNS.CLASS_DATE],
                    checkedIn: (rowData[config.BOOKING_COLUMNS.CHECKED_IN] || '').toString().toUpperCase() === 'TRUE',
                    studentId: rowData[config.BOOKING_COLUMNS.STUDENT_ID],
                    rowIndex: rowIndex
                }))
                .filter(b => b.studentName && b.serviceTitle);

            console.log(`✅ Loaded ${bookings.length} bookings from Local Master DB.`);
            return bookings;
        }

        throw error;
    }
}

// ============================================================================
// FUNCTION: Fetch Enriched Booking Info (Booking + Headshot + Project)
// ============================================================================

/**
 * Fetches bookings for today and enriches them with:
 * 1. Headshot URL (from Child Names sheet)
 * 2. Current Project (Latest assigned/in-progress from Project Log)
 * 
 * This provides a complete data object for the Instructor Dashboard
 * 
 * @returns {Promise<Array>} - Array of enriched student objects
 */
async function fetchEnrichedBookingInfo() {
    try {
        // 1. Get Today's Bookings
        const bookings = await fetchBookingInfo();
        if (bookings.length === 0) return [];

        // 2. Get Student Data (from Child Names sheet, keyed by ID)
        const students = await fetchStudents();
        const studentMap = new Map();
        students.forEach(s => {
            if (s.id) studentMap.set(s.id.trim(), s);
        });

        // 3. Get Project Logs
        const allProjects = await fetchProjectLog();
        const projectMap = await fetchProjectList();

        // Helper to find latest project for a student (by ID)
        const getLatestProject = (studentId) => {
            if (!studentId) return null;
            // Filter by ID instead of name
            const studentProjects = allProjects.filter(p =>
                p.studentId && p.studentId === studentId
            );

            if (studentProjects.length === 0) return null;

            // Prioritize IN PROGRESS
            const inProgress = studentProjects.filter(p =>
                p.projectStatus && (p.projectStatus.toLowerCase().includes('progress') || p.projectStatus.toLowerCase().includes('working'))
            );
            if (inProgress.length > 0) return inProgress[inProgress.length - 1]; // Latest in-progress

            // Then ASSIGNED
            const assigned = studentProjects.filter(p =>
                p.projectStatus && (p.projectStatus.toLowerCase().includes('assigned') || p.projectStatus.toLowerCase().includes('new'))
            );
            if (assigned.length > 0) return assigned[assigned.length - 1]; // Latest assigned

            // Fallback to just the very last entry
            return studentProjects[studentProjects.length - 1];
        };

        // 4. Merge Data
        const enrichedBookings = bookings.map(booking => {
            const sid = booking.studentId ? booking.studentId.trim() : '';
            const studentInfo = studentMap.get(sid);

            if (!studentInfo) {
                console.log(`[Link Warning] Booking ID "${sid}" not found in Child Names (Keys: ${studentMap.size}). Fallback Name: "${booking.studentName}"`);
            }

            const project = getLatestProject(sid);

            let currentProject = 'No active project';
            if (project) {
                const code = project.projectName.trim().toUpperCase();
                const fullName = projectMap.get(code);
                currentProject = fullName ? `${code} - ${fullName}` : project.projectName;
            }

            return {
                ...booking,
                // User Request: "Kids names are in Column E in 'All Booking Info' tab"
                // Prioritize the name from the Booking Sheet (booking.studentName)
                studentName: booking.studentName || (studentInfo ? studentInfo.name : 'Unknown'),
                headshot: studentInfo ? studentInfo.headshot : '',
                studentId: sid, // Ensure this is passed!
                currentProject: currentProject,
                note: studentInfo ? studentInfo.note : ''
            };
        });

        return enrichedBookings;

    } catch (error) {
        console.error('Error fetching enriched bookings:', error);
        throw error;
    }
}
// ============================================================================
// FUNCTION: Local Master Database (Offline Cache)
// ============================================================================
const MASTER_DB_PATH = path.join(__dirname, 'data', 'master_sheet_db.json');
const DATA_DIR = path.join(__dirname, 'data');

/**
 * Reads the local master database file
 * @returns {Object|null} The whole database object or null if not found
 */
function getLocalMasterDB() {
    try {
        if (fs.existsSync(MASTER_DB_PATH)) {
            const raw = fs.readFileSync(MASTER_DB_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('Error reading local master DB:', err.message);
    }
    return null;
}

/**
 * Downloads ALL tabs from the Google Sheet and saves to local JSON
 * Run this on server start and optionally via admin trigger
 */
async function syncMasterDatabase() {
    console.log('🔄 Starting Master Database Sync...');
    try {
        const sheets = await getGoogleSheetsClient();

        // 1. Get Spreadsheet Metadata to find all tabs
        const sections = await sheets.spreadsheets.get({
            spreadsheetId: config.SPREADSHEET_ID,
        });

        const sheetsList = sections.data.sheets;
        console.log(`Found ${sheetsList.length} tabs to sync.`);

        const fullDatabase = {
            lastUpdated: new Date().toISOString(),
            sheets: {}
        };

        // 2. Download each tab
        for (const sheet of sheetsList) {
            const title = sheet.properties.title;
            // console.log(`Downloading tab: ${title}...`);

            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: config.SPREADSHEET_ID,
                    range: `'${title}'!A:ZZ`, // Fetch everything
                });

                fullDatabase.sheets[title] = response.data.values || [];
            } catch (err) {
                console.error(`Failed to download tab "${title}":`, err.message);
            }
        }

        // 3. Save to file
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        fs.writeFileSync(MASTER_DB_PATH, JSON.stringify(fullDatabase, null, 2));
        console.log('✅ Master Database Sync Complete. Saved to:', MASTER_DB_PATH);
        return { success: true, count: Object.keys(fullDatabase.sheets).length };

    } catch (error) {
        console.error('❌ Master Database Sync Failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// FUNCTION: Fetch All Kids Data for All Kids Page
// ============================================================================

/**
 * Fetches detailed student data for the "All Kids" page
 * Includes Name, Parent Name, Email, and Headshot
 * Strategies:
 * 1. Try Google API (Online)
 * 2. If fail, Try Local Master DB (Offline)
 * 
 * @param {boolean} forceRefresh - If true, ignore cache
 * @returns {Promise<Array>} - Array of detailed student objects
 */
async function fetchAllKids(forceRefresh = false) {
    let rows = [];
    let source = 'ONLINE';

    try {
        console.log('Fetching All Kids data from Google Sheets...');
        const sheets = await getGoogleSheetsClient();

        // Fetch Columns A through I (Headshot is I)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A:I`,
        });

        rows = response.data.values || [];
    } catch (error) {
        console.warn('⚠️ Google API failed (Offline Mode?). Trying local Master DB...');

        const localDB = getLocalMasterDB();
        if (localDB && localDB.sheets && localDB.sheets[config.STUDENT_NAMES_SHEET]) {
            rows = localDB.sheets[config.STUDENT_NAMES_SHEET];
            console.log('✅ Loaded "Child Names" from Local Master DB.');
            source = 'OFFLINE';
        } else {
            console.error('❌ No local data available for fallback.');
            throw error; // Propagate original error if no fallback
        }
    }

    // Process rows (Logic is same for both sources)
    // Ensure we handle potential missing columns safely
    const kids = rows.slice(1)
        .filter(row => row[config.ALL_KIDS_COLUMNS.NAME]) // Must have name
        .map(row => ({
            id: row[config.ALL_KIDS_COLUMNS.ID] || '',
            id: row[config.ALL_KIDS_COLUMNS.ID] || '',
            name: row[config.ALL_KIDS_COLUMNS.NAME] || '',
            parentName: row[config.ALL_KIDS_COLUMNS.PARENT_NAME] || '',
            email: row[config.ALL_KIDS_COLUMNS.EMAIL] || '',
            headshot: row[config.ALL_KIDS_COLUMNS.HEADSHOT] || '',
            totalPoints: parseInt(row[config.ALL_KIDS_COLUMNS.TOTAL_POINTS] || '0', 10),
            totalPoints: parseInt(row[config.ALL_KIDS_COLUMNS.TOTAL_POINTS] || '0', 10),
            totalPoints: parseInt(row[config.ALL_KIDS_COLUMNS.TOTAL_POINTS] || '0', 10)
        }));

    console.log(`Fetched ${kids.length} kids for All Kids page (${source})`);
    return kids;
}


// ============================================================================
// FUNCTION: Clear Cache
// ============================================================================

/**
 * Clears all cached data
 * Forces fresh fetch from Google Sheets on next request
 *
 * Use this when:
 * - You know data has changed in Google Sheets
 * - You want to force a refresh
 * - You're troubleshooting data issues
 */
function clearCache() {
    studentsCache = null;
    progressCache = null;
    loginNamesCache = null;
    lastStudentsFetch = 0;
    lastProgressFetch = 0;
    lastLoginNamesFetch = 0;
    instructorsCache = null;
    lastInstructorsFetch = 0;
    console.log('Cache cleared');
}


// ============================================================================
// FUNCTION: Fetch Instructors
// ============================================================================

/**
 * Fetches instructor credentials from "instructors" sheet
 *
 * @param {boolean} forceRefresh - If true, ignore cache
 * @returns {Promise<Array>} - Array of instructor objects {name, passcode}
 */
async function fetchInstructors(forceRefresh = false) {
    const now = Date.now();

    // Check cache
    const cacheAge = now - lastInstructorsFetch;
    if (!forceRefresh && instructorsCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached instructor data');
        return instructorsCache;
    }

    try {
        console.log('Fetching instructor data from Google Sheets...');
        const sheets = await getGoogleSheetsClient();

        // Fetch Columns A through I (Passcode is I)
        // Range: "instructors!A:I"
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.INSTRUCTORS_SHEET}!A:I`,
        });

        const rows = response.data.values || [];

        // Process rows
        const instructors = rows.slice(1) // Skip header
            .filter(row => row[config.INSTRUCTOR_COLUMNS.NAME]) // Must have name
            .map(row => ({
                name: row[config.INSTRUCTOR_COLUMNS.NAME].trim(),
                passcode: row[config.INSTRUCTOR_COLUMNS.PASSCODE] ? row[config.INSTRUCTOR_COLUMNS.PASSCODE].trim() : ''
            }));

        // Update cache
        instructorsCache = instructors;
        lastInstructorsFetch = now;

        console.log(`Fetched ${instructors.length} instructors`);
        return instructors;
    } catch (error) {
        console.error('Error fetching instructors:', error.message);
        // Try fallback to local master DB if available
        if (instructorsCache) return instructorsCache;

        // Try offline master DB as last resort
        const localDB = getLocalMasterDB();
        if (localDB && localDB.sheets && localDB.sheets[config.INSTRUCTORS_SHEET]) {
            const rows = localDB.sheets[config.INSTRUCTORS_SHEET];
            const instructors = rows.slice(1)
                .filter(row => row[config.INSTRUCTOR_COLUMNS.NAME])
                .map(row => ({
                    name: row[config.INSTRUCTOR_COLUMNS.NAME].trim(),
                    passcode: row[config.INSTRUCTOR_COLUMNS.PASSCODE] ? row[config.INSTRUCTOR_COLUMNS.PASSCODE].trim() : ''
                }));
            console.log('Returning instructors from local Master DB');
            return instructors;
        }

        throw error;
    }
}

// ============================================================================
// FUNCTION: Mark Student Attendance
// ============================================================================

/**
 * Marks a student as present (Checked In) in the Google Sheet
 * @param {number} rowIndex - The row index in the 'All Booking Info' sheet
 * @param {boolean} status - TRUE for present, FALSE for absent/unchecked
 */
async function markStudentAttendance(rowIndex, status) {
    if (!rowIndex) throw new Error('Row Index is required');

    try {
        console.log(`Marking attendance for Row ${rowIndex}: ${status}`);
        const sheets = await getGoogleSheetsClient();

        // Update Column N (14th column, so index 13)
        // Range: All Booking Info!N{rowIndex}
        const range = `${config.BOOKING_SHEET}!N${rowIndex}`;
        const value = status ? 'TRUE' : 'FALSE';

        await sheets.spreadsheets.values.update({
            spreadsheetId: config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'RAW',
            resource: {
                values: [[value]]
            }
        });

        // Invalidate cache so UI refreshes with new data
        bookingCache = null;
        lastBookingFetch = 0;

        return { success: true };
    } catch (error) {
        console.error('Error marking attendance:', error);
        throw error;
    }
}


// ============================================================================
// FUNCTION: Fetch and Update Inventory
// ============================================================================

/**
 * Fetches the entire inventory with dynamic kit detection
 * 
 * @param {boolean} forceRefresh 
 * @returns {Promise<Object>} { items: [], kits: ['KIT1', 'KIT2'] }
 */
async function fetchInventory(forceRefresh = false) {
    try {
        console.log('Fetching inventory...');
        const sheets = await getGoogleSheetsClient();

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.INVENTORY_SHEET}!A:Z`,
        });

        const rows = response.data.values || [];
        if (rows.length === 0) return { items: [], kits: [] };

        const headers = rows[0];
        const kitColumns = {};

        headers.forEach((header, index) => {
            if (header && header.toLowerCase().includes('current stock in')) {
                const parts = header.split(' in ');
                if (parts.length > 1) {
                    const kitName = parts[1].trim();
                    kitColumns[kitName] = index;
                }
            }
        });

        const kits = Object.keys(kitColumns);
        console.log('Detected Kits:', kits);

        const items = rows.slice(1).map((row, rowIndex) => {
            const item = {
                id: row[config.INVENTORY_COLUMNS.ID],
                product: row[config.INVENTORY_COLUMNS.PRODUCT],
                image: row[config.INVENTORY_COLUMNS.IMAGE],
                stocks: {},
                rowIndex: rowIndex + 2
            };

            kits.forEach(kit => {
                const colIndex = kitColumns[kit];
                const val = row[colIndex];
                item.stocks[kit] = val ? parseInt(val) : 0;
            });

            return item;
        }).filter(i => i.id);

        return { items, kits };

    } catch (error) {
        console.error('Error fetching inventory:', error);
        throw error;
    }
}

/**
 * Updates the inventory quantity for a specific item and kit
 */
async function updateInventory(itemId, kitName, newQuantity, userEmail) {
    try {
        console.log(`Updating ${itemId} in ${kitName} to ${newQuantity} by ${userEmail}`);
        const sheets = await getGoogleSheetsClient();

        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.INVENTORY_SHEET}!A1:Z1`,
        });

        if (!headerRes.data.values || headerRes.data.values.length === 0) {
            throw new Error("Could not read headers from Inventory sheet.");
        }
        const headers = headerRes.data.values[0];
        let kitColIndex = -1;

        headers.forEach((h, i) => {
            if (h && h.includes(`in ${kitName}`)) kitColIndex = i;
        });

        if (kitColIndex === -1) throw new Error(`Kit '${kitName}' not found in headers`);

        const idRes = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.INVENTORY_SHEET}!A:A`,
        });
        const idRows = idRes.data.values || [];
        let targetRowIndex = -1;

        for (let i = 0; i < idRows.length; i++) {
            if (idRows[i][0] === itemId) {
                targetRowIndex = i + 1;
                break;
            }
        }

        if (targetRowIndex === -1) throw new Error('Item ID not found');

        const getColLetter = (n) => {
            let letters = '';
            let temp = n;
            while (temp >= 0) {
                letters = String.fromCharCode(65 + (temp % 26)) + letters;
                temp = Math.floor(temp / 26) - 1;
            }
            return letters;
        };

        const kitColLetter = getColLetter(kitColIndex);
        const logTimeColLetter = getColLetter(config.INVENTORY_COLUMNS.LAST_LOG_TIME);
        const logUserColLetter = getColLetter(config.INVENTORY_COLUMNS.LAST_LOG_USER);

        const updates = [
            {
                range: `${config.INVENTORY_SHEET}!${kitColLetter}${targetRowIndex}`,
                values: [[newQuantity]]
            },
            {
                range: `${config.INVENTORY_SHEET}!${logTimeColLetter}${targetRowIndex}`,
                values: [[new Date().toLocaleString()]]
            },
            {
                range: `${config.INVENTORY_SHEET}!${logUserColLetter}${targetRowIndex}`,
                values: [[userEmail]]
            }
        ];

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: config.SPREADSHEET_ID,
            resource: {
                data: updates,
                valueInputOption: 'USER_ENTERED'
            }
        });

        console.log('Inventory update successful');
        return { success: true };

    } catch (error) {
        console.error('Inventory update failed:', error);
        throw error;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getGoogleSheetsClient,
    getGoogleDriveClient,
    syncHeadshots,
    fetchStudents,
    fetchProjectLog,
    fetchStudentNamesForLogin,
    getStudentProgress,
    getStudentProjects,
    getStudentProjectsByName,       // Added for online login flow
    fetchProjectList,
    fetchAllProjectsDetailed,       // Added for online projects display
    fetchProjectParts,              // Added for YouTube video parts
    fetchBookingInfo,
    fetchEnrichedBookingInfo,
    syncMasterDatabase,
    fetchAllKids,
    fetchInstructors,
    markStudentAttendance,
    getLocalMasterDB,
    clearCache,
    fetchInventory,
    updateInventory
};
