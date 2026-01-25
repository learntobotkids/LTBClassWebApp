/*
 * ============================================================================
 * GOOGLE SHEETS CONFIGURATION FILE
 * ============================================================================
 *
 * PURPOSE:
 * This file contains all the configuration settings for connecting to and
 * reading data from Google Sheets. Think of it as a "settings file" that
 * tells the app where to find student data in Google Sheets.
 *
 * WHAT THIS FILE DOES:
 * 1. Specifies which Google Sheets spreadsheet to use (by ID)
 * 2. Defines which sheets/tabs to read from
 * 3. Maps spreadsheet columns to data fields
 * 4. Sets caching duration
 *
 * HOW TO UPDATE THIS:
 * - Change SPREADSHEET_ID if you want to use a different Google Sheet
 * - Update column mappings if your spreadsheet structure changes
 * - Adjust CACHE_DURATION to control how often data refreshes
 *
 * IMPORTANT:
 * This file is separate from google-sheets-service.js so you can easily
 * change settings without touching the code that uses them.
 *
 * ============================================================================
 */

module.exports = {
    // ========================================================================
    // SPREADSHEET IDENTIFICATION
    // ========================================================================

    /**
     * Main spreadsheet ID (found in the Google Sheets URL)
     *
     * How to find this:
     * 1. Open your Google Sheet
     * 2. Look at the URL in your browser
     * 3. The ID is the long string between /d/ and /edit
     *
     * Example URL:
     * https://docs.google.com/spreadsheets/d/1mkfyTOrcflampKY_BG13yjst7-AfEK4Oxvl-VU9BFME/edit
     *                                     ↑                                                    ↑
     *                                     └──────────── This is the SPREADSHEET_ID ──────────┘
     *
     * Can be set via environment variable SPREADSHEET_ID
     */
    //SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1W6ojeogcA__vqYcQvwpav07rP9g5rAMpYXvHHY3sRKM',
    // SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1mkfyTOrcflampKY_BG13yjst7-AfEK4Oxvl-VU9BFME', // Potentially reading old env?
    SPREADSHEET_ID: '1mkfyTOrcflampKY_BG13yjst7-AfEK4Oxvl-VU9BFME', // HARDCODED FORCE NEW SHEET
    // ========================================================================
    // GOOGLE DRIVE CONFIGURATION
    // ========================================================================

    /**
     * Folder ID for student headshots in Google Drive
     * URL: https://drive.google.com/drive/folders/1NXrRhPxBkZVoCcYy2uYMy7Mrzz8BTa5R (Child Names_Images)
     */
    DRIVE_HEADSHOTS_FOLDER_ID: '1NXrRhPxBkZVoCcYy2uYMy7Mrzz8BTa5R',

    /**
     * Folder ID for Video Upload Tests
     * URL: https://drive.google.com/drive/u/0/folders/0AKsnksCLda4GUk9PVA
     */
    VIDEO_UPLOAD_FOLDER_ID: '0AKsnksCLda4GUk9PVA',

    // ========================================================================
    // SHEET/TAB NAMES
    // ========================================================================

    // ========================================================================
    // SHEET/TAB NAMES
    // ========================================================================

    /**
     * Name of the sheet (tab) containing student names
     * Default: 'Child Names'
     */
    STUDENT_NAMES_SHEET: 'Child Names',

    /**
     * Name of the sheet (tab) containing class reports
     */
    CLASS_REPORT_SHEET: 'ClassReport',

    /**
     * Name of the sheet (tab) containing the full project catalog
     * Default: 'Projects List'
     */
    PROJECT_LIST_SHEET: 'Projects List',

    /**
     * Name of the sheet (tab) containing student booking/attendance info
     * Default: 'Bookings'
     */
    BOOKING_SHEET: 'All Booking Info',

    /**
     * Name of the sheet (tab) containing instructor data
     * Default: 'instructors'
     */
    INSTRUCTORS_SHEET: 'instructors',

    /**
     * Name of the sheet (tab) containing project assignments and progress
     * Default: 'Project Log'
     */
    PROGRESS_SHEET: 'Project Log',

    /**
     * Name of the sheet (tab) containing inventory items
     * Default: 'Inventory'
     */
    INVENTORY_SHEET: 'inventory2',
    PRIZES_SHEET: 'prizes',


    /**
     * Name of the sheet (tab) containing project parts/videos
     * Default: 'LTBCLASSWEBAPP'
     */
    PROJECT_PARTS_SHEET: 'LTBCLASSWEBAPP',

    // ... (rest of sheet names) ...
    PROJECT_PARTS_COLUMNS: {
        PROJECT_CODE: 0,    // Column A: Project Code (e.g., PROJ101) - REQUIRED
        PROJECT_TITLE: 1,   // Column B: Project Title (optional, for display)
        PART_NUMBER: 2,     // Column C: Part Number (e.g., 1, 2, 3)
        PART_TITLE: 3,      // Column D: Part Title (e.g., "Introduction")
        YOUTUBE_URL: 4,     // Column E: YouTube URL - REQUIRED
        DURATION: 5,        // Column F: Duration (e.g., "5:30")
        COVER_IMAGE: 6      // Column G: Cover Image URL
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR CLASS REPORT SHEET
    // ========================================================================
    CLASS_REPORT_COLUMNS: {
        ID: 0,              // Column A: Unique 8-char ID
        DATE: 1,            // Column B: Date (MM/DD/YYYY)
        STARTED_ON_TIME: 3, // Column D: Class started on time (Y/N)
        LOST_TIME: 4,       // Column E: Lost >5mins due to issues (Y/N)
        EQUIPMENT_ISSUES: 5,// Column F: Equipment shortage/issues (Y/N)
        DIFFICULTY: 7,      // Column H: Any kid had difficulty (Y/N)
        RATING: 8,          // Column I: Overall rating (1-5)
        PROBLEMS: 9,        // Column J: List problems (implied next available?) - User didn't specify, assuming J or keeping previously defined logic if adaptable. 
        // WAIT, User specs: F=Equip, E=LostTime, H=Diff, D=Started, I=Rating.
        // Missing G? Maybe G is cover image? No this is report sheet.
        // What about PROBLEMS? User didn't specify column for problems.
        // Previous was: ID=0, DATE=1, EQUIP=2, LOST=3, DIFF=4, STARTED=5, RATING=6, PROB=7, INSTR=10
        // New: ID=0, DATE=1, STARTED=3, LOST=4, EQUIP=5, DIFF=7, RATING=8.
        // G (Index 6) is skipped? J (Index 9)?
        // I will put Problems in J (9) and Instructor in K (10) as before if not specified otherwise.
        PROBLEMS: 9,        // Column J
        INSTRUCTOR: 10      // Column K
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR STUDENT NAMES SHEET
    // ========================================================================
    // These map column letters to what data they contain

    STUDENT_COLUMNS: {
        KEY: 'A',           // Column A: Unique key/ID for each student
        NAME: 'B',          // Column B: Child's full name
        LOGIN_NAME: 'C',    // Column C: Name shown in login dropdown
        FILE_LINK: 'G',     // Column G: Google Drive folder link
        HEADSHOT: 'I',      // Column I: Headshot image URL
        NOTE: 'X',          // Column X: Note for child
        ALL_PROJECT_ACCESS: 'AI'  // Column AI: All Project Access (Yes/No)
    },

    // ========================================================================
    // ONLINE MODE LOGIN CONFIGURATION (SAFE ADDITION)
    // ========================================================================
    // Independent configuration for the "Parent Email Login" feature
    // Used only when DEPLOYMENT_MODE=cloud (Online Version)
    // Separation ensures we do NOT break offline functionality

    ONLINE_LOGIN_COLUMNS: {
        PARENT_EMAIL: 1,    // Column B: Parent Email (Index 1)
        CHILD_NAME: 2,      // Column C: Child Name (Index 2)
        PARENT_FIRST_NAME: 4 // Column E: Parent First Name (Index 4)
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR PROJECT LOG SHEET
    // ========================================================================
    // These map column numbers (0-indexed) to what data they contain
    // 0 = Column A, 1 = Column B, 2 = Column C, etc.

    PROGRESS_COLUMNS: {
        // Basic information columns
        ID: 0,              // Column A: Unique entry ID
        DATE: 1,            // Column B: Date of entry
        SID: 2,             // Column C: Student ID (matches Child Names sheet)
        STUDENT_EMAIL: 3,   // Column D: Student's email address
        STUDENT_NAME: 4,    // Column E: Student's full name (THIS IS THE MAIN ONE WE USE)
        PARENTS_NAME: 5,    // Column F: Parent/Guardian name
        TRACK: 6,           // Column G: Track number or program

        // Project information columns
        ASSIGN_TYPE: 7,     // Column H: Assignment type (Required, Optional, etc.)
        PROJECT_NAME: 8,    // Column I: Name of the project
        PROJECT_STATUS: 9,  // Column J: Status (Assigned, In Progress, Completed, etc.)
        LAST_EDITED_BY: 21, // Column V: Name of instructor who last edited
        LAST_EDITED_TIME: 22, // Column W: Time of last edit

        // Completion information columns
        COMPLETED_DATE: 25, // Column Z: Date project was completed
        PROJECT_TYPE: 26,   // Column AA: Type of project (Scratch, Python, etc.)
        RATING: 27,         // Column AB: Student's rating of the project (1-5 stars)
        PROJECT_TYPE: 26,   // Column AA: Type of project (Scratch, Python, etc.)
        RATING: 27,         // Column AB: Student's rating of the project (1-5 stars)
        POINTS: 28,         // Column AC: Points earned for completing project
        VIDEO_LINK: 16,     // Column Q: Link to uploaded video evidence

        // Note: We skip columns K-Y as they're not currently used by the app
        // If you add more columns, add them here with their index number
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR BOOKING SHEET
    // ========================================================================
    // Maps columns in 'All Booking Info' sheet

    BOOKING_COLUMNS: {
        EMAIL: 0,           // Column A: Student Email
        STUDENT_NAME: 4,    // Column E: Student's full name
        AGE: 5,             // Column F: Student's Age
        SERVICE_TITLE: 7,   // Column H: Class/Service Title
        CLASS_DATE: 12,     // Column M: Date of class
        CHECKED_IN: 13,     // Column N: Checked In? (TRUE/FALSE)
        STUDENT_ID: 14      // Column O: Student ID (Unique)
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR INSTRUCTORS SHEET
    // ========================================================================
    INSTRUCTOR_COLUMNS: {
        NAME: 0,            // Column A: Instructor Name
        PASSCODE: 8         // Column I: Passcode
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR PROJECT LIST SHEET
    // ========================================================================
    PROJECT_LIST_COLUMNS: {
        CODE: 0,            // Column A: Project Code (e.g., PROJ101)
        NAME: 1,            // Column B: Full Project Name
        DESCRIPTION: 2,     // Column C: What kids Learn in this project
        STUDENT_ACTIVITY: 4,// Column E: What child did in this project
        ICON: 12,           // Column M: Project Icon/Cover Image URL
        POINTS: 55,         // Column BD: Points (0-indexed, BD=55)
        RECOMMENDED_TRACK: 56, // Column BE: Recommended Tracks
        CATEGORY: 57        // Column BF: Type of Project (0-indexed, A=0, BF=57)
    },

    // ========================================================================
    // COLUMN MAPPINGS FOR INVENTORY SHEET
    // ========================================================================
    INVENTORY_COLUMNS: {
        ID: 0,              // Column A: Product Barcode/ID
        PRODUCT: 1,         // Column B: Product Name
        IMAGE: 5,           // Column F: Image URL
        KIT_START: 6,       // Column G: Start of Kit Stock columns
        LAST_LOG_TIME: 11,  // Column L: Last Log Time
        LAST_LOG_USER: 12   // Column M: Last Log User
    },

    /**
     * Name of the sheet (tab) containing project list
     * Default: 'Project List'
     */
    // PROJECT_LIST_SHEET: 'Project List', // Already defined above

    // ========================================================================
    // COLUMN MAPPINGS FOR ALL KIDS PAGE (Relative to 'Child Names!A:Z')
    // ========================================================================
    ALL_KIDS_COLUMNS: {
        ID: 0,              // Column A: Unique Student ID
        NAME: 2,            // Column C: Child names
        PARENT_NAME: 4,     // Column E: Parent First Name (or F for Last)
        EMAIL: 1,           // Column B: Parent Email
        HEADSHOT: 8,        // Column I: Headshot
        NOTE: 23,           // Column X: Note for child
        TOTAL_POINTS: 33,   // Column AH: Total Points (All Time)
        AGE: 3,             // Column D: Child Age
        SERVICE_TITLE: 10   // Column K: Service Title
    },

    // ========================================================================
    // CACHE SETTINGS
    // ========================================================================

    /**
     * Cache duration in milliseconds
     * Default: 5 minutes (5 * 60 * 1000 ms)
     *
     * This controls how long downloaded data is stored in memory before
     * fetching fresh data from Google Sheets.
     *
     * Examples:
     * - 1 minute:  1 * 60 * 1000  =     60,000 ms
     * - 5 minutes: 5 * 60 * 1000  =    300,000 ms
     * - 10 minutes: 10 * 60 * 1000 =   600,000 ms
     * - 1 hour:    60 * 60 * 1000  = 3,600,000 ms
     *
     * Shorter duration = More API calls, more up-to-date data
     * Longer duration = Fewer API calls, may show slightly old data
     *
     * 5 minutes is a good balance for classroom use
     */
    CACHE_DURATION: 5 * 60 * 1000,  // 5 minutes in milliseconds

    // ========================================================================
    // CREDENTIALS FILE PATH
    // ========================================================================

    /**
     * Path to Google credentials JSON file (relative to project root)
     * Default: './google-credentials.json'
     *
     * This file contains the secret keys needed to access Google Sheets API
     * Get this file from Google Cloud Console when setting up API access
     *
     * IMPORTANT: Keep this file private! Don't share it or commit to git
     */
    CREDENTIALS_PATH: './google-credentials.json'
};

/*
 * ============================================================================
 * HOW TO UPDATE YOUR SPREADSHEET STRUCTURE
 * ============================================================================
 *
 * If you add or rearrange columns in your Google Sheet, update this file:
 *
 * 1. Identify the column number (A=0, B=1, C=2, ... Z=25, AA=26, AB=27, etc.)
 * 2. Add or update the entry in PROGRESS_COLUMNS
 * 3. Update google-sheets-service.js to use the new field
 *
 * Example: Adding a "Grade" column
 *
 * If you add a "Grade" column at Column AD (index 29):
 *
 * PROGRESS_COLUMNS: {
 *     ...existing columns...
 *     POINTS: 28,
 *     GRADE: 29      // Add this line
 * }
 *
 * Then in google-sheets-service.js, add:
 *     grade: row[config.PROGRESS_COLUMNS.GRADE] || '',
 *
 * ============================================================================
 *
 * WHY THESE NUMBERS?
 * ============================================================================
 *
 * Columns are zero-indexed (start counting from 0):
 * A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9, K=10...
 *
 * When we reach column Z (25), we continue:
 * AA=26, AB=27, AC=28, AD=29, etc.
 *
 * ============================================================================
 */
