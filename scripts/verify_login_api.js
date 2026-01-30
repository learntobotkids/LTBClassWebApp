const http = require('http');

async function testEmail(email, expectedStatus) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ email: email });

        const options = {
            hostname: 'localhost',
            port: 3001, // Updated to match .env PORT
            path: '/api/check-parent-email',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    const passed = (json.success === expectedStatus);
                    console.log(`[TEST] Email: ${email}`);
                    console.log(`       Expected Success: ${expectedStatus}`);
                    console.log(`       Actual Success:   ${json.success}`);
                    console.log(`       Message: ${json.message || 'N/A'}`);
                    console.log(`       Result: ${passed ? 'PASS' : 'FAIL'}`);
                    console.log('------------------------------------------------');
                    resolve();
                } catch (e) {
                    console.error('Failed to parse response:', body);
                    resolve();
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request Error:', error);
            resolve();
        });

        req.write(data);
        req.end();
    });
}

async function runTests() {
    console.log('Starting API Verification...');

    // 1. Active User
    await testEmail('reyesc@comcast.net', true);

    // 2. Paused User
    await testEmail('mehzabinhd@gmail.com', false);

    // 3. Blank/Inactive User
    await testEmail('stephenctoliver@yahoo.com', false);
}

runTests();
