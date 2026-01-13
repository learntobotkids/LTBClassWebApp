// Mode Indicator - Shows ONLINE/OFFLINE badge on screen
// Fetches deployment mode from server's /api/config endpoint

(async function () {
    let mode = 'OFFLINE'; // Default

    // Fetch mode from server
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        mode = (config.deploymentMode || 'offline').toUpperCase();
    } catch (error) {
        console.warn('[Mode Indicator] Could not fetch config, defaulting to OFFLINE');
        mode = 'OFFLINE';
    }

    const color = mode === 'ONLINE' ? '#10B981' : '#F59E0B';

    // Create indicator element
    const indicator = document.createElement('div');
    indicator.textContent = mode;
    indicator.id = 'modeIndicator';
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        padding: 6px 14px;
        background: rgba(0, 0, 0, 0.85);
        border: 1px solid ${color};
        color: ${color};
        border-radius: 20px;
        font-weight: 700;
        font-size: 0.7em;
        z-index: 9999;
        pointer-events: none;
        font-family: 'Inter', sans-serif;
        letter-spacing: 1px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    document.body.appendChild(indicator);
    console.log(`[Mode Indicator] Running in ${mode} mode (from server)`);
})();

