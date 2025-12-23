
(function() {
    // Mode detection logic
    function isOfflineMode() {
        const hostname = window.location.hostname;
        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            /^192\.168\.\d+\.\d+$/.test(hostname) ||
            /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
            /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
            hostname.endsWith('.local')
        );
    }

    const mode = isOfflineMode() ? 'OFFLINE' : 'ONLINE';
    const color = mode === 'ONLINE' ? '#10B981' : '#F59E0B'; // Green for Online, Amber for Offline

    // Create indicator element
    const indicator = document.createElement('div');
    indicator.textContent = mode;
    indicator.style.position = 'fixed';
    indicator.style.top = '100px'; // Below navbar (which is usually ~70-90px)
    indicator.style.left = '20px';
    indicator.style.padding = '5px 10px';
    indicator.style.background = 'rgba(0, 0, 0, 0.7)';
    indicator.style.border = `1px solid ${color}`;
    indicator.style.color = color;
    indicator.style.borderRadius = '5px';
    indicator.style.fontWeight = 'bold';
    indicator.style.fontSize = '0.8em';
    indicator.style.zIndex = '9999';
    indicator.style.pointerEvents = 'none'; // Don't interfere with clicks
    indicator.style.fontFamily = "'Inter', sans-serif";
    indicator.style.letterSpacing = '1px';

    // Append to body when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(indicator));
    } else {
        document.body.appendChild(indicator);
    }

    console.log(`[Mode Indicator] Running in ${mode} mode`);
})();
