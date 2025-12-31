/**
 * LearnToBot Analytics Telemetry Script
 * Tracks user engagement, including page views and video watch time.
 */

(function () {
    console.log('[Analytics] Initializing Telemetry...');

    // CONFIGURATION
    const HEARTBEAT_INTERVAL = 15000; // 15 seconds
    let activeVideo = null;
    let heartbeatTimer = null;

    // ========================================================================
    // LOGGING FUNCTION
    // ========================================================================

    window.logAnalyticsEvent = (eventType, additionalData = {}) => {
        try {
            // Context Data
            const eventData = {
                eventType: eventType,
                url: window.location.pathname,
                timestamp: new Date().toISOString(),
                studentId: localStorage.getItem('studentId') || 'anonymous',
                studentName: localStorage.getItem('studentName') || 'Guest',
                ...additionalData
            };

            // Use Beacon if available (more reliable on page unload)
            const endpoint = '/api/analytics/event';
            const blob = new Blob([JSON.stringify(eventData)], { type: 'application/json' });

            if (navigator.sendBeacon) {
                navigator.sendBeacon(endpoint, blob);
            } else {
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(eventData)
                }).catch(e => console.error('[Analytics] Upload Failed', e));
            }

            // Debug Log (for dev)
            // console.log(`[Analytics] Logged: ${eventType}`, eventData);

        } catch (err) {
            console.error('[Analytics] Error logging event:', err);
        }
    };

    // ========================================================================
    // AUTO-TRACKERS
    // ========================================================================

    // 1. Page View (Immediate)
    window.logAnalyticsEvent('page_view');

    // 2. Video Tracking (Heartbeats)
    // Listens for all 'play' and 'pause' events on the page (capturing)
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'VIDEO') {
            startHeartbeat(e.target);
        }
    }, true);

    document.addEventListener('pause', (e) => {
        if (e.target.tagName === 'VIDEO') {
            stopHeartbeat();
        }
    }, true);

    // Also track regular timeupdate to detect seeking vs watching
    // (Optional: can add later if Heartbeat isn't enough)

    // Helper: Start Heartbeat
    function startHeartbeat(videoEl) {
        if (activeVideo === videoEl) return; // Already tracking
        stopHeartbeat(); // Stop any other

        activeVideo = videoEl;
        const videoTitle = videoEl.getAttribute('data-title') || videoEl.currentSrc.split('/').pop();

        // Log 'video_start'
        window.logAnalyticsEvent('video_start', {
            videoTitle: videoTitle,
            currentTime: videoEl.currentTime,
            duration: videoEl.duration
        });

        // Start Timer
        heartbeatTimer = setInterval(() => {
            if (!activeVideo || activeVideo.paused) {
                stopHeartbeat();
                return;
            }
            window.logAnalyticsEvent('video_heartbeat', {
                videoTitle: videoTitle,
                currentTime: activeVideo.currentTime,
                duration: activeVideo.duration
            });
        }, HEARTBEAT_INTERVAL);
    }

    // Helper: Stop Heartbeat
    function stopHeartbeat() {
        if (activeVideo) {
            const videoTitle = activeVideo.getAttribute('data-title') || activeVideo.currentSrc.split('/').pop();
            window.logAnalyticsEvent('video_pause', {
                videoTitle: videoTitle,
                currentTime: activeVideo.currentTime
            });
        }
        clearInterval(heartbeatTimer);
        activeVideo = null;
        heartbeatTimer = null;
    }

})();
