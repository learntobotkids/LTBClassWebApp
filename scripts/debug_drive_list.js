
const { google } = require('googleapis');
const config = require('./google-sheets-config');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function listDriveFolder() {
    try {
        let credentials;
        const credentialsPath = path.join(__dirname, 'google-credentials.json');

        if (fs.existsSync(credentialsPath)) {
            credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        } else {
            console.error('No google-credentials.json found');
            return;
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly']
        });

        const drive = google.drive({ version: 'v3', auth });
        const FOLDER_ID = '1oKkD9JYBAhSM5NKXy9gcejXZ6DkEwVL3';

        console.log(`Listing contents of folder: ${FOLDER_ID}`);

        const res = await drive.files.list({
            q: `'${FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            pageSize: 50
        });

        const files = res.data.files;
        if (files.length === 0) {
            console.log('Folder is empty.');
        } else {
            console.log('Files:');
            files.forEach((file) => {
                console.log(`${file.name} (${file.mimeType}) [${file.id}]`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

listDriveFolder();
