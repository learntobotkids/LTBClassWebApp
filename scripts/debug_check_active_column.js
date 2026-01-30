const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('../google-sheets-config');

async function checkActiveColumn() {
    try {
        console.log('Connecting to Google Sheets...');
        // Load credentials from file (local mode)
        const credentialsPath = path.join(__dirname, '..', config.CREDENTIALS_PATH);
        if (!fs.existsSync(credentialsPath)) {
            throw new Error(`Credentials file not found at ${credentialsPath}`);
        }
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        const range = `${config.STUDENT_NAMES_SHEET}!M:M`; // Column M only
        console.log(`Fetching range: ${range}`);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: range,
        });

        const rows = response.data.values || [];
        console.log(`Found ${rows.length} rows.`);

        // Collect unique values
        const uniqueValues = new Set();
        rows.forEach((row, index) => {
            if (index === 0) return; // Skip header
            const val = row[0] ? row[0].trim() : '(empty)';
            uniqueValues.add(val);
        });

        console.log('Unique values in Column M (Active?):');
        console.log(Array.from(uniqueValues));

    } catch (error) {
        console.error('Error:', error);
    }
}

checkActiveColumn();
