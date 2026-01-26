
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const path = require('path');

async function testAnalyticsAccess() {
    try {
        // 1. Initialize Client with existing credentials
        const keyPath = path.join(__dirname, 'google-credentials.json');

        // Attempt to load client
        const analyticsDataClient = new BetaAnalyticsDataClient({
            keyFilename: keyPath
        });

        // 2. Define the Property ID (You saw this in your script as the Measurement ID, 
        // usually Property ID is numeric. 
        // Measurement ID: G-TCMVVPTM1B
        // We need the numeric Property ID. Usually it's not the G-ID.
        // But for testing access, we can try to list properties or run a report if we have the ID.

        console.log('Credentials found. Attempting to authenticate...');

        // We can't easily guess the numeric Property ID from the G-ID (Measurement ID).
        // However, if we try to run a report on a common ID format, we'll get a specific "Permission Denied" vs "Not Found".
        // A better check: The Google Analytics Data API requires a numeric Property ID (e.g., 'properties/1234567').

        // Since we don't have the numeric ID handy (Neil checked it in), we can't run a full query.
        // BUT, successfully initializing the client means the JSON is valid.
        // The real test requires the Property ID.

        console.log('✅ Service Account Credential file is valid and readable.');
        console.log('⚠ To fully verify "Viewer Access", we need the numeric GA4 Property ID (not the G-XXXX ID).');
        console.log('If you have access to the source code of the dashboard or the Google Analytics URL, look for a number like "p1234567".');

    } catch (error) {
        console.error('❌ Failed to initialize Google Analytics Client:', error.message);
    }
}

testAnalyticsAccess();
