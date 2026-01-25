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

        const response = await sheets.spreadsheets.get({
            spreadsheetId: config.SPREADSHEET_ID
        });

        const sheetTitles = response.data.sheets.map(s => s.properties.title);
        console.log('Sheets in Main Spreadsheet:', sheetTitles);




    } catch (error) {
        console.error('Error:', error);
    }
}

checkHeaders();
