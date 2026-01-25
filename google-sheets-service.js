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
                'https://www.googleapis.com/auth/drive'
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
            scopes: ['https://www.googleapis.com/auth/drive'],
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

                    // DEBUG LOGGING FOR ADITI
                    if (row[1] && row[1].includes('Aditi')) {
                        console.log(`[DEBUG FETCH] Aditi Found: Col B='${row[1]}', Col C='${row[2]}'. Filename='${filename}', Sanitized='${sanitized}', LocalFound=${localHeadshots.has(sanitized)}`);
                    }
                }

                // NAME LOGIC: User wants Full Name from Column C (Index 2).
                // Column B (Index 1) is Short Name.
                let finalName = (row[2] && row[2].trim()) ? row[2].trim() : (row[1] ? row[1].trim() : 'Unknown');

                return {
                    id: row[0].trim(),    // Column A: Student ID
                    id: row[0].trim(),    // Column A: Student ID
                    isActive: (row[12] && (['yes', 'true', 'active'].includes(row[12].trim().toLowerCase()))) || false, // Column M: Active Status ('active', 'yes', 'true')
                    name: finalName,      // PRIORITIZE COL C
                    loginName: row[2] ? row[2].trim() : '',   // Column C: Login Name
                    fileLink: row[6] ? row[6].trim() : '',    // Column G: Drive Link
                    headshot: headshot,
                    note: row[23] ? row[23].trim() : '', // Column X
                    track: row[28] ? row[28].trim() : '', // Column AC (Index 28)
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
    // DISABLE CACHE IN ONLINE MODE
    const isOnline = process.env.MODE === 'ONLINE' || process.env.MODE === 'CLOUD';

    if (!forceRefresh && !isOnline && progressCache && cacheAge < config.CACHE_DURATION) {
        console.log('Returning cached progress data');
        return progressCache;
    } else if (isOnline) {
        console.log(`[CACHE SKIPPED] Online Mode active (${process.env.MODE}). Fetching fresh data.`);
    }

    try {
        console.log('Fetching project log from Google Sheets...');

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Fetch data from Project Log sheet
        console.log(`[DEBUG] Fetching Project Log from Sheet ID: ${config.SPREADSHEET_ID}`);
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
            .map((row, i) => ({
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
                videoLink: row[config.PROGRESS_COLUMNS.VIDEO_LINK] || '',
                uniqueId: i + 2  // Store the 1-based Row Index for updates/deletion
            }));

        // Update cache
        progressCache = projects;
        lastProgressFetch = now;

        console.log(`Fetched ${projects.length} project log entries`);
        return projects;
    } catch (error) {
        console.error('Error fetching project log:', error);

        // If fetch failed but we have old cached data, return it
        if (progressCache) {
            console.log('Returning stale cached progress data due to error');
            return progressCache;
        }

        // DISABLED FALLBACK FOR DEBUGGING
        console.error('CRITICAL: GOOGLE SHEET FETCH FAILED. THROWING ERROR INSTEAD OF FALLBACK.');
        throw error;

        /*
        // Try Offline Master DB
        console.warn('⚠️ Google API failed. Trying local Master DB...');
        const localDB = getLocalMasterDB();
        if (localDB && localDB.sheets && localDB.sheets[config.PROGRESS_SHEET]) {
            const rows = localDB.sheets[config.PROGRESS_SHEET] || [];

            // Re-process rows same as above
            const projects = rows.slice(1)
                .filter(row => row.length > 0)
                .map((row, i) => ({
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
                    rating: row[config.PROGRESS_COLUMNS.RATING] || '',
                    points: row[config.PROGRESS_COLUMNS.POINTS] || '',
                    uniqueId: i + 2
                }));

            console.log(`✅ Loaded ${projects.length} project log entries from Local Master DB.`);
            return projects;
        }

        throw error;
        */
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

        // Fetch columns A (ID) through AI (All Project Access)
        // Range: "Child Names!A:AI"
        // A=ID(0), B=ShortName(1), C=LoginName(2), ... H=FileLink(6), ... J=Headshot(8), ... AI=AllProjectAccess(34)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A:AI`,
        });

        // Extract rows from response
        const rows = response.data.values || [];

        // Process rows into array of student objects
        // Skip header row, filter out empty cells
        // Column mapping relative to fetch range (B=0, C=1, ..., I=7)
        // Name is at index 0 (Column B)
        // Headshot is at index 7 (Column I)

        // Cache local headshots for checking
        let localHeadshots = new Set();
        const headshotsDir = path.join(__dirname, 'public', 'headshots');
        if (fs.existsSync(headshotsDir)) {
            const files = fs.readdirSync(headshotsDir);
            files.forEach(f => localHeadshots.add(f));
        }

        const students = rows.slice(1)
            .filter(row => {
                const id = row[0] ? row[0].trim() : '';
                // ID must exist and contain more than just a slash or empty string
                return id && id.length > 1 && id !== '/';
            })
            .map(row => {
                // ID: Column A (Index 0)
                const id = row[0].trim();

                // User Feedback: Column C (Index 2) has the Full Name, Column B (Index 1) has Short Name.
                // So we prioritize Column C.
                const name = (row[2] && row[2].trim()) ? row[2].trim() : row[1].trim();

                // Headshot: Column I (Index 8 from A)
                let headshot = row[8] ? row[8].trim() : '';

                // File Link: Column G (Index 6 from A)
                const fileLink = row[6] ? row[6].trim() : '';

                // AllProjectAccess: Column AI (Index 34 from A)
                const allProjectAccess = row[34] ? row[34].trim().toLowerCase() : '';

                // Try to map to local file
                let filename = path.basename(headshot);
                const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

                if (localHeadshots.has(filename)) {
                    headshot = `/headshots/${filename}`;
                } else if (localHeadshots.has(sanitized)) {
                    headshot = `/headshots/${sanitized}`;
                }

                return {
                    id, // INCLUDE ID
                    name,
                    headshot,
                    fileLink,
                    allProjectAccess: allProjectAccess === 'yes'
                };
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
        if (uniqueStudents.length > 0) {
            console.log(`[DEBUG] First Student ID Check: ${JSON.stringify(uniqueStudents[0])}`);
        }
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

        // Fetch columns A (Code) through BF (Category)
        // A=0, B=1 ... BF=57. So range A:BF cover all.
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.PROJECT_LIST_SHEET}!A:BF`,
        });

        const rows = response.data.values || [];
        const projectMap = new Map();

        // Skip header, process rows
        rows.slice(1).forEach(row => {
            const code = row[config.PROJECT_LIST_COLUMNS.CODE]; // Column A
            const name = row[config.PROJECT_LIST_COLUMNS.NAME]; // Column B
            const category = row[config.PROJECT_LIST_COLUMNS.CATEGORY]; // Column BF
            const description = row[config.PROJECT_LIST_COLUMNS.DESCRIPTION]; // Column C
            const studentActivity = row[config.PROJECT_LIST_COLUMNS.STUDENT_ACTIVITY]; // Column E
            const points = row[config.PROJECT_LIST_COLUMNS.POINTS]; // Column BD

            if (code) {
                // Return object { name, category, description, studentActivity, points }
                projectMap.set(code.trim().toUpperCase(), {
                    name: name ? name.trim() : '',
                    category: category ? category.trim() : 'Other',
                    description: description ? description.trim() : '',
                    studentActivity: studentActivity ? studentActivity.trim() : '',
                    points: points ? parseInt(points.replace(/\D/g, '') || '0', 10) : 0
                });
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
            const studentActivity = row[config.PROJECT_LIST_COLUMNS.STUDENT_ACTIVITY]; // Column E
            const icon = row[config.PROJECT_LIST_COLUMNS.ICON]; // Column M
            const category = row[config.PROJECT_LIST_COLUMNS.CATEGORY]; // Column BF (index 57)

            if (code && code.trim()) {
                projects.push({
                    id: code.trim().toUpperCase(),
                    name: name ? name.trim() : code.trim(),
                    description: description ? description.trim() : '',
                    studentActivity: studentActivity ? studentActivity.trim() : '',
                    icon: icon ? icon.trim() : null,
                    points: row[config.PROJECT_LIST_COLUMNS.POINTS] ? parseInt(row[config.PROJECT_LIST_COLUMNS.POINTS].replace(/\D/g, '') || '0', 10) : 0,
                    recommendedTracks: row[config.PROJECT_LIST_COLUMNS.RECOMMENDED_TRACK] ? row[config.PROJECT_LIST_COLUMNS.RECOMMENDED_TRACK].trim() : '',
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
        result.studentId = student.id; // NEW: Return resolved ID
        result.fileLink = student.fileLink; // Pass the Drive Link to the frontend
        result.track = student.track;       // Pass the Track to the frontend for filtering

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
        // Code: "PROJ101" -> Map Value: { name: "Intro", category: "Python" }
        // Result: "PROJ101 - Intro"
        const formatProjectName = (code) => {
            if (!code) return 'Unknown Project';
            const cleanCode = code.trim();
            const projectInfo = projectMap.get(cleanCode.toUpperCase());
            if (projectInfo && projectInfo.name) {
                return `${cleanCode} - ${projectInfo.name}`;
            }
            return cleanCode; // Fallback to just the code
        };

        // Filter to only this student's projects (by ID)
        console.log(`[DEBUG] Filtering ${projects.length} projects for Student ID: "${studentId}"`);
        if (projects.length > 0) {
            console.log(`[DEBUG] Sample Project ID from log: "${projects[0].studentId}"`);
        }

        const studentProjects = projects.filter(project => {
            // Loose equality to catch number/string mismatches
            // formatting both to string and trim
            const pId = String(project.studentId).trim();
            const sId = String(studentId).trim();
            return pId === sId;
        });

        console.log(`[DEBUG] Found ${studentProjects.length} matching projects.`);

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
                // Get extended details from projectMap
                const projectInfo = projectMap.get(project.projectName.trim().toUpperCase());

                completedProjects.push({
                    studentId: project.studentId,
                    id: project.id || project.projectName, // FIX: Use ID (Project Code)
                    name: displayName,
                    originalCode: project.projectName,
                    description: projectInfo ? projectInfo.description : '', // New Field
                    studentActivity: projectInfo ? projectInfo.studentActivity : '', // New Field
                    status: project.projectStatus,
                    email: project.studentEmail,
                    completedDate: project.completedDate,
                    type: project.projectType,
                    rating: project.rating,
                    points: project.points || (projectInfo ? projectInfo.points : 0), // Prefer log points, fallback to def
                    videoLink: project.videoLink, // Includes public link if available
                    uniqueId: project.uniqueId // Pass row index for deletion
                });
            } else if (statusLower.includes('progress') || statusLower.includes('working')) {
                // In-progress project
                const projectInfo = projectMap.get(project.projectName.trim().toUpperCase());

                inProgressProjects.push({
                    studentId: project.studentId,
                    id: project.id || project.projectName, // FIX: Use ID (Project Code)
                    name: displayName,
                    originalCode: project.projectName,
                    description: projectInfo ? projectInfo.description : '',
                    studentActivity: projectInfo ? projectInfo.studentActivity : '',
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType,
                    points: projectInfo ? projectInfo.points : 0, // Add Points!
                    uniqueId: project.uniqueId // Pass row index
                });
            } else if (statusLower === 'next' || statusLower.includes('next project')) {
                // Next Project (matches "Next", "Next Project", "next project", etc.)
                const projectInfo = projectMap.get(project.projectName.trim().toUpperCase());

                nextProjects.push({
                    studentId: project.studentId,
                    id: project.id || project.projectName, // FIX: Use ID (Project Code)
                    name: displayName,
                    originalCode: project.projectName,
                    description: projectInfo ? projectInfo.description : '',
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType,
                    date: project.date,
                    points: projectInfo ? projectInfo.points : 0, // Add Points!
                    uniqueId: project.uniqueId // Pass row index
                });
            } else if (statusLower.includes('assigned') || statusLower.includes('assign')) {
                // Newly assigned project
                const projectInfo = projectMap.get(project.projectName.trim().toUpperCase());

                assignedProjects.push({
                    studentId: project.studentId,
                    id: project.id || project.projectName, // FIX: Use ID (Project Code)
                    name: displayName,
                    originalCode: project.projectName,
                    description: projectInfo ? projectInfo.description : '',
                    studentActivity: projectInfo ? projectInfo.studentActivity : '',
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType,
                    date: project.date, // Needed for sorting by latest assignment
                    points: projectInfo ? projectInfo.points : 0, // Add Points!
                    uniqueId: project.uniqueId // Pass row index for deletion
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
                    // Debug log for close misses (Commented out to reduce noise)
                    // console.log(`[DEBUG] Skipping date: "${dateStr}" (Parsed: "${rowDate.toDateString()}") vs Target: "${today.toDateString()}"`);
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
async function fetchEnrichedBookingInfo(forceRefresh = false) {
    try {
        // 1. Get Today's Bookings
        const bookings = await fetchBookingInfo(forceRefresh);
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
                const projectInfo = projectMap.get(code);
                const fullName = projectInfo ? projectInfo.name : '';
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

        // Fetch Columns A through AH (Total Points is AH)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A:AH`,
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
            name: row[config.ALL_KIDS_COLUMNS.NAME] || '',
            parentName: row[config.ALL_KIDS_COLUMNS.PARENT_NAME] || '',
            email: row[config.ALL_KIDS_COLUMNS.EMAIL] || '',
            headshot: row[config.ALL_KIDS_COLUMNS.HEADSHOT] || '',
            note: row[config.ALL_KIDS_COLUMNS.NOTE] || '',
            totalPoints: parseInt(row[config.ALL_KIDS_COLUMNS.TOTAL_POINTS] || '0', 10),
            age: row[config.ALL_KIDS_COLUMNS.AGE] || '',
            serviceTitle: row[config.ALL_KIDS_COLUMNS.SERVICE_TITLE] || ''
        }));

    console.log(`Fetched ${kids.length} kids for All Kids page (${source})`);
    return kids;
}

/**
 * Updates the note for a specific student in the "Child Names" sheet
 * 
 * @param {string} studentId - The ID of the student
 * @param {string} note - The new note text
 * @returns {Promise<Object>} - Success status
 */
async function updateStudentNote(studentId, note) {
    console.log(`Updating note for student ${studentId}...`);

    // 1. Fetch all students to find the row index
    // We need fresh data to ensure row indices are correct, but can rely on cache if recently updated
    // For now, let's just fetch IDs to be safe/fast? 
    // Actually simpler to just fetch all students (row A) to map ID to Row Index.

    try {
        const sheets = await getGoogleSheetsClient();

        // Fetch just Column A (IDs) to find the row
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A:A`,
        });

        const rows = response.data.values || [];
        // Find row index where Column A matches studentId
        // rows[0] is header, so index 0 corresponds to Sheet Row 1.

        const rowIndex = rows.findIndex(row => row[0] && row[0].trim() === studentId.trim());

        if (rowIndex === -1) {
            throw new Error(`Student ID ${studentId} not found in sheet.`);
        }

        // Sheet Row Number (1-based) = rowIndex + 1
        const sheetRow = rowIndex + 1;
        const columnLetter = config.STUDENT_COLUMNS.NOTE; // 'X'

        // Update the specific cell
        await sheets.spreadsheets.values.update({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!${columnLetter}${sheetRow}`,
            valueInputOption: 'RAW',
            resource: {
                values: [[note]]
            }
        });

        // Invalidate caches that might hold student data
        studentsCache = null;

        console.log(`✅ Updated note for student ${studentId} at row ${sheetRow}`);
        return { success: true };

    } catch (error) {
        console.error('Error updating student note:', error);
        throw error;
    }
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
        // Also map update columns: kitName -> columnIndex
        const updateColumns = {};

        // Known columns to exclude from being treated as Kits
        const EXCLUDED_HEADERS = ['id', 'product', 'image', 'photo', 'last log', 'last update', 'barcode', 'item'];

        headers.forEach((header, index) => {
            if (!header) return;
            const h = header.toLowerCase();

            // 1. Detect Kit Stock Columns
            // Heuristic:
            // - Contains "current stock" OR "stock" OR "qty" OR "quantity"
            // - OR starts with "kit" or "station"
            // - AND does NOT contain "last update" or other excluded terms (unless it's "stock in kit...")

            let isKitCol = false;
            let kitName = '';

            // Pattern 1: "Current Stock in KIT1" or "Stock in KIT1"
            if (h.includes('stock in')) {
                const parts = header.split(/stock in/i);
                if (parts.length > 1) {
                    kitName = parts[1].trim();
                    isKitCol = true;
                }
            }
            // Pattern 2: "KIT1" or "Station 1" (and not excluded)
            else if ((h.startsWith('kit') || h.startsWith('station')) && !h.includes('update')) {
                kitName = header.trim();
                isKitCol = true;
            }
            // Pattern 3: Fallback based on config position? 
            // If we are in the "Kit Zone" (between Image and Last Log)
            // But relying on headers is safer if they are labelled.

            if (isKitCol && kitName) {
                // Check against exclusions just in case
                if (!EXCLUDED_HEADERS.some(ex => h.includes(ex) && !h.includes('stock'))) {
                    kitColumns[kitName] = index;
                }
            }

            // 2. Detect Update Columns: "Last Update KIT1"
            if (h.includes('last update')) {
                // Try to extract kit name
                // "Last Update KIT1" -> "KIT1"
                const name = header.replace(/last update/i, '').trim();
                if (name) {
                    updateColumns[name] = index;
                }
            }
        });

        // Fallback: If no kits detected by name, use the indices from config
        // Assuming Columns G (6) to K (10) are kits if headers failed
        if (Object.keys(kitColumns).length === 0) {
            console.log('⚠️ No kits detected by name. Using fallback indices 6-10.');
            // Check headers at 6,7,8,9,10
            [6, 7, 8, 9, 10].forEach(idx => {
                if (headers[idx]) {
                    const inferredName = headers[idx];
                    // Only use if not excluded
                    if (!EXCLUDED_HEADERS.some(ex => inferredName.toLowerCase().includes(ex))) {
                        kitColumns[inferredName] = idx;
                    }
                }
            });
        }

        const kits = Object.keys(kitColumns);
        console.log('Detected Kits:', kits);
        console.log('Detected Update Columns:', Object.keys(updateColumns));

        const items = rows.slice(1).map((row, rowIndex) => {
            const item = {
                id: row[config.INVENTORY_COLUMNS.ID],
                product: row[config.INVENTORY_COLUMNS.PRODUCT],
                image: row[config.INVENTORY_COLUMNS.IMAGE],
                stocks: {},
                lastUpdated: {}, // New object to hold timestamps
                rowIndex: rowIndex + 2
            };

            kits.forEach(kit => {
                // Get Stock (now string status: Low/Medium/Full)
                const colIndex = kitColumns[kit];
                const val = row[colIndex];
                item.stocks[kit] = val ? val.trim() : '';

                // Get Last Update for this kit
                const updateColIndex = updateColumns[kit];
                if (updateColIndex !== undefined) {
                    item.lastUpdated[kit] = row[updateColIndex] || '';
                } else {
                    item.lastUpdated[kit] = ''; // No timestamp column found
                }
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
 * Updates the inventory status for a specific item and kit
 */
async function updateInventory(itemId, kitName, newStatus, userEmail) {
    try {
        console.log(`Updating ${itemId} in ${kitName} to '${newStatus}' by ${userEmail}`);
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
        let updateColIndex = -1;

        headers.forEach((h, i) => {
            if (!h) return;
            // Find Kit Stock Column
            if (h.includes(`in ${kitName}`)) kitColIndex = i;
            // Find Kit Update Timestamp Column (Exact match "Last Update KIT1")
            // Assuming header format is "Last Update KIT1"
            if (h === `Last Update ${kitName}`) updateColIndex = i;
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
                values: [[newStatus]]
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

        // Add Kit Specific Update Time if column exists
        if (updateColIndex !== -1) {
            const updateColLetter = getColLetter(updateColIndex);
            updates.push({
                range: `${config.INVENTORY_SHEET}!${updateColLetter}${targetRowIndex}`,
                values: [[new Date().toLocaleString()]] // Use nice readable format
            });
            console.log(`Writing per-kit timestamp to column ${updateColLetter}`);
        } else {
            console.log(`No specific update column found for 'Last Update ${kitName}'. Skipping.`);
        }

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
// FUNCTION: Get Leaderboard Data
// ============================================================================

/**
 * Fetches rankings for the leaderboard
 * Calculates points from Project Log based on All Time, Month, and Week
 */
async function getLeaderboard(forceRefresh = false) {
    try {
        console.log('Fetching leaderboard data...');

        // 1. Get Base Student Data (ID, Name, Headshot)
        const students = await fetchStudents(forceRefresh);

        // 2. Get Project Log Data (All completions)
        const projectLog = await fetchProjectLog(forceRefresh);

        // 3. Initialize Points Map
        // Map<StudentID, { total, monthly, weekly }>
        const pointsMap = new Map();

        // Initialize all students with 0 points
        students.forEach(s => {
            // Use ID from Column A
            if (s.id) {
                pointsMap.set(s.id, { total: 0, monthly: 0, weekly: 0 });
            }
        });

        // 4. Calculate Points
        const now = new Date();

        // Calculate 30 Days Ago (for "This Month" rolling window)
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        // Calculate 7 Days Ago (for "This Week" rolling window)
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);

        projectLog.forEach(project => {
            const sid = project.studentId;
            const points = parseInt(project.points || '0', 10);
            const dateStr = project.date; // Column B

            if (!sid || !pointsMap.has(sid) || isNaN(points)) return;

            // Update All Time
            const stats = pointsMap.get(sid);
            stats.total += points;

            // Parse Date
            if (dateStr) {
                const pDate = new Date(dateStr);
                // Check if valid date
                if (!isNaN(pDate.getTime())) {
                    // Check Month (Rolling 30 Days)
                    if (pDate >= thirtyDaysAgo) {
                        stats.monthly += points;
                    }

                    // Check Week (Rolling 7 Days)
                    if (pDate >= sevenDaysAgo) {
                        stats.weekly += points;
                    }
                }
            }
        });

        // 5. Merge Data
        const leaderboard = students.map(s => {
            const stats = pointsMap.get(s.id) || { total: 0, monthly: 0, weekly: 0 };

            return {
                id: s.id,
                name: s.loginName || s.name, // Use Login Name if available
                headshot: s.headshot,
                email: s.email,
                isActive: s.isActive, // Propagate Active Status
                totalPoints: stats.total,
                monthlyPoints: stats.monthly,
                weeklyPoints: stats.weekly
            };
        });

        // Sort by total points descending default
        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

        console.log(`Generated leaderboard with ${leaderboard.length} entries`);
        return leaderboard;

    } catch (error) {
        console.error('Error in getLeaderboard:', error);
        throw error;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Assigns a new project to a student
 */
async function assignProject(studentId, projectCode, instructorName) {
    console.log(`Assigning Project ${projectCode} to Student ${studentId}`);

    // 1. Get Student Data
    const students = await fetchStudents();
    const student = students.find(s => s.id === studentId);

    if (!student) {
        throw new Error(`Student not found with ID: ${studentId}`);
    }

    // 2. Get Project Data
    const projectsMap = await fetchProjectList(); // Returns Map<Code, Name>
    // Ensure we handle case insensitivity if needed, but Map is case sensitive.
    // Assuming codes are uppercase standard.
    const projectName = projectsMap.get(projectCode) || projectsMap.get(projectCode.toUpperCase());

    if (!projectName) {
        throw new Error(`Project not found with Code: ${projectCode}`);
    }

    // 3. Prepare Row Data
    const uniqueId = Math.random().toString(36).substring(2, 10).toUpperCase(); // 8 char unique ID

    // Date Format: mm/dd/yyyy
    const now = new Date();
    const date = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    // Timestamp Format: M/d/yyyy H:mm:ss (Approximate, using locale)
    const timestamp = now.toLocaleString('en-US', { hour12: false }).replace(',', '');

    // Construct Row (0-indexed)
    // A=0, B=1, ... V=21, W=22
    const rowValues = new Array(23).fill('');

    rowValues[0] = uniqueId;                    // Col A: Unique ID
    rowValues[1] = date;                        // Col B: Date
    rowValues[2] = student.id;                  // Col C: SID
    rowValues[3] = student.id.includes('@') ? student.id : ''; // Col D: Email (Best effort)
    rowValues[4] = student.name;                // Col E: Student Name

    rowValues[7] = 'Web App';                   // Col H: Assign Type
    rowValues[8] = projectCode;                 // Col I: Project Code (Requirement: PROJxxx)
    rowValues[9] = 'Assigned';                  // Col J: Project Status

    rowValues[21] = instructorName;             // Col V: Last Edited by
    rowValues[22] = timestamp;                  // Col W: Last Edited time

    // 4. Append to Sheet
    const sheets = await getGoogleSheetsClient();

    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${config.PROGRESS_SHEET}!A:A`, // Force append to Col A, avoids appending to far right
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [rowValues]
        }
    });

    const updatedRange = response.data.updates.updatedRange; // e.g., "'Project Log'!A100:W100"
    console.log(`Successfully assigned project ${projectName} (ID: ${uniqueId})`);
    console.log(`[SPREADSHEET UPDATE] Written to: ${updatedRange}`);

    return { success: true, uniqueId };
}

/**
 * Deletes a project assignment from the log based on Unique ID
 * @param {string} uniqueId 
 */
async function deleteProjectLog(uniqueId) {
    console.log(`Attempting to delete project log with ID: ${uniqueId}`);
    const sheets = await getGoogleSheetsClient();

    // 1. Fetch Column A (Unique IDs) to find the row index
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${config.PROGRESS_SHEET}!A:A`,
    });

    const rows = response.data.values || [];
    // Find the row index (adding 1 because values array is 0-indexed but Sheets rows are 1-indexed)
    const rowIndex = rows.findIndex(row => row[0] === uniqueId);

    if (rowIndex === -1) {
        throw new Error(`Project Log with ID ${uniqueId} not found.`);
    }

    const sheetId = await getSheetIdByName(sheets, config.SPREADSHEET_ID, config.PROGRESS_SHEET);

    // 2. Delete the row
    // Note: rowIndex in 'values' is 0-based relative to the data range. 
    // If getting A:A, row[0] corresponds to A1.
    // batchUpdate deleteDimension uses 0-indexed start and exclusive end.

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.SPREADSHEET_ID,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex,
                        endIndex: rowIndex + 1
                    }
                }
            }]
        }
    });

    console.log(`Deleted row ${rowIndex + 1} for ID ${uniqueId}`);
    return { success: true };
}

/**
 * Helper to get Sheet ID (GID) from Name
 */
async function getSheetIdByName(sheets, spreadsheetId, sheetName) {
    const response = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
    });

    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) {
        throw new Error(`Sheet with name ${sheetName} not found`);
    }
    return sheet.properties.sheetId;
}


// ============================================================================
// FUNCTION: Delete Project Entry (Mark as Deleted)
// ============================================================================

/**
 * Marks a project entry as "Deleted" in Google Sheets.
 * 
 * @param {string|number} rowIndex - The 1-based row index to update (uniqueId)
 * @param {string} instructorName - Name of instructor performing deletion
 * @returns {Promise<boolean>} - True if successful
 */
async function deleteProjectEntry(rowIndex, instructorName = 'System') {
    try {
        console.log(`🗑️ Deleting project entry at Row ${rowIndex}...`);

        const sheets = await getGoogleSheetsClient();
        const sheetName = config.PROGRESS_SHEET;

        // Columns to update:
        // J (Index 9) -> "Deleted"
        // V (Index 21) -> Instructor Name
        // W (Index 22) -> Timestamp

        // Note: Google Sheets API 1-based rows.
        // We use A1 notation: Sheet!J{row}, Sheet!V{row}, Sheet!W{row}

        const timestamp = new Date().toLocaleString(); // Format: 1/2/2026 15:43:40 (approx)

        // Using batchUpdate with valueInputOption
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: config.SPREADSHEET_ID,
            resource: {
                data: [
                    {
                        range: `${sheetName}!J${rowIndex}`,
                        values: [['Deleted']]
                    },
                    {
                        range: `${sheetName}!V${rowIndex}`,
                        values: [[instructorName]]
                    },
                    {
                        range: `${sheetName}!W${rowIndex}`,
                        values: [[timestamp]]
                    }
                ],
                valueInputOption: 'USER_ENTERED'
            }
        });

        console.log(`✅ Marked Row ${rowIndex} as Deleted.`);

        // Invalidate cache so UI refreshes correctly
        progressCache = null;

        return true;

    } catch (error) {
        console.error('❌ Error deleting project entry:', error);
        throw error;
    }
}

// ============================================================================
// FUNCTION: FULL STUDENT EDIT (DYNAMIC)
// ============================================================================

/**
 * Fetches the entire row for a student + Headers
 * @param {string} studentId 
 */
async function fetchStudentFullDetails(studentId) {
    console.log(`Fetching full details for student ID: ${studentId}`);
    const sheets = await getGoogleSheetsClient();
    const sheetName = config.STUDENT_NAMES_SHEET;

    // 1. Fetch Headers (Row 1)
    const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${sheetName}!1:1`
    });
    const headers = headerRes.data.values ? headerRes.data.values[0] : [];

    // 2. Fetch All Data (A:Z or whatever) - To find the row
    // We need to find the row index first.
    // Fetch Column A only to search efficiently.
    const idRes = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${sheetName}!A:A`
    });

    const rows = idRes.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] && row[0].toString().trim() === studentId.toString().trim());

    if (rowIndex === -1) {
        throw new Error('Student ID not found');
    }

    // rowIndex is 0-based index in the 'values' array.
    // Actual Sheet Row is rowIndex + 1.
    const actualRow = rowIndex + 1;

    // 3. Fetch the Specific Row ( Entire Row )
    const rowRes = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${sheetName}!${actualRow}:${actualRow}`
    });

    const rowData = rowRes.data.values ? rowRes.data.values[0] : [];

    return {
        headers: headers,
        row: rowData,
        rowIndex: actualRow,
        studentId: studentId
    };
}

/**
 * Updates a student's full record
 * @param {string} studentId 
 * @param {Array} newValues - Array of values matching the header order
 */
async function updateStudentFullDetails(studentId, newValues, userEmail) {
    console.log(`Updating full details for student ID: ${studentId}`);
    const sheets = await getGoogleSheetsClient();
    const sheetName = config.STUDENT_NAMES_SHEET;

    // 1. Verify ID to find Row (Safety)
    const idRes = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${sheetName}!A:A`
    });

    const rows = idRes.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] && row[0].toString().trim() === studentId.toString().trim());

    if (rowIndex === -1) {
        throw new Error('Student ID not found');
    }

    const actualRow = rowIndex + 1;

    // 2. SAFETY CHECK: Ensure Column A (ID) matches!
    // We should overwrite the whole row, BUT we must ensure newValues[0] is the ID.
    if (newValues[0] !== studentId) {
        console.warn(`[Update Warning] Attempt to change ID from ${studentId} to ${newValues[0]}. Resetting to original ID.`);
        newValues[0] = studentId; // Force ID preservation
    }

    // 3. Update the Row
    await sheets.spreadsheets.values.update({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${sheetName}!A${actualRow}`, // Start at A{row}
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [newValues]
        }
    });

    // Clear caches
    clearCache();

    console.log('Student details updated successfully.');
    return { success: true };
}

/**
 * Uploads a headshot image to Google Drive
 * @param {Object} fileObject - Multer file object
 * @returns {Promise<string>} - Public web link to the file
 */
async function uploadHeadshotToDrive(fileObject) {
    console.log(`Uploading headshot: ${fileObject.originalname}`);
    const drive = await getGoogleDriveClient();

    // Create file metadata
    const folderId = '1NXrRhPxBkZVoCcYy2uYMy7Mrzz8BTa5R'; // Hardcoded Headshots Folder ID
    const fileMetadata = {
        name: `HEADSHOT_${Date.now()}_${fileObject.originalname}`,
        parents: [folderId]
    };

    // Create media object
    const media = {
        mimeType: fileObject.mimetype,
        body: fs.createReadStream(fileObject.path)
    };

    try {
        // Log who we are acting as (helpful for permission debugging)
        const email = drive.context._options.auth.email || 'Unknown Service Account';
        console.log(`[Drive Upload] Acting as: ${email}`);

        // 1. Upload the file
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink',
            supportsAllDrives: true // Required for Shared Drives
        });

        console.log(`File uploaded. ID: ${file.data.id}`);

        // 2. Set permissions to "Anyone with the link"
        await drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            },
            supportsAllDrives: true // Required for Shared Drives
        });

        console.log('File permissions set to public.');

        // Clean up local temp file
        try { fs.unlinkSync(fileObject.path); } catch (e) { console.warn('Failed to delete temp file:', e); }

        return file.data.webViewLink;

    } catch (error) {
        console.error('Error uploading to Drive:', error);

        // Enhance error message for common issues
        // Enhance error message for common issues
        if (error.message && error.message.includes('File not found')) {
            const email = drive.context._options.auth.email || 'the Service Account';
            throw new Error(`Folder access denied. Please share folder "${folderId}" (Child Names_Images) with ${email}`);
        }

        throw error;
    }
}

// ============================================================================
// HELPER: Find existing Project Log Row
// ============================================================================
async function findProjectLogRow(studentId, projectCode) {
    const sheets = await getGoogleSheetsClient();
    const sheetName = 'Project Log'; // Hardcoded as per user request context

    // Ideally we fetch relevant columns to minimize data transfer
    // Col C = Student Name/ID (Index 2)
    // Col I = Project Code (Index 8)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `${sheetName}!A:I` // Fetch up to Column I
    });

    const rows = response.data.values || [];

    // Reverse search to find the LATEST entry (if multiple exist)
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        // Col C is index 2. Col I is index 8.
        // Check fuzzy match on student ID/Name
        const rowStudent = (row[2] || '').toLowerCase().trim();
        const searchStudent = studentId.toLowerCase().trim();

        // Handling "Name" vs "Email/Name" mismatch if necessary
        // The user said "unique child ID of the current child in Column C"
        // In previous steps, we saw studentId might be "email/name" or just "name".
        // The sheet seems to store just Name in Col C based on `markProjectComplete` logic.
        // Let's match carefully.
        let isStudentMatch = rowStudent === searchStudent;
        if (!isStudentMatch && searchStudent.includes('/')) {
            const justName = searchStudent.split('/')[1].toLowerCase().trim();
            isStudentMatch = rowStudent === justName;
        }

        const rowProject = (row[8] || '').toUpperCase().trim();
        const searchProject = projectCode.toUpperCase().trim();

        if (isStudentMatch && rowProject === searchProject) {
            return i + 1; // Return 1-based Row Index
        }
    }
    return null;
}

// ============================================================================
// HELPER: Drive Operations
// ============================================================================
async function renameDriveFile(fileId, newName) {
    try {
        const drive = await getGoogleDriveClient();
        await drive.files.update({
            fileId: fileId,
            resource: { name: newName }
        });
        console.log(`[Drive] Renamed file ${fileId} to "${newName}"`);
    } catch (e) {
        console.error(`[Drive] Failed to rename file ${fileId}:`, e.message);
    }
}

async function setDriveFilePublic(fileId) {
    try {
        const drive = await getGoogleDriveClient();
        await drive.permissions.create({
            fileId: fileId,
            resource: {
                role: 'reader',
                type: 'anyone'
            }
        });
        console.log(`[Drive] Set file ${fileId} to public`);
    } catch (e) {
        console.error(`[Drive] Failed to set permissions for ${fileId}:`, e.message);
    }
}


// ============================================================================
// FUNCTION: Mark Project as Complete (or any status)
// ============================================================================
async function markProjectComplete(studentId, projectCode, videoLink, rating, instructorName, status = 'Completed', date = new Date()) {
    try {
        const client = await getGoogleSheetsClient();
        console.log(`[Project Complete] Processing for ${studentId} - ${projectCode}`);

        // Ensure date is a valid Date object
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        if (isNaN(date.getTime())) {
            date = new Date(); // Fallback to current time if invalid
        }

        const dateStr = date.toLocaleDateString('en-US'); // MM/DD/YYYY

        // Student Name parsing
        let studentName = studentId;
        if (studentId.includes('/')) {
            studentName = studentId.split('/')[1];
        }

        // 1. Check for Existing Row
        const existingRowIndex = await findProjectLogRow(studentId, projectCode);
        const sheetName = 'Project Log';

        if (existingRowIndex) {
            console.log(`[Project Complete] Found existing entry at Row ${existingRowIndex}. Updating...`);

            // Columns to Update:
            // Col J (Status) -> Index 9
            // Col Q (Video) -> Index 16
            // Col R (Rating) -> Index 17
            // Col V (Instructor) -> Index 21 (Assuming V is instructor from previous delete logic, but append used F? checking append...)
            // Append used: F for Instructor.
            // Let's stick to the Append structure for consistency:
            // A=Timestamp, B=Date, C=Name, D=Code, E=Status, F=Instructor

            // Wait, Append logic was: 
            // A=Time, B=Date, C=Name, D=Code, E=Status, F=Instr ... Q=Video, R=Rating.
            // Col J is EMPTY in append logic?
            // User request: "change Column J to 'Completed'"
            // Let's check the Append function again carefully. 
            // In `assignProject`, Status is Col J (Index 9).
            // In `markProjectComplete` (old), Status was passed as 5th element (Index 4, Col E).
            // THIS IS A DISCREPANCY in the previous code. 
            // User Request explicitly says: "change Column J to 'Completed'".
            // So I will target Column J.

            // UPDATING EXISTING ROW:
            const updates = [
                { range: `${sheetName}!J${existingRowIndex}`, values: [[status]] },
                { range: `${sheetName}!Q${existingRowIndex}`, values: [[videoLink || '']] },
                { range: `${sheetName}!R${existingRowIndex}`, values: [[rating || '']] },
                { range: `${sheetName}!F${existingRowIndex}`, values: [[instructorName || 'System']] },
                { range: `${sheetName}!B${existingRowIndex}`, values: [[dateStr]] } // Update completion date
            ];

            await client.spreadsheets.values.batchUpdate({
                spreadsheetId: config.SPREADSHEET_ID,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data: updates
                }
            });

        } else {
            console.log(`[Project Complete] No existing entry found. Appending new row...`);
            // Standard Append (Fallback)
            // We align with the User's explicit Column J request for status now?
            // Or stick to the old structure? 
            // If I append, I must match the sheet headers. 
            // Let's try to construct a row that matches the `assignProject` structure (which uses J for Status).
            // A=UniqueId(Calc?), B=Date, C=SID, D=Email?, E=Name... 
            // This is getting risky if headers are unknown.
            // Safest bet: Use the Array structure from `assignProject` but populate it for Completion.

            const uniqueId = Math.random().toString(36).substring(2, 10).toUpperCase();
            const rowValues = new Array(23).fill(''); // Up to W

            rowValues[0] = uniqueId;
            rowValues[1] = dateStr;
            rowValues[2] = studentId; // ID in C? `assignProject` puts ID in C.
            // Wait, `assignProject` put ID in C (2).
            // Old `markProjectComplete` put Name in C (2). 
            // I will use StudentName in C as per previous consistent logic, assuming ID might be there.
            rowValues[2] = studentName;

            // Project Code -> Col I (Index 8) per User Request ("Current Project ID... in Column I")
            rowValues[8] = projectCode;

            // Status -> Col J (Index 9)
            rowValues[9] = status;

            // Video -> Col Q (Index 16)
            rowValues[16] = videoLink || '';

            // Rating -> Col R (Index 17)
            rowValues[17] = rating || '';

            // Instructor -> Col F? No, `assignProject` put it in V (21). 
            // Let's put it in V to be consistent with Assignment.
            rowValues[21] = instructorName;

            await client.spreadsheets.values.append({
                spreadsheetId: config.SPREADSHEET_ID,
                range: `${sheetName}!A:A`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowValues] }
            });
        }

        // 3. Handle Drive Files (Rename & Public)
        if (videoLink && videoLink.includes('drive.google.com') && videoLink.includes('/file/d/')) {
            try {
                // Extract ID: .../file/d/FILE_ID/view...
                const match = videoLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    const fileId = match[1];
                    const newFileName = `${projectCode} ${studentName}`;
                    console.log(`[Drive] Processing file ${fileId}...`);

                    // Run concurrently
                    await Promise.all([
                        renameDriveFile(fileId, newFileName),
                        setDriveFilePublic(fileId)
                    ]);
                }
            } catch (driveErr) {
                console.warn('[Drive Warning] Failed to process Drive file:', driveErr.message);
                // Don't fail the whole request, just log
            }
        }

        // Invalidate Cache
        progressCache = null;
        lastProgressFetch = 0;
        return { success: true };

    } catch (error) {
        console.error('Error saving class report:', error.message);
        throw error;
    }
}

// ============================================================================
// FUNCTION: Save Class Report
// ============================================================================

/**
 * Appends a new class report to the ClassReport sheet
 * 
 * @param {Object} reportData - The report data object
 * @returns {Promise<Object>} - Success status and new ID
 */
async function saveClassReport(reportData) {
    try {
        console.log('Saving Class Report...', reportData);
        const sheets = await getGoogleSheetsClient();

        // Generate ID: 8 char alphanumeric
        const uniqueId = Math.random().toString(36).substring(2, 10).toUpperCase();

        // Get Today's Date in MM/DD/YYYY
        const today = new Date();
        const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

        // Prepare Row Data based on Config Column Mapping
        // We need to verify the max index we need to fill
        const colMap = config.CLASS_REPORT_COLUMNS;
        const maxIndex = Math.max(...Object.values(colMap));

        // Initialize empty row array
        const row = new Array(maxIndex + 1).fill('');

        // Fill data
        // Fill data
        row[colMap.ID] = uniqueId;
        row[colMap.DATE] = dateStr;

        // Convert Y/N to Boolean (TRUE/FALSE)
        // Note: Google Sheets treats boolean primitives as TRUE/FALSE
        row[colMap.EQUIPMENT_ISSUES] = (reportData.equipmentIssues === 'Y');
        row[colMap.LOST_TIME] = (reportData.lostTime === 'Y');
        row[colMap.DIFFICULTY] = (reportData.difficulty === 'Y');
        row[colMap.STARTED_ON_TIME] = (reportData.startedOnTime === 'Y');

        row[colMap.RATING] = reportData.rating || '5';
        row[colMap.PROBLEMS] = reportData.problems || '';
        row[colMap.INSTRUCTOR] = reportData.instructor || '';

        // Append to Sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.CLASS_REPORT_SHEET}!A:K`, // Adjust range as needed
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [row]
            }
        });

        console.log(`✅ Class Report Saved. ID: ${uniqueId}`);
        return { success: true, id: uniqueId };

    } catch (error) {
        console.error('Error saving class report:', error);
        throw error;
    }
}

/**
 * Fetch prizes list from the configured Prizes sheet
 * @returns {Promise<Array>} List of prizes
 */
async function fetchPrizesList() {
    try {
        const client = await getGoogleSheetsClient();
        const response = await client.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.PRIZES_SHEET}!A:E` // Assuming cols A-E contain prize info
        });

        const rows = response.data.values;
        if (!rows || rows.length < 2) return [];

        const headers = rows[0].map(h => h.trim());

        // Map rows to objects based on headers
        return rows.slice(1).map(row => {
            const prize = {};
            headers.forEach((header, index) => {
                prize[header] = row[index] || '';
            });
            return prize;
        });

    } catch (error) {
        console.error('Error fetching prizes:', error);
        return [];
    }
}

module.exports = {
    getStudents: fetchStudents,
    fetchStudents,
    syncHeadshots,
    fetchProjectLog, // Exported for debugging
    getStudentProgress,
    getStudentProjects,
    getStudentProjectsByName,
    fetchProjectList,
    fetchAllProjectsDetailed,
    fetchProjectParts,
    fetchBookingInfo,
    fetchEnrichedBookingInfo,
    syncMasterDatabase,
    fetchAllKids,
    fetchInstructors,
    markStudentAttendance,
    getLocalMasterDB,
    clearCache,
    fetchInventory,
    updateInventory,
    getLeaderboard,
    assignProject,
    deleteProjectEntry,
    fetchStudentFullDetails,
    updateStudentFullDetails,
    markProjectComplete,
    fetchStudentNamesForLogin,
    getGoogleSheetsClient,
    saveClassReport,
    addBooking,
    markAttendanceByStudentId: markAttendanceByStudentIdDEBUG, // [NEW] Attendance by ID (Debug Version)
    uploadHeadshotToDrive,
    fetchPrizesList
};

// ============================================================================
// FUNCTION: Add Booking to Google Sheets
// ============================================================================

/**
 * Adds a new booking row to the "All Booking Info" sheet
 *
 * @param {Object} bookingData - The data to add
 * @returns {Promise<Object>} - Result of the operation
 */
async function addBooking(bookingData) {
    try {
        console.log('Adding booking to Google Sheets...', bookingData);

        // Get authenticated Sheets API client
        const sheets = await getGoogleSheetsClient();

        // Prepare row data based on config
        // Find the max index needed
        const maxIndex = Math.max(
            config.BOOKING_COLUMNS.EMAIL || 0,
            config.BOOKING_COLUMNS.STUDENT_NAME || 0,
            config.BOOKING_COLUMNS.AGE || 0,
            config.BOOKING_COLUMNS.SERVICE_TITLE || 0,
            config.BOOKING_COLUMNS.CLASS_DATE || 0,
            config.BOOKING_COLUMNS.CHECKED_IN || 0,
            config.BOOKING_COLUMNS.STUDENT_ID || 14
        );

        const row = new Array(maxIndex + 1).fill('');

        // Fill in data
        // Using strict checks for defined indices
        if (typeof config.BOOKING_COLUMNS.EMAIL !== 'undefined') row[config.BOOKING_COLUMNS.EMAIL] = bookingData.email || '';
        if (typeof config.BOOKING_COLUMNS.STUDENT_NAME !== 'undefined') row[config.BOOKING_COLUMNS.STUDENT_NAME] = bookingData.studentName || '';
        if (typeof config.BOOKING_COLUMNS.AGE !== 'undefined') row[config.BOOKING_COLUMNS.AGE] = bookingData.age || '';
        if (typeof config.BOOKING_COLUMNS.SERVICE_TITLE !== 'undefined') row[config.BOOKING_COLUMNS.SERVICE_TITLE] = bookingData.serviceTitle || '';
        if (typeof config.BOOKING_COLUMNS.CLASS_DATE !== 'undefined') row[config.BOOKING_COLUMNS.CLASS_DATE] = bookingData.date || '';
        if (typeof config.BOOKING_COLUMNS.STUDENT_ID !== 'undefined') row[config.BOOKING_COLUMNS.STUDENT_ID] = bookingData.studentId || '';

        // Append to sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.BOOKING_SHEET}!A:Z`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [row]
            }
        });

        console.log('✅ Booking added successfully.');
        return { success: true };

    } catch (error) {
        console.error('Error adding booking:', error.message);
        throw error;
    }
}

// ============================================================================
// FUNCTION: Mark Attendance by Student ID (For Login)
// ============================================================================

/**
 * Marks a student as present (TRUE in Col N) if their ID (Col O) matches
 * and the Class Date (Col M) matches today's date.
 *
 * @param {string} studentId - The unique student ID (Email/Name)
 * @returns {Promise<boolean>} - True if a record was updated
 */
async function markAttendanceByStudentId(studentId) {
    if (!studentId) return false;

    try {
        const client = await getGoogleSheetsClient();
        const sheetName = config.BOOKING_SHEET;

        // 1. Get today's date in "Jan 13, 2026" format
        const today = new Date();
        const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' }; // e.g., "Jan 13, 2026"
        const todayStr = today.toLocaleDateString('en-US', dateOptions);

        console.log(`[ATTENDANCE] Checking for Student ID: "${studentId}" on Date: "${todayStr}"`);

        // 2. Fetch Columns M, N, O (Date, Status, ID)
        // M is Index 12 (Col 13), O is Index 14 (Col 15)
        // Range M:O
        const response = await client.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${sheetName}!M:O`,
        });

        const rows = response.data.values || [];

        // 3. Find matching row
        // Row check: Col M (0 in range) == Today, Col O (2 in range) == StudentID
        let matchRowIndex = -1;

        // Start from Index 1 to skip header? Usually Booking sheet has headers.
        // Google Sheets API returns range values. row[0] is M, row[1] is N, row[2] is O.

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const dateVal = row[0] ? row[0].trim() : '';
            const idVal = row[2] ? row[2].trim() : '';

            // Simple string comparison for date (Sheet format must match)
            // If sheet has "1/13/2026", this might fail. User specified "Jan 13, 2026" format.
            // Let's assume user is correct about sheet format.
            // Also lenient check for ID (case insensitive?)

            if (dateVal === todayStr && idVal.toLowerCase() === studentId.toLowerCase()) {
                matchRowIndex = i; // This is the index in the 'rows' array
                break;
            }
        }

        if (matchRowIndex !== -1) {
            // Calculate actual spreadsheet row number (1-based)
            // If we fetched M:O, the first row of 'rows' is the first row of M:O.
            // If M:O includes header, i=0 is header.
            // row[0] corresponds to M1 (or M2 if we skipped header? No, range M:O means M1:O_END).
            // So if matchRowIndex is 0, that's Row 1.
            const sheetRowNumber = matchRowIndex + 1;

            console.log(`[ATTENDANCE] Found match at Row ${sheetRowNumber}. Updating status...`);

            // 4. Update Status (Col N) to TRUE
            // Col N is the middle column of our M:O range, but we should target cell N{Row} directly.

            await client.spreadsheets.values.update({
                spreadsheetId: config.SPREADSHEET_ID,
                range: `${sheetName}!N${sheetRowNumber}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['TRUE']] }
            });

            console.log(`[ATTENDANCE] marked TRUE for ${studentId}`);
            return true;
        } else {
            console.log(`[ATTENDANCE] No matching booking found for ${studentId} today.`);
            return false;
        }

    } catch (error) {
        console.error('[ATTENDANCE ERROR]', error);
        return false;
    }
}
// ============================================================================
// FUNCTION: Mark Attendance by Student ID (DEBUG Version)
// ============================================================================

/**
 * Marks a student as present (TRUE in Col N) if their ID (Col O) matches
 * and the Class Date (Col M) matches today's date.
 * DEBUG VERSION WITH DETAILED LOGGING
 *
 * @param {string} studentId - The unique student ID (Email/Name)
 * @returns {Promise<boolean>} - True if a record was updated
 */
async function markAttendanceByStudentIdDEBUG(studentId) {
    if (!studentId) return false;

    console.log(`[ATTENDANCE] START: Validating attendance for "${studentId}"`);

    try {
        const client = await getGoogleSheetsClient();
        const sheetName = config.BOOKING_SHEET;

        // 1. Generate multiple date formats to match
        const today = new Date();
        const formats = [
            today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), // "Jan 13, 2026"
            today.toLocaleDateString('en-US'), // "1/13/2026" (default)
            `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`, // "1/13/2026" manual
            today.toISOString().split('T')[0] // "2026-01-13" (ISO)
        ];

        // Add zero-padded format "01/13/2026"
        const paddedMonth = String(today.getMonth() + 1).padStart(2, '0');
        const paddedDay = String(today.getDate()).padStart(2, '0');
        formats.push(`${paddedMonth}/${paddedDay}/${today.getFullYear()}`);

        console.log(`[ATTENDANCE] Checking Date Formats: ${JSON.stringify(formats)}`);

        // 2. Fetch Range
        // M (Date) is at Index 0 relative to range M:O
        // N (Status) is at Index 1
        // O (ID) is at Index 2
        console.log(`[ATTENDANCE] Fetching range ${sheetName}!M:O...`);
        const response = await client.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${sheetName}!M:O`,
            valueRenderOption: 'FORMATTED_VALUE' // Get exactly what is displayed
        });

        const rows = response.data.values || [];
        console.log(`[ATTENDANCE] Sheet fetched. Total rows: ${rows.length}`);

        // Log first few rows for debug
        if (rows.length > 0) {
            console.log(`[ATTENDANCE] Sample Row 1: ${JSON.stringify(rows[0])}`);
        }

        // 3. Find matching row
        let matchRowIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const dateVal = row[0] ? row[0].trim() : '';
            const idVal = row[2] ? row[2].trim() : ''; // Col O is index 2

            // Debug specific student check
            if (idVal.toLowerCase().includes(studentId.toLowerCase().split('/')[0])) {
                // Partial log for debugging
                console.log(`[ATTENDANCE DEBUG] Row ${i + 1}: Date="${dateVal}", ID="${idVal}" (Potential Match)`);
            }

            // Check if date matches ANY of our formats
            const dateMatches = formats.includes(dateVal);

            // Check ID (strict match first, then lenient)
            const idMatches = idVal.toLowerCase().trim() === studentId.toLowerCase().trim();

            if (dateMatches && idMatches) {
                matchRowIndex = i;
                console.log(`[ATTENDANCE] MATCH FOUND at Row ${i + 1}!`);
                break;
            }
        }

        if (matchRowIndex !== -1) {
            // Calculate 1-based row number
            const sheetRowNumber = matchRowIndex + 1;

            // 4. Update Status (Col N) to TRUE
            await client.spreadsheets.values.update({
                spreadsheetId: config.SPREADSHEET_ID,
                range: `${sheetName}!N${sheetRowNumber}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['TRUE']] }
            });

            console.log(`[ATTENDANCE] ✅ Successfully marked TRUE for ${studentId} at Row ${sheetRowNumber}`);
            return true;
        } else {
            console.warn(`[ATTENDANCE] ⚠️ No matching booking found for "${studentId}" today.`);
            return false;
        }

    } catch (error) {
        console.error('[ATTENDANCE ERROR] ❌ Failed to mark attendance:', error.message);
        if (error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')) {
            console.error('[ATTENDANCE ERROR] Network Error - System might be offline.');
        }
        return false;
    }
}
