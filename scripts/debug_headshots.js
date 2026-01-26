
const { google } = require('googleapis');
const config = require('./google-sheets-config');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function inspectSheet() {
    try {
        let credentials;
        const credentialsPath = path.join(__dirname, 'google-credentials.json'); // Hardcoded standard path

        if (fs.existsSync(credentialsPath)) {
            credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        } else {
            console.error('No google-credentials.json found');
            return;
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        // Fetch Child Names sheet (ID, Name, and Column I)
        const uniqueSheetName = "Child Names";

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${uniqueSheetName}!A2:I100`,
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return;
        }

        console.log('--- Sample Data from Child Names (First 10) ---');
        rows.slice(0, 10).forEach((row, index) => {
            const id = row[0];
            const name = row[1];
            // Col I is index 8
            const headshotInfo = row[8] || '(empty)';
            console.log(`Row ${index + 2}: ID=${id}, Name=${name}, Col_I=${headshotInfo}`);
        });

    } catch (err) {
        console.error('Error:', err);
    }
}

inspectSheet();
