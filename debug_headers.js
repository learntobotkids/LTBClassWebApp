const config = require('./google-sheets-config');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function getGoogleSheetsClient() {
    const credentialsPath = path.join(__dirname, config.CREDENTIALS_PATH);
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function checkHeaders() {
    try {
        const sheets = await getGoogleSheetsClient();
        console.log(`Fetching headers from ${config.STUDENT_NAMES_SHEET}...`);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: config.SPREADSHEET_ID,
            range: `${config.STUDENT_NAMES_SHEET}!A1:N100`
        });

        const headers = response.data.values[0];
        const rows = response.data.values.slice(1);

        console.log('Searching for first ACTIVE student...');
        const activeStudent = rows.find(r => r[12] && r[12].toLowerCase().trim() === 'active');

        if (activeStudent) {
            console.log(`FOUND ACTIVE STUDENT: Name="${activeStudent[2] || activeStudent[1]}", RowIndex=${rows.indexOf(activeStudent) + 2}`);
        } else {
            console.log('NO active students found in first 100 rows.');
            // Dump all values in col 12 to see what they are
            console.log('All unique Col 12 values:', Array.from(new Set(rows.map(r => r[12]))));
        }



    } catch (error) {
        console.error('Error:', error);
    }
}

checkHeaders();
