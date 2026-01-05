console.log('Starting test...');
try {
    const express = require('express');
    console.log('Imported express successfully');
} catch (e) {
    console.error('Failed to import express:', e);
}
console.log('Test complete');
