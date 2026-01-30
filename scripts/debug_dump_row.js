const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('../google-sheets-config');

async function dumpRows() {
    try {
        const credentialsPath = path.join(__dirname, '..', config.CREDENTIALS_PATH);
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        // Fetch Row 21 (Reyesc) and Row 45 (Mehzabinhd)
        // A21:M21 and A45:M45
        console.log('Fetching Row 21 (Expected: reyesc@comcast.net)...');
        const r21 = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A21:M21`
        });
        console.log('Row 21 Data:', JSON.stringify(r21.data.values ? r21.data.values[0] : [], null, 2));

        console.log('\nFetching Row 45 (Expected: mehzabinhd@gmail.com)...');
        const r45 = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A45:M45`
        });
        console.log('Row 45 Data:', JSON.stringify(r45.data.values ? r45.data.values[0] : [], null, 2));

    } catch (error) {
        console.error('Error:', error);
    }
}
dumpRows();
