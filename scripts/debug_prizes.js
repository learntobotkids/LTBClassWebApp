const googleSheetsService = require('./google-sheets-service');

async function testPrizes() {
    console.log('Testing fetchPrizesList()...');
    try {
        const prizes = await googleSheetsService.fetchPrizesList();
        console.log('Success!');
        console.log(`Found ${prizes.length} prizes.`);
        if (prizes.length > 0) {
            console.log('Sample Prize:', prizes[0]);
        } else {
            console.log('Result is empty array.');
        }
    } catch (error) {
        console.error('FAILED:', error);
    }
}

testPrizes();
