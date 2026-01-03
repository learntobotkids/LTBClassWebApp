
document.addEventListener('DOMContentLoaded', () => {
    const navbarContainer = document.querySelector('.navbar-container');
    const navbarMenu = document.querySelector('.navbar-menu');

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

    // Run auth check
    updateAuthUI();
});

// GLOBAL AUTH UI HANDLER
function updateAuthUI() {
    // Check if we are on the instructor dashboard (it handles its own auth usually, but we might want to unify)
    if (window.location.pathname.includes('instructor-dashboard.html')) return;

    const navbarAuth = document.querySelector('.navbar-auth');
    if (!navbarAuth) return; // Should not happen if HTML is correct

    const student = localStorage.getItem('currentStudent');
    const instructor = localStorage.getItem('instructorLoggedIn');

    // Clear existing content to rebuild
    navbarAuth.innerHTML = '';

    if (student || instructor) {
        // LOGGED IN STATE

        // 1. User Badge
        const userSpan = document.createElement('span');
        userSpan.className = 'navbar-user';
        userSpan.style.display = 'inline-block';
        userSpan.style.marginRight = '10px';
        userSpan.style.color = '#E5E7EB';
        userSpan.style.fontWeight = '600';

        if (instructor) {
            userSpan.textContent = `👨‍🏫 ${localStorage.getItem('instructorName') || 'Instructor'}`;
        } else {
            userSpan.textContent = `👤 ${student}`;
        }
        navbarAuth.appendChild(userSpan);

        // 2. Logout Button
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'navbar-btn logout';
        logoutBtn.textContent = 'Logout';
        logoutBtn.style.backgroundColor = '#EF4444'; // Red for logout
        logoutBtn.onclick = handleGlobalLogout;
        navbarAuth.appendChild(logoutBtn);

    } else {
        // LOGGED OUT STATE
        const loginBtn = document.createElement('button');
        loginBtn.className = 'navbar-btn';
        loginBtn.id = 'navbarLoginBtn';
        loginBtn.textContent = 'Login';
        loginBtn.onclick = handleGlobalLogin;
        navbarAuth.appendChild(loginBtn);
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
    if (wasInstructor && window.location.pathname.includes('instructor-dashboard')) {
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
