const googleSheetsService = require('./google-sheets-service');

async function debugStrict() {
    try {
        console.log(`[DEBUG_SCRIPT] Using Config SPREADSHEET_ID: ${googleSheetsService.config?.SPREADSHEET_ID || "Unknown (Checked via verify)"}`);
        const TARGET_ID = "kahn_qin@outlook.com/William Qin";
        console.log(`\n🔍 STRICT CHECK for Student ID: "${TARGET_ID}"`);
        console.log("Fetching FULL Project Log...");

        const allProjects = await googleSheetsService.fetchProjectLog(true);

        // 1. Exact Matches
        const exactMatches = allProjects.filter(p => p.studentId === TARGET_ID);
        console.log(`\n✅ EXACT MATCHES found: ${exactMatches.length} `);
        exactMatches.forEach(p => {
            console.log(`Row ${p.uniqueId}: [${p.projectStatus}] ${p.projectName} (Type: ${p.assignType})`);
        });

        // 2. Near Matches (Whitespace/Case issues)
        const nearMatches = allProjects.filter(p =>
            p.studentId !== TARGET_ID &&
            p.studentId.trim().toLowerCase() === TARGET_ID.trim().toLowerCase()
        );

        if (nearMatches.length > 0) {
            console.log(`\n⚠️ WARNING: Found ${nearMatches.length} NEAR matches(whitespace /case mismatch): `);
            nearMatches.forEach(p => {
                console.log(`Row ${p.uniqueId}: ID = "${p.studentId}" -> [${p.projectStatus}] ${p.projectName} `);
            });
        } else {
            console.log("\nNo near-matches (whitespace/casing/ghost) found.");
        }

        // 3. Search for PROJ122 globally again just to see where it is
        console.log("\n🔎 Global Scan for PROJ122:");
        const p122 = allProjects.filter(p => p.projectName === "PROJ122");
        console.log(`Total PROJ122 entries in sheet: ${p122.length} `);
        // Show a few samples
        p122.slice(0, 5).forEach(p => console.log(` - Assigned to: ${p.studentId} (Status: ${p.projectStatus})`));

    } catch (e) {
        console.error("Debug Error:", e);
    }
}

debugStrict();
