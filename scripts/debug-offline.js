
const service = require('./google-sheets-service');
const fs = require('fs');
const path = require('path');

// Mock getGoogleSheetsClient to fail
service.getGoogleSheetsClient = async () => {
    throw new Error('Simulated Offline Mode');
};

async function testOffline() {
    console.log('--- Testing Offline Booking Fetch ---');
    try {
        const bookings = await service.fetchBookingInfo(true); // Force refresh to trigger fetch logic
        console.log('Result:', bookings);
        if (bookings && bookings.length > 0) {
            console.log('SUCCESS: Fetched ' + bookings.length + ' bookings from local DB.');
        } else {
            console.log('FAILURE: No bookings returned. Check local DB content/date.');
        }
    } catch (err) {
        console.error('CRITICAL FAILURE:', err);
    }
}

testOffline();
