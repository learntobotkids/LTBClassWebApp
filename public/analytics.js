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
    // 0. GLOBAL ERROR LISTENER (New)
    // ========================================================================
    window.onerror = function (msg, url, lineNo, columnNo, error) {
        window.logAnalyticsEvent('client_error', {
            message: msg,
            source: url,
            lineno: lineNo,
            stack: error ? error.stack : null
        });
        return false;
    };

    // Helper for manual search logging
    window.trackSearch = function (query) {
        if (!query) return;
        window.logAnalyticsEvent('search_query', { query: query });
    };

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

    // ========================================================================
    // LOGGING FUNCTION
    // ========================================================================

    window.logAnalyticsEvent = (eventType, additionalData = {}) => {
        try {
            // [NEW] Smart Context Enrichment
            // Check if we have active project data loaded on the page
            let contextData = {};
            if (window.currentProject) {
                contextData.title = window.currentProject.name;
                contextData.projectId = window.currentProject.id;
            }

            // Context Data
            const eventData = {
                eventType: eventType,
                url: window.location.pathname + window.location.search,
                timestamp: new Date().toISOString(),
                studentId: localStorage.getItem('studentId') || localStorage.getItem('currentStudent') || 'anonymous',
                // [FIX] Prioritize currentStudent (active login) over studentName (legacy/stale)
                studentName: localStorage.getItem('currentStudent') || localStorage.getItem('studentName') || 'Guest',
                ...contextData,     // Add enriched context
                ...additionalData   // Allow overriding
            };

            // Fix for Root URL display
            if (eventData.url === '/' || eventData.url === '/index.html') {
                eventData.url = 'Home';
            } else if (eventData.url.startsWith('/?')) {
                eventData.url = 'Home ' + eventData.url.substring(1);
            }


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
    // [NEW] Smart Page View for Project Page
    // If we are on project.html, try to extract the project name from the URL "id"
    // Example ID: "PYTHON/Beginner/101 - Calculator" -> Title: "101 - Calculator"
    if (window.location.pathname.includes('project.html')) {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        let initialTitle = null;

        if (id) {
            // Take the last part of the path (the actual folder name)
            const parts = id.split('/');
            initialTitle = parts[parts.length - 1]; // "101 - Calculator"
            // Clean up encodings just in case
            try { initialTitle = decodeURIComponent(initialTitle); } catch (e) { }
        }

        window.logAnalyticsEvent('page_view', { title: initialTitle, projectId: id });
    } else {
        // Standard page view for other pages
        window.logAnalyticsEvent('page_view');
    }

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

    // [NEW] Video Completion
    document.addEventListener('ended', (e) => {
        if (e.target.tagName === 'VIDEO') {
            const videoEl = e.target;
            const videoTitle = videoEl.getAttribute('data-title') || videoEl.currentSrc.split('/').pop();
            window.logAnalyticsEvent('video_complete', {
                videoTitle: videoTitle,
                duration: videoEl.duration
            });
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

// ============================================================================
// PERFORMANCE MONITOR (USER REQUESTED)
// ============================================================================
window.addEventListener('load', () => {
    // Wait a tick to ensure layout is done and calc is accurate
    setTimeout(() => {
        // performance.now() gives accurate time since navigation start (timeOrigin)
        const loadTime = Math.round(performance.now());

        const el = document.createElement('div');
        el.id = 'perf-monitor';
        // Add styling: Top right, green on black transculent
        el.style.cssText = `
            position: fixed; 
            bottom: 0; 
            left: 0; 
            z-index: 99999; 
            background: rgba(0,0,0,0.85); 
            color: #4ade80; 
            padding: 5px 10px; 
            font-family: monospace; 
            font-size: 12px; 
            font-weight: bold;
            border-top-right-radius: 10px; 
            box-shadow: 4px -4px 10px rgba(0,0,0,0.5);
            pointer-events: none;
            backdrop-filter: blur(4px);
            border-right: 1px solid #4ade80;
            border-top: 1px solid #4ade80;
            text-shadow: 0 0 5px #4ade80;
            opacity: 0.8;
        `;
        el.innerHTML = `⚡ Load: ${loadTime}ms`;
        document.body.appendChild(el);

        console.log(`[Performance] Page Load Time: ${loadTime}ms`);
    }, 0);
});
