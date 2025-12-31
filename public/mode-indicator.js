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
    indicator.style.position = 'fixed';
    indicator.style.top = '100px';
    indicator.style.left = '20px';
    indicator.style.padding = '5px 10px';
    indicator.style.background = 'rgba(0, 0, 0, 0.7)';
    indicator.style.border = `1px solid ${color}`;
    indicator.style.color = color;
    indicator.style.borderRadius = '5px';
    indicator.style.fontWeight = 'bold';
    indicator.style.fontSize = '0.8em';
    indicator.style.zIndex = '9999';
    indicator.style.pointerEvents = 'none';
    indicator.style.fontFamily = "'Inter', sans-serif";
    indicator.style.letterSpacing = '1px';

    document.body.appendChild(indicator);
    console.log(`[Mode Indicator] Running in ${mode} mode (from server)`);
})();
