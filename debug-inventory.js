const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./google-sheets-config');

async function getGoogleSheetsClient() {
    const credentialsPath = path.join(__dirname, config.CREDENTIALS_PATH);
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

async function debugInventory() {
    try {
        const sheets = await getGoogleSheetsClient();
        console.log('Fetching Inventory sheet headers...');

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: 'Inventory!A1:Z5', // Fetch first 5 rows to see headers and some data
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found in Inventory sheet.');
            return;
        }

        console.log('--- HEADERS (Row 1) ---');
        rows[0].forEach((header, index) => {
            console.log(`Column ${String.fromCharCode(65 + index)} (${index}): ${header}`);
        });

        console.log('\n--- FIRST ROW OF DATA (Row 2) ---');
        if (rows.length > 1) {
            rows[1].forEach((cell, index) => {
                console.log(`Column ${String.fromCharCode(65 + index)} (${index}): ${cell}`);
            });
        }

    } catch (error) {
        console.error('Error fetching inventory:', error);
    }
}

debugInventory();
