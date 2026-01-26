const googleSheetsService = require('./google-sheets-service');

async function testBackend() {
    console.log('--- TESTING BACKEND ---');

    // 1. Test Prizes
    console.log('\n[1] Testing fetchPrizesList()...');
    try {
        const prizes = await googleSheetsService.fetchPrizesList();
        console.log(`✅ Success: Found ${prizes.length} prizes.`);
    } catch (error) {
        console.error('❌ Failed fetchPrizesList:', error.message);
    }

    // 2. Test Redemptions
    console.log('\n[2] Testing fetchRedemptions()...');
    try {
        const redemptions = await googleSheetsService.fetchRedemptions();
        console.log(`✅ Success: Found ${redemptions.length} redemptions.`);
        if (redemptions.length > 0) console.log('Sample:', redemptions[0]);
    } catch (error) {
        console.error('❌ Failed fetchRedemptions:', error.message);
    }

    // 3. Test Leaderboard (Integration)
    console.log('\n[3] Testing getLeaderboard()...');
    try {
        const leaderboard = await googleSheetsService.getLeaderboard();
        console.log(`✅ Success: Leaderboard generated with ${leaderboard.length} students.`);
        const aahan = leaderboard.find(s => s.name.includes('Aahan'));
        if (aahan) {
            console.log('Aahan Stats:', {
                total: aahan.totalPoints,
                spent: aahan.spentPoints,
                balance: aahan.currentBalance
            });
        }
    } catch (error) {
        console.error('❌ Failed getLeaderboard:', error.message);
    }
}

testBackend();
