/**
 * LearnToBot Performance Telemetry
 * Tracks network latency and video buffer health to help teachers monitor class performance.
 */

(function () {
    console.log('[Telemetry] Initializing Performance Monitoring...');

    const TELEMETRY_INTERVAL = 5000; // 5 seconds
    let socket = null;

    // Check if socket.io is available
    if (window.io) {
        initTelemetry();
    } else {
        // Wait for socket.io to load
        const checkSocket = setInterval(() => {
            if (window.io) {
                clearInterval(checkSocket);
                initTelemetry();
            }
        }, 500);
    }

    function initTelemetry() {
        // Reuse existing socket if available globally, or create new
        if (typeof window.socket !== 'undefined') {
            socket = window.socket;
        } else {
            socket = io();
        }

        // Start the telemetry loop
        setInterval(collectAndSendTelemetry, TELEMETRY_INTERVAL);

        // Listen for ping requests (for precise latency measurement)
        socket.on('server-ping', (data) => {
            socket.emit('client-pong', { timestamp: data.timestamp });
        });
    }

    function collectAndSendTelemetry() {
        if (!socket || !socket.connected) return;

        const metrics = {
            timestamp: Date.now(),
            rtt: 0, // Round Trip Time (latency) - calculated server-side or via ping/pong
            bufferHealth: -1, // -1 means no active video
            bufferingCount: 0,
            loadTime: getLoadTime()
        };

        // 1. Measure Video Buffer Health & Activity
        const video = document.querySelector('video');
        if (video && !video.paused && !video.ended) {
            // [NEW] Track what they are watching
            let videoName = 'Unknown Video';
            try {
                const src = video.currentSrc || video.src;
                if (src) {
                    videoName = src.split('/').pop(); // Get filename
                    // Decode URI component to make it readable
                    videoName = decodeURIComponent(videoName);
                }
            } catch (e) { }

            metrics.currentVideo = videoName; // Add to metrics

            if (video.buffered.length > 0) {
                const currentTime = video.currentTime;
                // Find the buffer range that covers current time
                for (let i = 0; i < video.buffered.length; i++) {
                    if (video.buffered.start(i) <= currentTime && video.buffered.end(i) >= currentTime) {
                        metrics.bufferHealth = video.buffered.end(i) - currentTime;
                        break;
                    }
                }
            }
        } else {
            metrics.currentVideo = null; // Not watching
        }

        // 2. Measure RTT (Latency)
        // We schedule a ping now, and update our tracked RTT on response
        // This ensures next heartbeat has fresh data
        const startPing = Date.now();
        socket.emit('telemetry-ping', { start: startPing }, () => {
            // Callback executes when server responds
            const latency = Date.now() - startPing;
            metrics.rtt = latency; // Update for NEXT interval (approx) or keep global
            lastKnownRtt = latency;
        });

        // Use last known RTT (or 0 if first run)
        metrics.rtt = lastKnownRtt;

        // Send telemetry (fire and forget)
        socket.emit('client-telemetry', metrics);
    }

    let lastKnownRtt = 0;

    function getLoadTime() {
        if (window.performance && window.performance.getEntriesByType) {
            const navEntry = window.performance.getEntriesByType('navigation')[0];
            if (navEntry) {
                return Math.round(navEntry.loadEventEnd || 0);
            }
        }
        return 0;
    }

})();
