// ============================================================================
// INACTIVITY & AUTO-LOGOUT HANDLER
// ============================================================================
// Shared across all pages to ensure consistent logout behavior.

(function () {
    console.log('[Inactivity] Initializing monitor...');

    // [CONFIG] Change this value before production (e.g., 10 * 60 * 1000 for 10 mins)
    const LOGOUT_TIME = 1 * 60 * 1000; // 1 minute for testing
    let inactivityTimeout;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);

        // Only set timer if user is actually logged in
        // Checks both student and instructor login keys
        const isLogged = localStorage.getItem('currentStudent') ||
            localStorage.getItem('instructorLoggedIn');

        if (isLogged) {
            inactivityTimeout = setTimeout(doAutoLogout, LOGOUT_TIME);
        }
    }

    function doAutoLogout() {
        console.log('[AUTO-LOGOUT] User inactive for time limit');
        console.log('[AUTO-LOGOUT] Clearing session and reloading...');

        // Clear all session keys
        localStorage.removeItem('currentStudent');
        localStorage.removeItem('instructorLoggedIn');
        localStorage.removeItem('instructorName');
        localStorage.removeItem('studentFolder');

        // Redirect to home (login screen)
        window.location.href = '/';
    }

    // Listen for any user activity
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    events.forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, true); // true = capture phase
    });

    // Initialize on load
    resetInactivityTimer();

    // Export for debugging
    window.resetInactivityTimer = resetInactivityTimer;
})();
