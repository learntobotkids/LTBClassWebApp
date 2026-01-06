
const googleSheetsService = require('./google-sheets-service');

async function checkIds() {
    try {
        console.log("Fetching projects from sheet...");
        const sheetProjects = await googleSheetsService.fetchAllProjectsDetailed();
        console.log(`Fetched ${sheetProjects.length} projects from sheet.`);
        if (sheetProjects.length > 0) {
            const game003 = sheetProjects.find(p => p.id === 'GAME003');
            if (game003) {
                console.log("Found GAME003 in Sheet:", JSON.stringify(game003, null, 2));
            } else {
                console.log("GAME003 NOT found in Sheet.");
                // Look for similar
                const similar = sheetProjects.filter(p => p.id.includes('GAME'));
                console.log(`Found ${similar.length} 'GAME' projects.`);
                if (similar.length > 0) console.log("First 3 GAME projects:", similar.slice(0, 3).map(p => p.id));
            }
        }
    } catch (e) {
        console.error(e);
    }
}

checkIds();
