
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/projects',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.projects && json.projects.length > 0) {
                console.log(`Found ${json.projects.length} projects.`);

                // Check specifically for GAME003
                const game003 = json.projects.find(p => p.name.includes('GAME003') || p.name.includes('Game 003'));
                if (game003) {
                    console.log("\n[DEBUG] Found GAME003 Project matching name:");
                    console.log(JSON.stringify(game003, null, 2));
                } else {
                    console.log("\n[DEBUG] Could NOT find any project with 'GAME003' in the name.");
                }

                // Print a few others to see the format
                console.log("\n[DEBUG] First 5 project names:");
                json.projects.slice(0, 5).forEach(p => console.log(`- "${p.name}" (Points: ${p.points})`));

            } else {
                console.log("No projects found in response.");
            }
        } catch (e) {
            console.error("Error parsing JSON:", e);
            console.log("Raw Data:", data);
        }
    });
});

req.on('error', (error) => {
    console.error('Error requesting /api/projects:', error);
    console.log("Make sure the server is running on port 3000!");
});

req.end();
