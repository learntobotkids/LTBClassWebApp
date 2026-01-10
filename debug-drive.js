
const { google } = require('googleapis');
const config = require('./google-sheets-config');
require('dotenv').config();

async function debugDrive() {
    try {
        console.log('--- DEBUGGING GOOGLE DRIVE PERMISSIONS ---');

        // 1. Get Credentials
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        console.log(`\n Service Account Email: ${credentials.client_email}`);
        console.log(' (Ensure the Drive folder is shared with this email!)');

        // 2. Auth
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        const client = await auth.getClient();
        const drive = google.drive({ version: 'v3', auth: client });

        // 3. Check Folder
        const folderId = config.DRIVE_HEADSHOTS_FOLDER_ID;
        console.log(`\n Checking Folder ID: ${folderId}`);

        // 4. Search for "Child Names_Images" folder
        console.log(' Searching for "Child Names_Images" folder...');
        const res = await drive.files.list({
            q: "name = 'Child Names_Images' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name, parents)',
            pageSize: 10
        });

        const folders = res.data.files;
        if (folders.length === 0) {
            console.log(' ❌ "Child Names_Images" folder NOT found.');
            console.log('    (It might not be shared with the service account)');
        } else {
            console.log(` ✅ Found ${folders.length} candidate folders:`);
            folders.forEach(f => {
                console.log(`   - Name: ${f.name}`);
                console.log(`     ID:   ${f.id}`);
                console.log(`     Parent: ${f.parents ? f.parents[0] : 'N/A'}`);
                if (f.parents && f.parents.includes(folderId)) {
                    console.log('     *** THIS IS LIKELY THE CORRECT SUBFOLDER ***');
                    console.log('     Update google-sheets-config.js DRIVE_HEADSHOTS_FOLDER_ID with this ID.');
                }
            });
        }

    } catch (error) {
        console.error('\n ❌ ERROR:', error.message);
    }
}

debugDrive();
