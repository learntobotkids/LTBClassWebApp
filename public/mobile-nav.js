
document.addEventListener('DOMContentLoaded', () => {
    const navbarContainer = document.querySelector('.navbar-container');
    const navbarMenu = document.querySelector('.navbar-menu');

    // Run auth check regardless of menu creation
    updateAuthUI();

    // Don't run if we already have a mobile menu button or if critical elements are missing
    if (!navbarContainer || !navbarMenu || document.querySelector('.mobile-menu-btn')) return;

    // Create hamburger button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '☰';
    menuBtn.ariaLabel = 'Toggle navigation menu';

    // Insert after navbar-brand to ensure it's on the top row
    const navbarBrand = document.querySelector('.navbar-brand');
    if (navbarBrand) {
        navbarBrand.insertAdjacentElement('afterend', menuBtn);
    } else {
        navbarContainer.prepend(menuBtn);
    }

    // Toggle logic
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navbarMenu.classList.toggle('mobile-open');
        menuBtn.innerHTML = navbarMenu.classList.contains('mobile-open') ? '✕' : '☰';
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navbarContainer.contains(e.target) && navbarMenu.classList.contains('mobile-open')) {
            navbarMenu.classList.remove('mobile-open');
            menuBtn.innerHTML = '☰';
        }
    });

    console.log('[Mobile Nav] Initialized');

    // MOBILE ONLY: Inject Tour into the menu
    const tourLi = document.createElement('li');
    tourLi.className = 'mobile-only'; // Add class to hide on desktop
    tourLi.innerHTML = '<a href="#" class="navbar-link" onclick="if(window.toggleHowToUseModal) { window.toggleHowToUseModal(); toggleMenu(); } return false;">🚀 Tour</a>';
    navbarMenu.appendChild(tourLi);
});

// GLOBAL AUTH UI HANDLER
async function updateAuthUI() {


    const navbarAuth = document.querySelector('.navbar-auth');
    if (!navbarAuth) return; // Should not happen if HTML is correct

    const studentName = localStorage.getItem('currentStudent');
    const instructor = localStorage.getItem('instructorLoggedIn');

    // Clear existing content to rebuild
    navbarAuth.innerHTML = '';

    if (studentName || instructor) {
        // LOGGED IN STATE

        if (instructor) {
            // Instructor Badge (Keep Simple)
            const userSpan = document.createElement('span');
            userSpan.className = 'navbar-user';
            userSpan.style.display = 'inline-block';
            userSpan.style.marginRight = '10px';
            userSpan.style.color = '#E5E7EB';
            userSpan.style.fontWeight = '600';
            userSpan.textContent = `👨‍🏫 ${localStorage.getItem('instructorName') || 'Instructor'}`;
            navbarAuth.appendChild(userSpan);
        } else {
            // Student Profile Pill (Rich UI)

            // Create container
            const pill = document.createElement('div');
            pill.className = 'user-profile-pill';

            // 1. Points Section
            const pointsDiv = document.createElement('div');
            pointsDiv.className = 'user-points';
            pointsDiv.innerHTML = `<span class="points-icon">💎</span><span id="navUserPoints">...</span>`;
            pill.appendChild(pointsDiv);

            // 2. Info Section (Name + Headshot)
            const infoDiv = document.createElement('div');
            infoDiv.className = 'user-info';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = studentName;

            const img = document.createElement('img');
            img.className = 'user-headshot-nav';
            img.alt = 'Profile';
            img.src = ''; // Will populate async
            img.onerror = function () { this.style.display = 'none'; }; // Hide if broken

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(img);
            pill.appendChild(infoDiv);

            navbarAuth.appendChild(pill);

            // Fetch Data Async
            fetchStudentDataRecursive(studentName, img, document.getElementById('navUserPoints'));
        }

        // Tour Button (Logged In)
        const tourBtn = document.createElement('button');
        tourBtn.className = 'navbar-btn tour-desktop-btn'; // New class for hiding on mobile if needed
        tourBtn.style.marginRight = '8px';
        tourBtn.style.background = 'rgba(59, 130, 246, 0.1)';
        tourBtn.style.border = '1px solid rgba(59, 130, 246, 0.5)';
        tourBtn.style.padding = '6px 10px'; // Compact padding
        tourBtn.style.fontSize = '0.9em'; // Current font size
        tourBtn.innerHTML = '🚀 Tour';
        tourBtn.onclick = () => {
            if (window.toggleHowToUseModal) window.toggleHowToUseModal();
        };
        navbarAuth.appendChild(tourBtn);

        // Logout Button
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'navbar-btn logout';
        logoutBtn.innerText = 'Logout'; // innerText for safety
        logoutBtn.onclick = handleGlobalLogout;
        navbarAuth.appendChild(logoutBtn);

    } else {
        // LOGGED OUT STATE

        // Tour Button (Logged Out)
        const tourBtn = document.createElement('button');
        tourBtn.className = 'navbar-btn tour-desktop-btn';
        tourBtn.style.marginRight = '8px';
        tourBtn.style.background = 'rgba(59, 130, 246, 0.1)';
        tourBtn.style.border = '1px solid rgba(59, 130, 246, 0.5)';
        tourBtn.style.padding = '6px 10px'; // Compact
        tourBtn.style.fontSize = '0.9em';
        tourBtn.innerHTML = '🚀 Tour';
        tourBtn.onclick = () => {
            if (window.toggleHowToUseModal) window.toggleHowToUseModal();
        };
        navbarAuth.appendChild(tourBtn);
        const loginBtn = document.createElement('button');
        loginBtn.className = 'navbar-btn';
        loginBtn.id = 'navbarLoginBtn';
        loginBtn.textContent = 'Login';
        loginBtn.onclick = handleGlobalLogin;
        navbarAuth.appendChild(loginBtn);
    }

    // Toggle "My Progress" Link Visibility
    const progressLink = document.querySelector('a[href*="child-progress.html"], a[href*="student-progress.html"]');
    if (progressLink) {
        progressLink.style.display = (studentName) ? 'inline-block' : 'none';
        const parentLi = progressLink.parentElement;
        if (parentLi && parentLi.tagName === 'LI') {
            parentLi.style.display = (studentName) ? 'block' : 'none';
        }
    }
}

async function fetchStudentDataRecursive(studentName, imgEl, pointsEl) {
    try {
        // 1. Get Headshot (from Students List - name based)
        // We do this independently so headshot appears even if points fail
        fetch('/api/students')
            .then(res => res.json())
            .then(data => {
                if (data.students) {
                    const student = data.students.find(s => s.name === studentName);
                    if (student && student.headshot) {
                        if (student.headshot.startsWith('http') || student.headshot.startsWith('/')) {
                            imgEl.src = student.headshot;
                        } else if (student.headshot.includes('.')) {
                            imgEl.src = `/headshots/${student.headshot}`;
                        } else {
                            imgEl.src = `https://drive.google.com/thumbnail?id=${student.headshot}`;
                        }
                    } else {
                        imgEl.style.display = 'none';
                    }
                }
            })
            .catch(err => {
                console.error('Headshot fetch error:', err);
                imgEl.style.display = 'none';
            });

        // 2. Get Points (requires ID)
        let studentId = localStorage.getItem('studentId');

        // If no ID, try to resolve it from name
        if (!studentId && studentName) {
            console.log('[MobileNav] Resolving ID for points...');
            try {
                const resolveRes = await fetch(`/api/resolve-id/${encodeURIComponent(studentName)}`);
                const resolveData = await resolveRes.json();
                if (resolveData.success && resolveData.studentId) {
                    studentId = resolveData.studentId;
                    localStorage.setItem('studentId', studentId);
                }
            } catch (e) {
                console.error('[MobileNav] ID Resolution failed:', e);
            }
        }

        if (studentId) {
            // Fetch Official Summary
            const summaryRes = await fetch(`/api/student-summary/${encodeURIComponent(studentId)}`);
            const summaryData = await summaryRes.json();

            if (summaryData.success && summaryData.stats) {
                // UPDATE POINTS
                const pts = summaryData.stats.totalPoints || 0;
                if (pointsEl) pointsEl.textContent = pts;
            }
        } else {
            // Fallback: Use manual calculation
            const progressResp = await fetch(`/api/student-assignments/${encodeURIComponent(studentName)}`);
            const progressData = await progressResp.json();

            let totalPoints = 0;
            if (progressData.completedProjects) {
                totalPoints = progressData.completedProjects.reduce((sum, p) => sum + (parseInt(p.points) || 0), 0);
            }
            if (pointsEl) pointsEl.textContent = totalPoints;
        }

    } catch (err) {
        console.error('Error fetching navbar data:', err);
        if (pointsEl) pointsEl.textContent = '0';
        imgEl.style.display = 'none';
    }
}

function handleGlobalLogout() {
    // Info
    const wasInstructor = localStorage.getItem('instructorLoggedIn');

    // Clear All Session Data
    localStorage.removeItem('currentStudent');
    localStorage.removeItem('studentProgress');
    localStorage.removeItem('instructorLoggedIn');
    localStorage.removeItem('instructorName');

    // Redirect
    if (wasInstructor && window.location.pathname.includes('teacher.html')) {
        window.location.href = '/';
    } else {
        // Just refresh to update UI or redirect home
        window.location.href = '/';
    }
}

function handleGlobalLogin() {
    // If not on home page, go to home page to see login modal
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
        window.location.href = '/?login=true';
    } else {
        // If on home page, open modal
        // We assume toggleLoginModal exists on index.html
        if (typeof toggleLoginModal === 'function') {
            toggleLoginModal();
        } else {
            console.error('toggleLoginModal not found');
        }
    }
}

// Check for login query param on load (for redirection from other pages)
if (window.location.search.includes('login=true')) {
    document.addEventListener('DOMContentLoaded', () => {
        // Slight delay to ensure scripts are loaded
        setTimeout(() => {
            if (typeof toggleLoginModal === 'function') {
                toggleLoginModal();
                // Clean URL
                window.history.replaceState({}, document.title, "/");
            }
        }, 500);
    });
}

// ============================================================================
// SLEEP/SHUTDOWN DETECTION (Option 2)
// ============================================================================
// Runs a heartbeat check. If the browser execution pauses for > 1 minute,
// it assumes the computer slept or restarted, and logs the user out.

(function () {
    let lastTick = Date.now();
    const CHECK_INTERVAL = 5000;   // Check every 5 seconds
    const SLEEP_THRESHOLD = 60000; // If gap > 60s (plus interval), assume sleep

    // [ONLINE MODE FIX]
    // Disable sleep detector in online mode to prevent accidental logouts
    // when users switch tabs or minimize the browser.
    if (window.DEPLOYMENT_MODE === 'online') {
        console.log('[Sleep Detector] Disabled in Online Mode');
        return;
    }

    setInterval(() => {
        const now = Date.now();
        const diff = now - lastTick;

        // Normal difference should be around 5000ms.
        // If it's significantly larger (e.g. > 65s), the script was paused (Sleep).
        if (diff > (CHECK_INTERVAL + SLEEP_THRESHOLD)) {
            console.warn(`[Sleep Detector] Extended pause detected! Gap: ${Math.round(diff / 1000)}s. Logging out...`);

            // Only logout if someone is actually logged in
            if (localStorage.getItem('currentStudent') || localStorage.getItem('instructorLoggedIn')) {
                handleGlobalLogout();
            }
        }

        lastTick = now;
    }, CHECK_INTERVAL);

    console.log('[Sleep Detector] Active');
})();
