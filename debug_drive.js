
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Folder ID to check (Headshots Folder)
const FOLDER_ID = '1eS-A7TfOOrvNe57H0bwqm1lmSK_1wNGk';

async function checkFolder() {
    try {
        console.log('--- DIAGNOSTIC START ---');
        console.log(`Checking Folder ID: ${FOLDER_ID}`);

        // 1. Auth
        const KEY_PATH = path.join(__dirname, 'google-credentials.json');
        if (!fs.existsSync(KEY_PATH)) {
            throw new Error('google-credentials.json not found!');
        }
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_PATH,
            scopes: ['https://www.googleapis.com/auth/drive']
        });
        const drive = google.drive({ version: 'v3', auth });

        const email = (await auth.getCredentials()).client_email;
        console.log(`Authenticated as: ${email}`);

        // 2. Get Folder Metadata
        console.log('Fetching folder metadata...');
        const res = await drive.files.get({
            fileId: FOLDER_ID,
            fields: 'id, name, mimeType, capabilities, owners, driveId',
            supportsAllDrives: true
        });

        const folder = res.data;
        console.log('\n--- FOLDER DETAILS ---');
        console.log(`Name: ${folder.name}`);
        console.log(`MIME: ${folder.mimeType}`);
        console.log(`Drive ID (Shared Drive): ${folder.driveId || 'NULL (Personal Drive)'}`);

        console.log('\n--- OWNERSHIP ---');
        if (folder.owners) {
            folder.owners.forEach(o => console.log(`Owner: ${o.displayName} (${o.emailAddress})`));
        } else {
            console.log('Owners: Not applicable (Shared Drive?)');
        }

        console.log('\n--- CAPABILITIES (What we can do) ---');
        console.log(`canAddChildren: ${folder.capabilities.canAddChildren}`);
        console.log(`canEdit: ${folder.capabilities.canEdit}`);
        console.log(`canDelete: ${folder.capabilities.canDelete}`);

        console.log('\n--- CONCLUSION ---');
        if (folder.driveId) {
            console.log('✅ Folder IS in a Shared Drive.');
            if (folder.capabilities.canAddChildren) {
                console.log('✅ Service Account HAS write permissions.');
            } else {
                console.log('❌ Service Account DOES NOT have write permissions. Check IAM roles (Manager/Content Manager needed).');
            }
        } else {
            console.log('❌ Folder is in a PERSONAL DRIVE (My Drive).');
            console.log('   Reason for failure: Service Accounts typically cannot own files in Personal Drives (0 quota).');
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        if (error.errors) console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
}

checkFolder();
