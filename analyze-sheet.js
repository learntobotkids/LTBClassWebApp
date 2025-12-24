
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Target Spreadsheet ID provided by user
const SPREADSHEET_ID = '1W6ojeogcA__vqYcQvwpav07rP9g5rAMpYXvHHY3sRKM';
const CREDENTIALS_PATH = './google-credentials.json';

async function main() {
    try {
        console.log('Initializing Google Sheets API...');

        // 1. Authenticate
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            throw new Error(`Credentials file not found at ${CREDENTIALS_PATH}`);
        }

        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        console.log(`Analyzing spreadsheet: ${SPREADSHEET_ID}`);

        // 2. Get Spreadsheet Metadata (to find all tabs)
        const metadataResponse = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });

        const sheetsList = metadataResponse.data.sheets;
        console.log(`Found ${sheetsList.length} tabs.`);

        // 3. Iterate through each tab and fetch headers (Row 1)
        for (const sheet of sheetsList) {
            const title = sheet.properties.title;
            const sheetId = sheet.properties.sheetId;

            console.log(`\n-----------------------------------------------------------`);
            console.log(`Processing Tab: "${title}" (ID: ${sheetId})`);

            try {
                // Fetch the first row (A1:Z1)
                // We use A1:ZZ1 to be safe and cover many columns
                const headerResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${title}'!1:1`, // Row 1 of specific sheet
                });

                const rows = headerResponse.data.values;
                if (rows && rows.length > 0) {
                    console.log(`Headers (${rows[0].length} columns):`);
                    // Print headers with index
                    rows[0].forEach((header, index) => {
                        console.log(`  [${index}] ${header}`);
                    });
                } else {
                    console.log('  (Empty or no headers found in first row)');
                }

            } catch (err) {
                console.error(`  Error fetching headers for tab "${title}":`, err.message);
            }
        }

        console.log(`\n-----------------------------------------------------------`);
        console.log('Analysis Complete.');

    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

main();
