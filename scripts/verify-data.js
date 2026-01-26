
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'master_sheet_db.json');

try {
    if (!fs.existsSync(DB_PATH)) {
        console.log('FAILURE: master_sheet_db.json NOT FOUND at ' + DB_PATH);
        process.exit(1);
    }

    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(raw);

    console.log('DB Loaded. Sheets:', Object.keys(db.sheets));

    const bookingSheetName = 'All Booking Info'; // Hardcoded based on context, verify if needed
    const rows = db.sheets[bookingSheetName];

    if (!rows) {
        console.log(`FAILURE: Sheet "${bookingSheetName}" not found in DB.`);
        process.exit(1);
    }

    // Check for today's date: Jan 9, 2026
    const searchDate = "Jan 9, 2026";
    console.log(`Searching for rows with date "${searchDate}" in column 12...`);

    const matches = rows.filter(row => {
        // row[12] is Class Date
        return row[12] && row[12].trim() === searchDate;
    });

    console.log(`Found ${matches.length} matches for today.`);
    if (matches.length > 0) {
        console.log('Sample Match:', matches[0]);
    } else {
        // Check for any 2026 dates
        const any2026 = rows.filter(row => row[12] && row[12].includes("2026"));
        console.log(`Found ${any2026.length} rows for year 2026.`);
        if (any2026.length > 0) console.log('Sample 2026 row:', any2026[0]);
    }

} catch (err) {
    console.error('Error reading/parsing DB:', err);
}
