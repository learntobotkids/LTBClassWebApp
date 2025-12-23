const http = require('http');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function verify() {
    try {
        console.log('1. Fetching folders...');
        const foldersData = await makeRequest('/api/student-folders');

        if (!foldersData.success || !foldersData.folders || foldersData.folders.length === 0) {
            console.error('No folders found or failed to list folders.');
            console.log(JSON.stringify(foldersData, null, 2));
            return;
        }

        const firstFolder = foldersData.folders[0].name;
        console.log(`2. Testing with folder: "${firstFolder}"`);

        const filesData = await makeRequest(`/api/student-folders/${encodeURIComponent(firstFolder)}/files`);

        console.log('3. Checking response for resolvedFolderName...');
        if (filesData.resolvedFolderName) {
            console.log('SUCCESS: resolvedFolderName is present!');
            console.log('Value:', filesData.resolvedFolderName);
        } else {
            console.error('FAILURE: resolvedFolderName is MISSING.');
            console.log('Response keys:', Object.keys(filesData));
        }

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Wait a bit for server to fully start if needed, then run
setTimeout(verify, 2000);
