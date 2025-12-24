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
                'https://www.googleapis.com/auth/spreadsheets.readonly',
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
        // Range "A:B" means columns A and B (ID and Name)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A:B`,
        });

        // Extract rows from response
        const rows = response.data.values || [];

        // Process rows into student objects
        // Skip first row (header) and filter out empty rows
        const students = rows.slice(1)
            .filter(row => row[0] && row[1])  // Must have both ID and name
            .map(row => ({
                id: row[0],    // Column A: Student ID
                name: row[1]   // Column B: Student Name
            }));

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
                points: row[config.PROGRESS_COLUMNS.POINTS] || ''
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
        const students = rows.slice(1)
            .filter(row => row[0] && row[0].trim())
            .map(row => ({
                name: row[0].trim(),
                headshot: row[5] ? row[5].trim() : '' // Column I is index 5 relative to D
            }));

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

// ============================================================================
// FUNCTION: Get Student Progress Summary
// ============================================================================

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
async function getStudentProjectsByName(studentName) {
    try {
        // Fetch all project log entries
        const projects = await fetchProjectLog();

        // Filter to only this student's projects (case-insensitive match)
        const normalizedSearchName = studentName.toLowerCase().trim();
        const studentProjects = projects.filter(project =>
            project.studentName &&
            project.studentName.toLowerCase().trim() === normalizedSearchName
        );

        // Categorize projects by status
        const completedProjects = [];
        const inProgressProjects = [];
        const assignedProjects = [];

        studentProjects.forEach(project => {
            const statusLower = project.projectStatus ? project.projectStatus.toLowerCase() : '';

            // Determine category based on status keywords
            if (statusLower.includes('completed')) {
                // Completed project - include completion details
                completedProjects.push({
                    name: project.projectName,
                    status: project.projectStatus,
                    completedDate: project.completedDate,
                    type: project.projectType,
                    rating: project.rating,
                    points: project.points
                });
            } else if (statusLower.includes('progress') || statusLower.includes('working')) {
                // In-progress project
                inProgressProjects.push({
                    name: project.projectName,
                    status: project.projectStatus,
                    type: project.projectType,
                    assignType: project.assignType
                });
            } else if (statusLower.includes('assigned') || statusLower.includes('assign')) {
                // Newly assigned project
                assignedProjects.push({
                    name: project.projectName,
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
            studentName: studentName,
            assignedProjects: assignedProjects,
            completedProjects: completedProjects,
            inProgressProjects: inProgressProjects,
            totalAssigned: assignedProjects.length,
            totalCompleted: completedProjects.length,
            totalInProgress: inProgressProjects.length,
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
        // We fetch columns A to M (Date is in M)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.BOOKING_SHEET}!A:M`,
        });

        const rows = response.data.values || [];

        // Helper to format today's date to match sheet format: "Jan 1, 2024"
        // Note: This relies on server locale being US English
        const today = new Date();
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        // Clean format: "Dec 6, 2025"
        const todayStr = today.toLocaleDateString('en-US', options);

        console.log(`Filtering for date: ${todayStr}`);

        // Filter for today
        const bookings = rows.slice(1) // Skip header
            .filter(row => {
                const dateStr = row[config.BOOKING_COLUMNS.CLASS_DATE];
                // Simple string match first (fastest)
                if (dateStr === todayStr) return true;

                // Fallback: Parse date just in case format varies slightly
                const rowDate = new Date(dateStr);
                return rowDate.toDateString() === today.toDateString();
            })
            .map(row => ({
                studentName: row[config.BOOKING_COLUMNS.STUDENT_NAME],
                serviceTitle: row[config.BOOKING_COLUMNS.SERVICE_TITLE],
                classDate: row[config.BOOKING_COLUMNS.CLASS_DATE]
            }))
            .filter(b => b.studentName && b.serviceTitle); // Ensure valid data

        // Update cache
        bookingCache = bookings;
        lastBookingFetch = now;


        console.log(`Found ${bookings.length} bookings for today`);
        return bookings;
    } catch (error) {
        console.error('Error fetching bookings:', error.message);
        if (bookingCache) return bookingCache;
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

        // 2. Get Student Headshots (efficiently, maybe cached)
        const students = await fetchStudentNamesForLogin(); // Returns [{name, headshot}]
        const studentMap = new Map(students.map(s => [s.name.toLowerCase().trim(), s]));

        // 3. Get Project Logs
        const allProjects = await fetchProjectLog();

        // Helper to find latest project for a student
        const getLatestProject = (studentName) => {
            const normalizedName = studentName.toLowerCase().trim();
            const studentProjects = allProjects.filter(p =>
                p.studentName && p.studentName.toLowerCase().trim() === normalizedName
            );

            if (studentProjects.length === 0) return null;

            // Sort by Date (newest first). Note: 'date' string might need parsing if format is inconsistent
            // Assuming ISO or consistent format, otherwise simple string sort might be risky but likely okay for logs
            // Ideally we rely on the order in the sheet (bottom = newest)
            // Let's assume the array order from fetchProjectLog preserves sheet order (which is usually chronological)
            // So we just take the last element? Or sort?
            // Safer to sort if we have dates. The `date` field is from sheet.
            // Let's trust sheet order (bottom is latest) for now as simpler fallback

            // Actually, let's reverse iteration to find the *last* assigned "Active" project?
            // "Current Project" usually means 'In Progress' or the very latest 'Assigned'.

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

            // Fallback to just the very last entry (maybe completed?)
            return studentProjects[studentProjects.length - 1];
        };

        // 4. Merge Data
        const enrichedBookings = bookings.map(booking => {
            const name = booking.studentName;
            const studentInfo = studentMap.get(name.toLowerCase().trim());
            const project = getLatestProject(name);

            return {
                ...booking,
                headshot: studentInfo ? studentInfo.headshot : '',
                currentProject: project ? project.projectName : 'No active project'
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
            name: row[config.ALL_KIDS_COLUMNS.NAME] || '',
            parentName: row[config.ALL_KIDS_COLUMNS.PARENT_NAME] || '',
            email: row[config.ALL_KIDS_COLUMNS.EMAIL] || '',
            headshot: row[config.ALL_KIDS_COLUMNS.HEADSHOT] || ''
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
// EXPORT FUNCTIONS
// ============================================================================
// Make these functions available to other files that import this module

module.exports = {
    fetchStudents,                  // Get student list
    fetchProjectLog,                // Get all project log entries
    fetchInstructors                // Get instructor list with credentials
};

// ============================================================================
// HELPER: Get Google Drive Client
// ============================================================================
async function getGoogleDriveClient() {
    try {
        let credentials;

        // Check for environment variable first (for cloud deployment)
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            // Fall back to file for local/offline mode
            const credentialsPath = path.join(__dirname, config.CREDENTIALS_PATH);
            if (!fs.existsSync(credentialsPath)) {
                throw new Error('Google credentials not found. Set GOOGLE_CREDENTIALS env var or provide ' + config.CREDENTIALS_PATH);
            }
            credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ],
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
 * Downloads student headshots from Google Drive to local public/headshots folder
 */
async function syncHeadshots() {
    console.log('Starting headshot sync...');
    const drive = await getGoogleDriveClient();

    // 1. Get list of students and their expected headshot filenames
    const students = await fetchStudentNamesForLogin(true);

    // 2. Find the "Child Names_Images" subfolder
    // The sheet paths look like "Child Names_Images/filename.jpg"
    // So we need to find this folder first
    let targetFolderId = config.DRIVE_HEADSHOTS_FOLDER_ID; // Default to root

    console.log(`Searching for "Child Names_Images" folder inside ${targetFolderId}...`);

    try {
        const folderRes = await drive.files.list({
            q: `'${targetFolderId}' in parents and name = 'Child Names_Images' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
        });

        if (folderRes.data.files && folderRes.data.files.length > 0) {
            targetFolderId = folderRes.data.files[0].id;
            console.log(`Found "Child Names_Images" folder: ${targetFolderId}`);
        } else {
            console.warn('Could not find "Child Names_Images" subfolder. Searching in root instead.');
        }
    } catch (err) {
        console.error('Error finding subfolder:', err.message);
    }

    // 3. List files in the target folder
    // We increase page size to ensure we get as many as possible
    console.log(`Listing files in folder ${targetFolderId}...`);
    let driveFiles = [];
    try {
        let nextPageToken = null;
        do {
            const res = await drive.files.list({
                q: `'${targetFolderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType)',
                pageSize: 1000,
                pageToken: nextPageToken
            });

            if (res.data.files) {
                driveFiles.push(...res.data.files);
            }
            nextPageToken = res.data.nextPageToken;
        } while (nextPageToken);

        console.log(`Found ${driveFiles.length} files in Drive folder`);
    } catch (err) {
        console.error('Error listing files:', err.message);
        return { downloaded: 0, errors: 1 };
    }

    // 4. Ensure local headshots directory exists
    const headshotsDir = path.join(__dirname, 'public', 'headshots');
    if (!fs.existsSync(headshotsDir)) {
        fs.mkdirSync(headshotsDir, { recursive: true });
    }

    // 5. Match and download
    let downloadCount = 0;
    let errorCount = 0;

    // Create a map for faster lookup
    const driveFileMap = new Map();
    driveFiles.forEach(f => driveFileMap.set(f.name, f));

    // Prepare list of downloads
    const downloadQueue = [];

    for (const student of students) {
        if (!student.headshot) continue;

        // The sheet has "Child Names_Images/filename.jpg"
        // We need just "filename.jpg" to match with Drive
        const expectedFilename = student.headshot.split('/').pop();

        // Find by name
        const driveFile = driveFileMap.get(expectedFilename);

        if (driveFile) {
            // We use the FULL path from the sheet as the local filename structure?
            // Wait, front-end expects "headshots/filename.jpg" (flattened) 
            // OR "headshots/Child Names_Images/filename.jpg" (nested)?
            // The frontend code I wrote handles "Child Names_Images/" prefix by replacing it with "headshots/".
            // Implementation detail: Let's preserve the filename but put it directly in headshots/ 
            // The frontend logic was: headshotUrl.replace('Child Names_Images/', 'headshots/')
            // This implies the URL is "headshots/filename.jpg".
            // So we should save it as "public/headshots/filename.jpg".

            // BUT wait, multiple students might have same filename? Unlikely for headshots.
            // Let's stick to flat structure in public/headshots/

            const destPath = path.join(headshotsDir, expectedFilename);

            // Optimization: Skip if file exists and size > 0?
            // For now, let's just checking if it exists to save bandwidth/time, 
            // assuming headshots don't change often.
            if (!fs.existsSync(destPath)) {
                downloadQueue.push({ fileId: driveFile.id, destPath, name: expectedFilename });
            }
        }
    }

    console.log(`identified ${downloadQueue.length} new headshots to download.`);

    // Process queue with some concurrency limit (e.g., 5 at a time)
    // to avoid hitting rate limits or opening too many streams
    const CONCURRENCY = 5;
    for (let i = 0; i < downloadQueue.length; i += CONCURRENCY) {
        const batch = downloadQueue.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (item) => {
            try {
                // console.log(`Downloading ${item.name}...`);
                const dest = fs.createWriteStream(item.destPath);

                const response = await drive.files.get(
                    { fileId: item.fileId, alt: 'media' },
                    { responseType: 'stream' }
                );

                await new Promise((resolve, reject) => {
                    response.data
                        .on('end', () => resolve())
                        .on('error', err => reject(err))
                        .pipe(dest);
                });

                downloadCount++;
            } catch (err) {
                console.error(`Failed to download ${item.name}:`, err.message);
                errorCount++;
                // Try to delete partial file
                if (fs.existsSync(item.destPath)) fs.unlinkSync(item.destPath);
            }
        }));
    }

    console.log(`Headshot sync complete: ${downloadCount} new downloaded, ${errorCount} errors.`);
    return { downloaded: downloadCount, errors: errorCount };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    fetchStudents,                  // Get student list
    fetchProjectLog,                // Get all project log entries
    fetchStudentNamesForLogin,      // Get student names for login dropdown
    getStudentProgress,             // Get progress summary for all students
    getStudentProjectsByName,       // Get projects for one specific student
    fetchBookingInfo,               // Get today's classes
    fetchEnrichedBookingInfo,       // Get enriched data for dashboard (NEW)
    fetchAllKids,                   // Get all kids detailed data
    syncMasterDatabase,             // Download full sheet to local JSON
    getLocalMasterDB,               // Get local offline data
    clearCache,                     // Clear all cached data
    fetchInstructors                // Get instructor list with credentials
};

/*
 * ============================================================================
 * END OF GOOGLE-SHEETS-SERVICE.JS
 * ============================================================================
 *
 * This service provides a clean interface for accessing Google Sheets data:
 *
 * CACHING STRATEGY:
 * - Data is cached in memory for CACHE_DURATION (5 minutes by default)
 * - Reduces API calls to Google (which have rate limits)
 * - If API call fails, returns stale cache instead of error (graceful degradation)
 * - Can force refresh by passing forceRefresh=true
 *
 * ERROR HANDLING:
 * - If fresh fetch fails, tries to return cached data (even if old)
 * - Logs errors but doesn't crash the app
 * - Allows offline operation when combined with local JSON caching
 *
 * USAGE EXAMPLE:
 * const googleSheetsService = require('./google-sheets-service');
 *
 * // Get student names for login
 * const students = await googleSheetsService.fetchStudentNamesForLogin();
 *
 * // Get progress for one student
 * const progress = await googleSheetsService.getStudentProjectsByName('Alice');
 *
 * // Force refresh
 * const freshData = await googleSheetsService.fetchProjectLog(true);
 *
 * ============================================================================
 */
