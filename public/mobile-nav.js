
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
});
