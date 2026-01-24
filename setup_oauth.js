const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
// const opener = require('open'); // Removed to avoid dependency issues

// Configuration
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Main function to start the OAuth flow
 */
async function main() {
    // 1. Load Client Secret
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('❌ Error: client_secret.json not found.');
        console.error('Please download your OAuth Client ID JSON from Google Cloud Console,');
        console.error('rename it to "client_secret.json", and place it in this folder.');
        process.exit(1);
    }

    const content = fs.readFileSync(CREDENTIALS_PATH);
    const keys = JSON.parse(content);

    // Handle different JSON structures (installed vs web)
    const key = keys.installed || keys.web;
    if (!key) {
        console.error('❌ Error: Invalid client_secret.json format. Ensure it contains "installed" or "web" property.');
        process.exit(1);
    }

    // 2. Create OAuth Client
    // We use a local server to handle the callback
    const redirectUri = 'http://localhost:3000/oauth2callback';
    const client = new google.auth.OAuth2(
        key.client_id,
        key.client_secret,
        redirectUri
    );

    // 3. Generate Auth URL
    const authUrl = client.generateAuthUrl({
        access_type: 'offline', // CRITICAL: Ensures we get a Refresh Token
        scope: SCOPES,
        prompt: 'consent'       // Force consent to ensure we get a refresh token every time
    });

    console.log('\n--- AUTHORIZATION REQUIRED ---');
    console.log('1. I will open your browser to the Google Login page.');
    console.log('2. Log in with the account that OWNS the Drive folder (neil.dey11@gmail.com).');
    console.log('3. Grant access to the app.');
    console.log('4. The page will say "Authentication successful" and you can close it.');
    console.log('------------------------------\n');

    // 4. Start Local Server to catch the callback
    const server = http.createServer(async (req, res) => {
        try {
            if (req.url.startsWith('/oauth2callback')) {
                const q = url.parse(req.url, true).query;

                if (q.error) {
                    console.error('Error during authentication:', q.error);
                    res.end('Authentication failed! Check console.');
                    server.close();
                    return;
                }

                const { tokens } = await client.getToken(q.code);
                client.setCredentials(tokens);

                // Save tokens
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
                console.log(`\n✅ Success! Token saved to: ${TOKEN_PATH}`);
                console.log('You can now restart your main server.');

                res.end('Authentication successful! You can close this tab/window.');
                server.close();
                process.exit(0);
            }
        } catch (e) {
            console.error('Error exchanging code for token:', e);
            res.end('Error occurred. Check console.');
            server.close();
        }
    });

    server.listen(3000, () => {
        console.log('Waiting for authentication...');
        // Try to open browser
        // If 'open' module isn't available, we just log the URL
        console.log(`\n👉 CLICK THIS LINK if it doesn't open automatically:\n${authUrl}\n`);

        // dynamic import or fallback
        // import('open').then(open => open.default(authUrl)).catch(() => {});
    });
}

main().catch(console.error);
