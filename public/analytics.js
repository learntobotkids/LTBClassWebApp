/**
 * LearnToBot Analytics Telemetry Script
 * Tracks user engagement, including page views and video watch time.
 */

(function () {
    console.log('[Analytics] Initializing Telemetry...');

    // CONFIGURATION
    const HEARTBEAT_INTERVAL = 15000; // 15 seconds
    const GA_MEASUREMENT_ID = 'G-TCMVVPTM1B';
    const PRODUCTION_DOMAIN = 'portal.learntobot.com';

    let activeVideo = null;
    let heartbeatTimer = null;

    // ========================================================================
    // GOOGLE ANALYTICS INIT
    // ========================================================================
    function initGoogleAnalytics() {
        // Simple check to only run in production (or if forced via URL param ?analytics=true)
        const isProd = window.location.hostname === PRODUCTION_DOMAIN;
        const forceAnalytics = new URLSearchParams(window.location.search).has('analytics');

        if (isProd || forceAnalytics) {
            console.log(`[Analytics] Initializing Google Analytics (${GA_MEASUREMENT_ID})...`);

            // 1. Inject Script Tag
            const script = document.createElement('script');
            script.async = true;
            script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
            document.head.appendChild(script);

            // 2. Initialize Data Layer
            window.dataLayer = window.dataLayer || [];
            function gtag() { dataLayer.push(arguments); }
            window.gtag = gtag;
            gtag('js', new Date());

            // 3. Config
            gtag('config', GA_MEASUREMENT_ID);
        } else {
            console.log('[Analytics] Skipping Google Analytics (Not on production domain)');
        }
    }

    // Initialize immediately
    initGoogleAnalytics();

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
