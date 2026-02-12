function toggleMenu() {
    document.querySelector('.navbar-menu').classList.toggle('active');
    document.querySelector('.navbar-auth').classList.toggle('active');
}
// INSTRUCTOR LOGIN LOGIC

async function openInstructorLogin() {
    // Close student modal
    document.getElementById('loginModal').classList.remove('active');

    // Open instructor modal
    const modal = document.getElementById('instructorLoginModal');
    modal.classList.add('active');

    // Load instructors
    const select = document.getElementById('instructorSelect');
    select.innerHTML = '<option value="">Loading names...</option>';

    try {
        const response = await fetch('/api/instructors-list');
        const data = await response.json();

        if (data.success) {
            select.innerHTML = '<option value="">Select your name...</option>';
            data.instructors.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">Error loading names</option>';
        }
    } catch (e) {
        console.error('Error fetching instructors', e);
        select.innerHTML = '<option value="">Connection error</option>';
    }
}

function closeInstructorLogin() {
    document.getElementById('instructorLoginModal').classList.remove('active');
    // Re-open student modal
    setTimeout(() => {
        document.getElementById('loginModal').classList.add('active');
    }, 100);
}

async function submitInstructorLogin() {
    const name = document.getElementById('instructorSelect').value;
    const passcode = document.getElementById('instructorPasscode').value;
    const errorDiv = document.getElementById('instructorLoginError');
    const btn = document.querySelector('#instructorLoginModal button[onclick="submitInstructorLogin()"]');

    if (!name || !passcode) {
        errorDiv.textContent = 'Please select a name and enter passcode';
        errorDiv.style.display = 'block';
        return;
    }

    errorDiv.style.display = 'none';
    btn.textContent = 'Verifying...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
        const response = await fetch('/api/instructor-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, passcode })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('instructorLoggedIn', 'true');
            localStorage.setItem('instructorName', name);
            window.location.href = '/teacher.html';
        } else {
            errorDiv.textContent = data.error || 'Incorrect name or passcode';
            errorDiv.style.display = 'block';
            btn.textContent = 'Login to Dashboard';
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    } catch (e) {
        errorDiv.textContent = 'Connection error. Check server.';
        errorDiv.style.display = 'block';
        btn.textContent = 'Login to Dashboard';
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}
// [CRITICAL] Global Deployment Mode
// Defined later at global scope or in DOMContentLoaded
// let DEPLOYMENT_MODE = 'offline'; // REMOVED to avoid redeclaration

// We still have the old fetchDeploymentMode for compatibility if legacy code calls it
async function fetchDeploymentMode() {
    return window.DEPLOYMENT_MODE || 'offline';
}

// Access control logic
function initializeAccess() {
    const loader = document.getElementById('initialLoader');
    const gate = document.getElementById('loginGate');
    const contentElements = document.querySelectorAll('.protected-content');

    // Use window.DEPLOYMENT_MODE to be safe
    const mode = window.DEPLOYMENT_MODE || 'offline';
    const isOnline = (mode === 'online');

    const student = localStorage.getItem('currentStudent');
    const instructor = localStorage.getItem('instructorLoggedIn');
    const isLoggedIn = !!(student || instructor);

    setTimeout(() => {
        console.log(`[ACCESS] isOnline=${isOnline}, isLoggedIn=${isLoggedIn}`);
        if (isOnline && !isLoggedIn) {
            // BLOCK: Show Gate, Hide Loader
            console.log('[Access Control] Online & Guest -> Gated');
            gate.style.display = 'block';
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        } else {
            // ALLOW: Reveal Content, Hide Loader
            console.log('[Access Control] Authorized/Offline -> Revealing Content');
            contentElements.forEach(el => el.style.display = ''); // Reset display to CSS default
            // Ensure some specfic elements like subtabs stay hidden if logic dictates, 
            // but 'protected-content' class removed display:none

            // We need to override the !important from CSS class
            // Best way: Remove the class or set inline style display: block (for block elements)

            contentElements.forEach(el => {
                el.classList.remove('protected-content');
                // Or simpler: el.style.display = 'block' / 'flex' depending on element
                // Removing the class is cleanest if CSS 'display:none' was attached to the class
            });

            gate.style.display = 'none';
            console.log('[ACCESS] Hiding Loader NOW');
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                console.log('[ACCESS] Loader display set to NONE');
            }, 500);
        }
    }, 300); // Short delay to ensure config loaded
}

// ========================================================================
// APPLICATION STATE VARIABLES
// ========================================================================

let allProjects = [];
let categories = {};
let topLevelCategories = [];
let categoryHierarchy = {};
let activeTopLevel = null;
let activeCategory = 'All';
let searchActive = false;

// Student-related variables (must be declared before functions that use them)
let allStudents = [];
let currentStudent = localStorage.getItem('currentStudent');
let studentProgress = null;

// Student File Browser variables
let allStudentFolders = [];
let allSidebarItems = []; // Stores current list for filtering
let sidebarMode = 'logout'; // 'logout' or 'login'
let selectedFile = {
    element: null,
    protocolUrl: null
};

// Fetch projects from API
async function loadProjects() {
    console.log('[loadProjects] Starting... Mode:', window.DEPLOYMENT_MODE);

    // PERFORMANCE: Check Cache First
    const CACHE_KEY = (window.DEPLOYMENT_MODE === 'online') ? 'cached_projects_online' : 'cached_projects_offline';
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) {
        try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                console.log('[Performance] Using cached projects data');

                // RESTORE STATE
                allProjects = data.allProjects;
                categories = data.categories;
                topLevelCategories = data.topLevelCategories || [];
                categoryHierarchy = data.categoryHierarchy || {};

                // If offline mode, we might need these
                if (data.serverRootPath) window.serverRootPath = data.serverRootPath;

                // INITIAL RENDER
                createTopLevelTabs();

                // Logic to restore view
                if (activeCategory && activeCategory !== 'All') {
                    showCategory(activeCategory);
                } else {
                    showTopLevel(activeTopLevel || 'All');
                }

                // Re-render assignments if needed
                if (studentProgress) {
                    renderAssignedProjects(
                        studentProgress.assignedProjects,
                        studentProgress.nextProjects,
                        studentProgress.completedProjects
                    );
                }

                // Background Refresh to keep cache fresh
                fetchProjectsFromNetwork(true);
                return;
            }
        } catch (e) {
            console.warn('[Performance] Cache parse error', e);
            localStorage.removeItem(CACHE_KEY);
        }
    }

    await fetchProjectsFromNetwork(false);
}

// [REF] Separated network logic
async function fetchProjectsFromNetwork(isBackground) {
    try {
        let newData = {};

        // In ONLINE mode, fetch from Google Sheets API
        if (window.DEPLOYMENT_MODE === 'online') {
            console.log('Loading projects from Google Sheets API...');
            const response = await fetch('/api/all-projects');
            const data = await response.json();

            if (!data.success) {
                showError(data.error || 'Failed to load projects');
                return;
            }

            // Also fetch project parts to get video counts
            let projectParts = {};
            try {
                const partsResp = await fetch('/api/project-parts');
                const partsData = await partsResp.json();
                if (partsData.success) {
                    projectParts = partsData.parts;
                }
            } catch (e) {
                console.warn('Could not fetch project parts for counts:', e);
            }

            // Transform Google Sheets data to match expected format
            allProjects = data.projects.map(p => {
                const projectCode = p.id.toUpperCase();
                const parts = projectParts[projectCode] || [];
                return {
                    id: p.id,
                    name: `${p.id} - ${p.name}`,
                    category: p.category || 'Uncategorized',
                    categoryArray: [p.category || 'Uncategorized'],
                    description: p.description || '',
                    videos: parts.map(part => part.youtubeUrl),
                    videoCount: parts.length,
                    icon: p.icon || null,  // Use icon from Column M
                    points: p.points || 0, // Points
                    pdf: null
                };
            });

            // Extract unique categories
            const categorySet = new Set(allProjects.map(p => p.category));
            topLevelCategories = Array.from(categorySet).filter(c => c);
            categories = {};
            categoryHierarchy = {};

            console.log(`Loaded ${allProjects.length} projects from Google Sheets.`);

            // PERFORMANCE: Save to Cache
            try {
                const CACHE_KEY = 'cached_projects_online';
                const cacheData = {
                    timestamp: Date.now(),
                    data: {
                        allProjects,
                        categories,
                        topLevelCategories,
                        categoryHierarchy
                    }
                };
                localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
                console.log('[Performance] Saved online projects to cache');
            } catch (e) {
                console.warn('[Performance] Failed to save cache', e);
            }

            createTopLevelTabs();
            showTopLevel('All');

            // [NEW] RACE CONDITION FIX: 
            // If student data (studentProgress) loaded BEFORE project list, the icons/IDs are missing.
            // Re-render assignments now that we have the project catalog "allProjects" to enrich them.
            if (studentProgress) {
                console.log('Project Catalog loaded after Student Progress. Re-rendering assignments to fix icons/IDs.');
                renderAssignedProjects(
                    studentProgress.assignedProjects,
                    studentProgress.nextProjects,
                    studentProgress.completedProjects
                );
            }

            return;
        }

        // OFFLINE mode: fetch from local folders
        const response = await fetch('/api/projects');
        const data = await response.json();

        if (data.error) {
            showError(data.error);
            return;
        }

        allProjects = data.projects;
        categories = data.categories;
        topLevelCategories = data.topLevelCategories || [];
        categoryHierarchy = data.categoryHierarchy || {};

        // Check if we have the new data structure
        if (!data.topLevelCategories) {
            showError('Server is running old code. Please wait for OneDrive to sync the latest files, then restart the server.');
            return;
        }

        createTopLevelTabs();
        showTopLevel('All');

        // PERFORMANCE: Save to Cache
        try {
            const CACHE_KEY = 'cached_projects_offline';
            const cacheData = {
                timestamp: Date.now(),
                data: {
                    allProjects,
                    categories,
                    topLevelCategories,
                    categoryHierarchy,
                    serverRootPath: window.serverRootPath
                }
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            console.log('[Performance] Saved offline projects to cache');
        } catch (e) {
            console.warn('[Performance] Failed to save cache', e);
        }

        // [NEW] RACE CONDITION FIX (Offline Mode):
        if (studentProgress) {
            console.log('Project Catalog loaded after Student Progress (Offline). Re-rendering assignments.');
            renderAssignedProjects(
                studentProgress.assignedProjects,
                studentProgress.nextProjects,
                studentProgress.completedProjects
            );
        }
    } catch (error) {
        showError('Failed to load projects: ' + error.message);
    }
}
// Create top-level category tabs (PYTHON, SCRATCH)
function createTopLevelTabs() {
    const tabsContainer = document.getElementById('tabsContainer');

    let tabsHTML = '<div class="tab active" data-category="All" onclick="showTopLevel(\'All\')">All Projects</div>';

    if (topLevelCategories && Array.isArray(topLevelCategories)) {
        topLevelCategories.forEach(topCategory => {
            tabsHTML += `<div class="tab" data-category="${topCategory}" onclick="showTopLevel('${topCategory}')">${topCategory}</div>`;
        });
    }

    tabsContainer.innerHTML = tabsHTML;
}

// Show top-level category and its subcategories
function showTopLevel(topCategory) {
    if (searchActive) {
        document.getElementById('searchBox').value = '';
        searchActive = false;
        document.getElementById('searchNotice').style.display = 'none';
    }

    activeTopLevel = topCategory;
    const subTabsContainer = document.getElementById('subTabsContainer');

    // Update active tab
    const tabs = document.querySelectorAll('#tabsContainer .tab');
    tabs.forEach(tab => {
        if (tab.dataset.category === topCategory) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    if (topCategory === 'All') {
        // Hide subcategory tabs and show all projects
        subTabsContainer.style.display = 'none';
        displayProjects(allProjects, 'All Projects');
    } else {
        // Show subcategory tabs for this top-level category
        const subcategories = (categoryHierarchy && categoryHierarchy[topCategory]) ? categoryHierarchy[topCategory] : [];

        if (subcategories && subcategories.length > 0) {
            subTabsContainer.style.display = 'flex';
            let subTabsHTML = '';
            subcategories.forEach(subCat => {
                const fullPath = `${topCategory} > ${subCat}`;
                subTabsHTML += `<div class="tab" data-category="${fullPath.replace(/"/g, '&quot;')}" onclick="showCategory('${fullPath.replace(/'/g, "\'")}')">${subCat}</div>`;
            });
            subTabsContainer.innerHTML = subTabsHTML;

            // Auto-select first subcategory
            if (subcategories.length > 0) {
                const firstPath = `${topCategory} > ${subcategories[0]}`;
                showCategory(firstPath);
            }
        } else {
            subTabsContainer.style.display = 'none';
            // Show all projects for this top-level category
            const projectsInCategory = allProjects.filter(p =>
                p.categoryArray && p.categoryArray.length > 0 && p.categoryArray[0] === topCategory
            );
            displayProjects(projectsInCategory, topCategory);
        }
    }
}

// Show projects for a specific subcategory
function showCategory(category) {
    activeCategory = category;

    // Update active subcategory tab
    const subTabs = document.querySelectorAll('#subTabsContainer .tab');
    subTabs.forEach(tab => {
        if (tab.dataset.category === category) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Display projects for this category
    const projectsToShow = categories[category] || [];
    const displayName = category.split(' > ')[1] || category;
    displayProjects(projectsToShow, displayName);
}

// Refresh the current view (used by filter checkbox)
function refreshCurrentView() {
    if (activeCategory && activeCategory !== 'All') {
        showCategory(activeCategory);
    } else {
        showTopLevel(activeTopLevel || 'All');
    }
}

// Function to update visibility of the filter checkbox
function updateFilterVisibility() {
    const filterControls = document.getElementById('filterControls');
    const myProjectsLink = document.getElementById('navMyProjects');

    if (filterControls) {
        filterControls.style.display = currentStudent ? 'flex' : 'none';
    }

    if (myProjectsLink) {
        myProjectsLink.style.display = currentStudent ? 'block' : 'none';
        // Add mobile toggle behavior here if needed, or rely on mobile.css
    }
}

// Helper function to check if project is completed
function isProjectCompleted(projectName) {
    if (!studentProgress || !studentProgress.completedProjects) {
        return false;
    }
    // Normalize both names for comparison (case-insensitive, trim whitespace)
    const normalizedProjectName = projectName.toLowerCase().trim();
    return studentProgress.completedProjects.some(completed =>
        completed.name && completed.name.toLowerCase().trim().includes(normalizedProjectName)
    );
}

// Helper function to check if project is in progress
function isProjectInProgress(projectName) {
    if (!studentProgress || !studentProgress.inProgressProjects) {
        return false;
    }
    const normalizedProjectName = projectName.toLowerCase().trim();
    return studentProgress.inProgressProjects.some(inProgress =>
        inProgress.name && inProgress.name.toLowerCase().trim().includes(normalizedProjectName)
    );
}

// Helper: Convert icon value to displayable URL
// Handles: full URLs, Google Drive file IDs, local filenames
function getIconUrl(icon, projectId) {
    if (!icon) return null;

    // If it starts with http, it's a direct URL
    if (icon.startsWith('http')) {
        // Check if it's a Google Drive link that needs conversion
        if (icon.includes('drive.google.com/file/d/')) {
            // Extract file ID from drive.google.com/file/d/FILE_ID/view
            const match = icon.match(/\/file\/d\/([^\/]+)/);
            if (match) {
                return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
            }
        }
        return icon;
    }

    // If it looks like a Google Drive file ID (long alphanumeric string)
    // Google Drive IDs are typically 33+ characters with letters, numbers, hyphens, underscores
    if (/^[a-zA-Z0-9_-]{20,}$/.test(icon)) {
        return `https://drive.google.com/thumbnail?id=${icon}&sz=w400`;
    }

    // Otherwise, treat as local filename
    // Fix: Split ID by '/' and encode each segment to preserve directory structure
    // Encoded slashes (%2F) are treated as part of the filename by express.static, not directory separators
    const safePath = projectId.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/projects/${safePath}/${encodeURIComponent(icon)}`;
}

// Show message when clicking a locked project
function showLockedMessage() {
    // Create toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #F59E0B, #D97706);
                    color: white;
                    padding: 15px 30px;
                    border-radius: 30px;
                    font-weight: bold;
                    font-size: 1.1em;
                    box-shadow: 0 8px 25px rgba(217, 119, 6, 0.4);
                    z-index: 10000;
                    animation: slideDown 0.3s ease-out;
                `;
    toast.innerHTML = '🔒 This project is locked. Complete your assigned projects first!';
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeUp 0.3s ease-out forwards';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// Display projects
function displayProjects(projects, categoryTitle = 'All Projects') {
    const content = document.getElementById('content');

    // [NEW] Check filter state
    const hideCompletedCheckbox = document.getElementById('hideCompletedFilter');
    const shouldHideCompleted = currentStudent && studentProgress && (hideCompletedCheckbox ? hideCompletedCheckbox.checked : true);

    // Filter projects if needed
    let projectsToRender = projects;

    // If student is logged in, we separate completed/available logic needs to be respected
    // Previously, offline mode forced 'availableProjects' (no completed). 
    // Now we let the checkbox decide.

    let completedProjects = [];
    let availableProjects = [];

    if (currentStudent && studentProgress) {
        projects.forEach(project => {
            // ROBUST MATCHING: ID match preferred, then normalized name match
            const isCompleted = isProjectCompleted(project.name) ||
                (studentProgress.completedProjects && studentProgress.completedProjects.some(cp => cp.id === project.id));

            if (isCompleted) {
                completedProjects.push(project);
            } else {
                availableProjects.push(project);
            }
        });

        // APPLY FILTER
        // If "Hide Completed" is checked, remove them from the main view
        if (shouldHideCompleted) {
            // Filter out projects that are in the completed list
            // Use a Set of IDs for O(1) lookups
            const completedIds = new Set(completedProjects.map(p => p.id));
            projectsToRender = projectsToRender.filter(p => !completedIds.has(p.id));
        }
    }

    // APPLY FILTER: If hide checked, exclude completed projects
    if (shouldHideCompleted) {
        projectsToRender = projectsToRender.filter(p => !isProjectCompleted(p.name));
    }

    if (projectsToRender.length === 0) {
        content.innerHTML = '<div class="no-results">No projects match your filter</div>';
        return;
    }

    const html = `
                <div class="category-header">
                    <h2>${searchActive ? 'Search Results' : categoryTitle}</h2>
                </div>

                <div class="projects-container">
                    ${(projectsToRender).map(project => {
        const inProgress = currentStudent && studentProgress && isProjectInProgress(project.name);
        const isCompleted = currentStudent && studentProgress && isProjectCompleted(project.name);

        // Find demo video
        // Priority 1: Explicit server-identified demoVideo (Offline Mode)
        // Priority 2: Scan videos array for 'demo' (Online/Legacy Mode)
        let demoUrl = '';
        if (project.demoVideo) {
            // Use encodeURIComponent for each segment separately to be safe with path issues
            const safeId = project.id.split('/').map(s => encodeURIComponent(s)).join('/');
            demoUrl = `/projects/${safeId}/${encodeURIComponent(project.demoVideo)}`;
        } else if (project.videos) {
            const demoVid = project.videos.find(v => v.toLowerCase().includes('demo'));
            if (demoVid) {
                // Online URLs are just strings, Offline paths need construction
                if (demoVid.startsWith('http')) {
                    demoUrl = demoVid; // It's a YouTube link or similar (unlikely for "demo" name check, but possible)
                } else {
                    const safeId = project.id.split('/').map(s => encodeURIComponent(s)).join('/');
                    demoUrl = `/projects/${safeId}/${encodeURIComponent(demoVid)}`;
                }
            }
        }

        // Determine badge based on status
        let badgeHTML = '';
        if (isCompleted) {
            badgeHTML = '<div class="completion-badge">✓ COMPLETED</div>';
        } else if (inProgress) {
            badgeHTML = '<div class="in-progress-badge">⏳ IN PROGRESS</div>';
        }


        // Check if user has access to all projects
        // Enabled: Projects are locked if not completed or in progress, unless override exists
        const hasAccess = localStorage.getItem('allProjectAccess') === 'yes';

        // [UPDATED] User Request: Disable locking in Offline Mode
        const isOffline = (window.DEPLOYMENT_MODE !== 'online');
        const isLocked = !isOffline && currentStudent && !hasAccess && !isCompleted && !inProgress;

        // Lock overlay HTML
        const lockOverlayHTML = isLocked ? `<div class="lock-overlay">🔒</div>` : '';

        return `
                                <div class="project-card ${isCompleted ? 'completed-project' : (inProgress ? 'in-progress-project' : '')} ${isLocked ? 'locked-project' : ''}" 
                                     onclick="${isLocked ? 'showLockedMessage()' : `openProject('${project.id}')`}"
                                     data-demo-url="${demoUrl}"
                                     onmouseenter="playDemoVideo(this)"
                                     onmouseleave="stopDemoVideo(this)">
                                    ${badgeHTML}
                                    ${lockOverlayHTML}
                                    <div class="project-icon">
                                        ${project.icon
                ? `<img src="${getIconUrl(project.icon, project.id)}" alt="${project.name}" onerror="this.parentNode.innerHTML='🎮'">`
                : '🎮'
            }
                                    </div>
                                    <div class="project-info">
                                        <div class="project-name">${project.name}</div>
                                        ${project.category ? `<div class="project-category">${project.category}</div>` : ''}
                                        <div class="project-meta">
                                            <span class="video-count" style="color: #D97706;">💎 ${project.points || 0} Points</span>
                                        </div>
                                    </div>
                                </div>
                            `;
    }).join('')}
                    </div>
            `;

    content.innerHTML = html;
}

// Show error message
function showError(message) {
    const content = document.getElementById('content');
    content.innerHTML = `<div class="error">${message}</div>`;
}

// Toggle collapsible section
function toggleCollapsible(header) {
    header.classList.toggle('collapsed');
    const content = header.nextElementSibling;
    content.classList.toggle('collapsed');
}

// Render multiple project sections
function renderAssignedProjects(assigned, next, completed, projectsToTry) {
    console.log('renderAssignedProjects called with:', { assigned: assigned?.length, next: next?.length, completed: completed?.length, projectsToTry: projectsToTry?.length });

    const container = document.getElementById('assignedProjectsContainer');

    // Helper to enrich project with icon and other data from allProjects
    function enrichProject(project) {
        if (!project) return project;

        let fullProject = null;
        const projectCode = project.id || project.originalCode || '';

        // 1. Try exact ID match
        if (projectCode) {
            fullProject = allProjects.find(p => p.id && p.id.toUpperCase() === projectCode.toUpperCase());
        }

        // 2. If not found, try matching by Name (fuzzy)
        // The student log might have "Fox Game" but catalog has "MBOT001 - Fox Game"
        if (!fullProject && project.name) {
            const searchName = project.name.toLowerCase().trim();
            fullProject = allProjects.find(p => p.name.toLowerCase().includes(searchName));
        }

        if (fullProject) {
            return {
                ...project,
                id: fullProject.id, // CRITICAL: Use the canonical ID from catalog
                name: fullProject.name, // Use canonical name
                icon: fullProject.icon || project.icon,
                videoCount: fullProject.videoCount || project.videoCount || 0,
                points: fullProject.points || project.points || 0,
                category: fullProject.category || project.category
            };
        }
        return project;
    }

    // Enrich all project arrays with icon data
    assigned = (assigned || []).map(enrichProject);
    next = (next || []).map(enrichProject);
    completed = (completed || []).map(enrichProject);
    projectsToTry = (projectsToTry || []).map(enrichProject);

    // If nothing at all
    if ((!assigned || assigned.length === 0) && (!next || next.length === 0) && (!completed || completed.length === 0)) {
        // Check if we really have no content or just invalid data
        console.log('Hiding assigned projects - no projects found in any category');
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Helper to create a section
    function createSection(title, projects, icon, badgeClass, badgeText, headerColor = 'white', isCollapsible = false, gridClass = '', cardClass = '') {
        if (!projects || projects.length === 0) return '';

        const projectsHTML = projects.map(project => {
            const demoVideo = project.videos && project.videos.find(v => v.toLowerCase().includes('demo'));
            const demoUrl = demoVideo ? '/projects/' + encodeURIComponent(project.id) + '/' + encodeURIComponent(demoVideo) : '';

            const iconHTML = project.icon
                ? `<img src="${getIconUrl(project.icon, project.id)}" alt="${project.name}" loading="lazy" onerror="this.parentNode.innerHTML='🎮'">`
                : '🎮';

            const clickHandler = project.notFound ? '' : `onclick="openProject('${project.id}')"`;
            const notFoundStyle = project.notFound ? 'style="opacity: 0.6; cursor: not-allowed;"' : '';

            return `
                        <div class="assigned-project-card ${cardClass}" ${clickHandler} ${notFoundStyle}>
                            <div class="${badgeClass}">${badgeText}</div>
                            <div class="project-icon">${iconHTML}</div>
                            <div class="project-info">
                                <div class="project-name">${project.name}</div>
                                ${project.notFound ? '<div class="project-category" style="color: #F59E0B;">⚠️ Project folder not found</div>' :
                    (project.category ? `<div class="project-category">${project.category}</div>` : '')}
                                <div class="project-meta">
                                    <span class="video-count" style="color: #D97706;">💎 ${project.points || 0} Points</span>
                                    ${project.pdf ? '<span class="pdf-badge">PDF</span>' : ''}
                                </div>
                            </div>
                        </div>
                        `;
        }).join('');

        // Collapsible Logic
        const collapseId = 'section-' + title.replace(/\s+/g, '-').toLowerCase();
        const arrowStyle = isCollapsible ? 'transition: transform 0.3s ease; display: inline-block;' : 'display: none;';
        const containerStyle = isCollapsible ? 'display: none;' : 'display: grid;'; // Default to collapsed if collapsible

        return `
                        <div style="margin-bottom: 30px;">
                            <div class="assigned-header" 
                                 style="justify-content: flex-start; gap:10px; cursor: ${isCollapsible ? 'pointer' : 'default'};"
                                 onclick="${isCollapsible ? `toggleSection('${collapseId}')` : ''}">
                                <span class="assigned-icon">${icon}</span>
                                <h2 style="color:${headerColor}; flex: 1;">${title} (${projects.length})</h2>
                                ${isCollapsible ? `<span id="arrow-${collapseId}" style="${arrowStyle} transform: rotate(-90deg); font-size: 1.5em; color: ${headerColor};">▼</span>` : ''}
                            </div>
                            <div id="${collapseId}" class="assigned-projects-container ${gridClass}" style="${containerStyle}">
                                ${projectsHTML}
                            </div>
                        </div>
                    `;
    }

    // If nothing at all
    if ((!assigned || assigned.length === 0) && (!next || next.length === 0) && (!completed || completed.length === 0)) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    let html = '<div class="assigned-projects-section glass-mode">';

    // 1. Assigned (Primary)
    if (assigned && assigned.length > 0) {
        html += createSection('Assigned Projects', assigned, '🎯', 'assigned-badge', '🎯 ASSIGNED', 'white', false, '', 'hero-card');
    }

    // 2. Next Projects
    if (next && next.length > 0) {
        html += createSection('Next Projects', next, '🔮', 'assigned-badge', '🔮 NEXT PROJECT', '#c084fc');
    }

    // 2b. Projects To Try (Online Only)
    if (window.DEPLOYMENT_MODE === 'online' && projectsToTry && projectsToTry.length > 0) {
        html += createSection('Projects To Try', projectsToTry, '✨', 'assigned-badge', '✨ TRY THIS', '#FCD34D', true, '', '');
    }

    // 3. Completed
    if (completed && completed.length > 0) {
        html += createSection('Completed Projects', completed, '✅', 'completion-badge', '✓ COMPLETED', '#4ade80', true, 'compact-grid', 'compact');
    }

    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';
}

// [NEW] Toggle Section Function
function toggleSection(id) {
    const container = document.getElementById(id);
    const arrow = document.getElementById('arrow-' + id);

    if (container.style.display === 'none') {
        container.style.display = 'grid'; // Expand
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
        container.style.display = 'none'; // Collapse
        if (arrow) arrow.style.transform = 'rotate(-90deg)';
    }
}

// Render search results in dropdown
function renderSearchDropdown(projects) {
    const dropdown = document.getElementById('searchDropdown');

    if (projects.length === 0) {
        dropdown.innerHTML = '<div class="search-no-results">No projects found</div>';
        dropdown.classList.add('active');
        return;
    }

    const resultsHTML = projects.map(project => {
        const iconHTML = project.icon
            ? `<img src="/projects/${encodeURIComponent(project.id)}/${encodeURIComponent(project.icon)}" alt="${project.name}" loading="lazy">`
            : '🎮';

        const pdfCount = project.pdf ? 1 : 0;

        return `
                    <div class="search-result-item" data-project-id="${project.id}">
                        <div class="search-result-icon">${iconHTML}</div>
                        <div class="search-result-details">
                            <div class="search-result-id">${project.id}</div>
                            <div style="display: flex; gap: 15px; margin-top: 5px; font-size: 0.85em; color: #6B7280;">
                                <span>📂 ${project.category}</span>
                                ${canShowVideos() ? `<span>🎬 ${project.videoCount} video${project.videoCount !== 1 ? 's' : ''}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
    }).join('');

    dropdown.innerHTML = resultsHTML;
    dropdown.classList.add('active');

    // Add click handlers to each result
    dropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const projectId = item.dataset.projectId;
            openProject(projectId);
        });
    });
}

// Hide search dropdown
function hideSearchDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
}

// Search functionality
document.getElementById('searchBox').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    if (searchTerm === '') {
        hideSearchDropdown();
        searchActive = false;
        document.getElementById('searchNotice').style.display = 'none';
        document.getElementById('subTabsContainer').style.display = activeTopLevel && activeTopLevel !== 'All' ? 'flex' : 'none';
        if (activeCategory && activeCategory !== 'All') {
            showCategory(activeCategory);
        } else {
            showTopLevel(activeTopLevel || 'All');
        }
        return;
    }

    const filtered = allProjects.filter(project =>
        project.name.toLowerCase().includes(searchTerm) ||
        project.category.toLowerCase().includes(searchTerm) ||
        project.id.toLowerCase().includes(searchTerm)
    );

    renderSearchDropdown(filtered);
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const searchContainer = document.querySelector('.search-container');
    const searchBox = document.getElementById('searchBox');

    if (!searchContainer.contains(e.target)) {
        hideSearchDropdown();
    }
});

// Open project
function openProject(projectId) {
    window.location.href = `/project.html?id=${encodeURIComponent(projectId)}`;
}

// Load projects on page load
loadProjects();

// Load student progress if already logged in
if (currentStudent) {
    updateFilterVisibility();
    loadStudentProgress(currentStudent);
}

// Update connection count
async function updateConnectionCount() {
    try {
        const response = await fetch('/api/connections');
        const data = await response.json();
        const btn = document.getElementById('connectionBtn');
        if (btn && data.stats) {
            const count = btn.querySelector('.connection-count');
            if (count) {
                count.textContent = data.stats.activeConnections;
            }
        }
    } catch (error) {
        // Silently fail
    }
}

// Update every 5 seconds
setInterval(updateConnectionCount, 5000);
updateConnectionCount();

// Feature Flags
const ENABLE_LEADERBOARD = true;

// Helper to get formatted date
function getFormattedDate() {
    return new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Legacy fetchDeploymentMode (stub)
async function fetchDeploymentMode() {
    return window.DEPLOYMENT_MODE || 'offline';
}

// Login functionality
// Load student names on page load from local database (or cache)
async function loadStudents() {
    try {
        // FIX: Use /api/student-names which calls the updated Google Sheets Service directly (with IDs)
        // instead of /api/students which reads a potentially stale/incorrect students.json
        const response = await fetch('/api/student-names');
        const data = await response.json();

        if (data.error) {
            console.error('Error loading students:', data.error);
            return;
        }

        // The API returns { names: [...] } containing objects with id, name, headshot, etc.
        allStudents = data.names;
        renderStudentList(allStudents);
    } catch (error) {
        console.error('Failed to load students:', error);
    }
}

// Load student's progress (completed and in-progress projects)
async function loadStudentProgress(studentName) {
    if (!studentName) {
        studentProgress = null;
        renderAssignedProjects([]);
        return;
    }

    try {
        // In ONLINE mode, prioritize Google Sheets API (has projectsToTry calculation)
        // In OFFLINE mode, try local cache first
        let response, data;

        if (window.DEPLOYMENT_MODE === 'online') {
            console.log('Online mode: Fetching from Google Sheets API...');
            response = await fetch(`/api/google-sheets/student-projects/${encodeURIComponent(studentName)}`);
            data = await response.json();
        } else {
            // Try local cache first (works offline)
            console.log('Trying to load student progress from local cache...');
            response = await fetch(`/api/student-assignments/${encodeURIComponent(studentName)}`);
            data = await response.json();

            // If cache doesn't exist or needs sync, fall back to Google Sheets
            if (data.needsSync || (!data.success && response.status === 404)) {
                console.log('Local cache not found, falling back to Google Sheets...');
                response = await fetch(`/api/google-sheets/student-projects/${encodeURIComponent(studentName)}`);
                data = await response.json();
            }
        }

        if (!data.success) {
            console.warn('Google Sheets also failed. Student progress unavailable.');
            console.warn('Please sync students from the Teacher Panel when online.');
        }

        if (data.success && data.data) {
            studentProgress = data.data;
            const source = data.fromCache ? 'local cache (offline)' : 'Google Sheets (online)';
            console.log(`Loaded progress for ${studentName} from ${source}:`, studentProgress);

            // SELF-HEAL: If we have a fileLink, save it to localStorage to ensure "Open My Folder" works
            if (studentProgress.fileLink) {
                console.log('Caching File Link:', studentProgress.fileLink);
                localStorage.setItem('currentStudentFileLink', studentProgress.fileLink);
            } else {
                // Only remove if we are in online mode and expected it? 
                // Better safe: don't remove if missing unless we are sure. 
                // Actually, if it's missing from fresh data, we should probably remove stale data.
                // But let's assume if it's not there, we just don't update it to avoid breaking offline cache.
            }

            // 3 DISTINCT LISTS + Projects To Try
            renderAssignedProjects(
                studentProgress.assignedProjects || [],
                studentProgress.nextProjects || [],
                studentProgress.completedProjects || [],
                studentProgress.projectsToTry || []
            );

            // Refresh the current display to show completion status
            if (allProjects.length > 0) {
                // Re-render the current view
                const activeTab = document.querySelector('.tab.active');
                if (activeTab && activeTab.textContent === 'All') {
                    displayProjects(allProjects, 'All Projects');
                } else {
                    // Trigger a re-display of current category/search
                    const currentCategory = activeTab ? activeTab.getAttribute('onclick') : null;
                    if (currentCategory) {
                        eval(currentCategory);
                    }
                }
            }
        } else {
            console.error('Failed to load student progress:', data.error || data.message);
            studentProgress = null;
            renderAssignedProjects([]);
        }
    } catch (error) {
        console.error('Error fetching student progress:', error);
        studentProgress = null;
        renderAssignedProjects([]);
    }
}

// Render student list
function renderStudentList(students) {
    const studentList = document.getElementById('studentList');

    if (students.length === 0) {
        studentList.innerHTML = '<div style="text-align: center; color: #9CA3AF; padding: 20px;">No students found</div>';
        return;
    }

    // Support both old array of strings and new array of objects
    studentList.innerHTML = students.map(student => {
        const name = typeof student === 'object' ? student.name : student;
        const headshot = (typeof student === 'object' && student.headshot) ? student.headshot : null;
        const fileLink = (typeof student === 'object' && student.fileLink) ? student.fileLink : '';
        const allProjectAccess = (typeof student === 'object' && student.allProjectAccess) ? 'true' : 'false';
        const studentId = (typeof student === 'object' && student.id) ? student.id : ''; // Get Student ID

        let headshotUrl = headshot;
        if (headshotUrl) {
            if (headshotUrl.includes('Child Names_Images/')) {
                headshotUrl = headshotUrl.replace('Child Names_Images/', 'headshots/');
            } else if (!headshotUrl.startsWith('headshots/') && !headshotUrl.startsWith('/headshots/') && !headshotUrl.startsWith('http')) {
                // If it's just a filename, assume it's in headshots/
                headshotUrl = 'headshots/' + headshotUrl;
            }
        }

        // FIX: Use &quot; for inner attributes to avoid breaking the onerror="..." double-quoted attribute
        const fallback = `this.onerror=null; this.outerHTML='<div class=&quot;student-initial&quot; style=&quot;background:#3B82F6&quot;>${name.charAt(0)}</div>'`;

        const headshotHtml = headshotUrl
            ? `<img src="${headshotUrl}" alt="${name}" class="student-headshot" loading="lazy" onerror="${fallback}">`
            : `<div class="student-initial">${name.charAt(0)}</div>`;

        return `
                    <div class="student-item" onclick="selectStudent('${name.replace(/'/g, "\\'")}', '${fileLink.replace(/'/g, "\\'")}', ${allProjectAccess}, '${studentId}')">
                        ${headshotHtml}
                        <span class="student-name">${name}</span>
                    </div>
                `}).join('');
}

// Search students (Unified Logic)
// Search students (Unified Logic)
document.getElementById('studentSearch').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const listSection = document.getElementById('studentList');

    // Always show list section
    if (listSection) listSection.style.display = 'block';

    if (searchTerm === '') {
        // EMPTY SEARCH -> SHOW ALL STUDENTS
        renderStudentList(allStudents);
    } else {
        // ACTIVE SEARCH -> FILTER LIST
        const filtered = allStudents.filter(student => {
            const name = typeof student === 'object' ? student.name : student;
            return name.toLowerCase().includes(searchTerm);
        });
        renderStudentList(filtered);
    }
});

// Select a student
async function selectStudent(studentName, fileLink = null, allProjectAccess = false, studentId = null) {
    console.log('[Login Debug] selectStudent called with:', {
        studentName,
        fileLink,
        allProjectAccess,
        studentId,
        typeOfId: typeof studentId
    });

    // Alert if ID is missing for debugging (temporary)
    if (!studentId) {
        console.error('[Login Debug] CRITICAL: Student ID is missing or null!');
    }

    currentStudent = studentName;
    currentStudentId = studentId; // Store global ID if needed

    // [NEW] MARK ATTENDANCE
    if (studentId) {
        console.log(`[ATTENDANCE] Marking attendance for ID: ${studentId}`);
        try {
            // Await valid fetch to ensure it sends before reload
            // Use a promise race to timeout after 2 seconds so we don't block login forever
            const markAttendance = fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: studentId })
            }).then(res => res.json());

            const timeout = new Promise(resolve => setTimeout(resolve, 2000));

            const result = await Promise.race([markAttendance, timeout]);
            console.log('[ATTENDANCE] Result:', result);
        } catch (err) {
            console.error('[ATTENDANCE ERROR]', err);
        }
    } else {
        console.warn('[ATTENDANCE] No Student ID provided for attendance marking.');
    }
    localStorage.setItem('currentStudent', studentName);

    // NEW: Store Student ID
    if (studentId) {
        console.log('[Login Debug] Saving studentId:', studentId);
        localStorage.setItem('studentId', studentId);
    } else {
        console.warn('[Login Debug] No studentId provided! Clearing storage.');
        localStorage.removeItem('studentId');
    }

    // Save file link if provided
    if (fileLink) {
        localStorage.setItem('currentStudentFileLink', fileLink);
    } else {
        localStorage.removeItem('currentStudentFileLink');
    }

    // Save all project access permission
    localStorage.setItem('allProjectAccess', allProjectAccess ? 'yes' : 'no');

    // [NEW] In ONLINE mode, reload to clear the Login Gate
    // Check global DEPLOYMENT_MODE variable
    if (typeof DEPLOYMENT_MODE !== 'undefined' && DEPLOYMENT_MODE === 'online') {
        console.log('[Login] Online Mode -> Reloading to unlock gate...');
        window.location.reload();
        return;
    }

    updateLoginButton();

    // Trigger Global Auth UI Update (from mobile-nav.js)
    if (typeof updateAuthUI === 'function') {
        updateAuthUI();
    }

    // Hide modal
    document.getElementById('loginModal').classList.remove('active');

    // Load student's progress
    loadStudentProgress(studentName);

    // Fetch files for sidebar
    fetchStudentFiles(studentName);

    // Update filter UI
    updateFilterVisibility();

    // Refresh project display to show/hide locks
    if (allProjects.length > 0) {
        displayProjects(allProjects, 'All Projects');
    }
}

// Mobile Online Files Button Styles
const mobileBtnStyles = document.createElement('style');
mobileBtnStyles.innerHTML = `
                .mobile-files-fab {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 50px;
                    height: 50px;
                    background: linear-gradient(135deg, #009FF5 0%, #0070c0 100%);
                    color: white;
                    border-radius: 50%;
                    box-shadow: 0 4px 15px rgba(0, 159, 245, 0.4);
                    z-index: 9999;
                    cursor: pointer;
                    display: none; /* Hidden by default */
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5em;
                    backdrop-filter: blur(5px);
                    border: 1px solid rgba(255,255,255,0.2);
                    transition: transform 0.2s, box-shadow 0.2s;
                    text-decoration: none;
                }
                .mobile-files-fab:active {
                    transform: scale(0.9);
                }
                .mobile-files-fab:hover {
                    box-shadow: 0 6px 20px rgba(0, 159, 245, 0.6);
                    transform: scale(1.05);
                }
                
                /* Only show on mobile */
                @media (min-width: 769px) {
                    .mobile-files-fab {
                        display: none !important;
                    }
                }
            `;
document.head.appendChild(mobileBtnStyles);

// Create and append the button
const mobileFab = document.createElement('a');
mobileFab.id = 'mobile-online-files-btn';
mobileFab.className = 'mobile-files-fab';
mobileFab.innerHTML = '☁️';
mobileFab.title = 'Open My Files';
mobileFab.onclick = function (e) {
    e.preventDefault();
    openCurrentStudentFolder();
};
document.body.appendChild(mobileFab);

// Update Sidebar State (Login vs Logout)
function updateSidebarState() {
    const title = document.getElementById('sidebar-title');
    const searchContainer = document.getElementById('sidebar-search-container');
    const actionsContainer = document.getElementById('sidebar-actions');
    const list = document.getElementById('sidebar-list');
    const mobileBtn = document.getElementById('mobile-online-files-btn');

    if (currentStudent) {
        // LOGGED IN STATE
        sidebarMode = 'login';
        title.textContent = 'My Files';
        searchContainer.style.display = 'none';

        if (window.DEPLOYMENT_MODE === 'online') {
            // ONLINE MODE: Custom Compact Design
            actionsContainer.style.display = 'none';
            renderOnlineSidebar();

            // Show mobile button if on mobile (handled by CSS media query, but we enable display here)
            if (mobileBtn) mobileBtn.style.display = 'flex';
        } else {
            // OFFLINE MODE: Standard Design
            actionsContainer.style.display = 'block';
            fetchStudentFiles(currentStudent);
            if (mobileBtn) mobileBtn.style.display = 'none';
        }
    } else {
        // LOGGED OUT STATE
        sidebarMode = 'logout';
        title.textContent = 'Student Folders';
        searchContainer.style.display = 'block';
        actionsContainer.style.display = 'none';
        loadAllFolders();
        if (mobileBtn) mobileBtn.style.display = 'none';
    }
}



// New Online Sidebar Renderer
function renderOnlineSidebar() {
    const list = document.getElementById('sidebar-list');
    const sidebar = document.getElementById('student-folder-sidebar');

    // Inject overrides for the sidebar container itself
    // We use a style block inside the list to ensure it hits providing scoping isn't an issue, 
    // or we can just set styles directly on the element.
    // Setting direct styles is safer for a specific instance override.
    if (sidebar) {
        sidebar.style.setProperty('background-color', 'transparent', 'important');
        sidebar.style.setProperty('border', 'none', 'important');
        sidebar.style.setProperty('box-shadow', 'none', 'important');
    }

    // Update title color to be visible on dark background (since sidebar is now transparent)
    const title = document.getElementById('sidebar-title');
    if (title) {
        title.style.setProperty('color', 'white', 'important');
        title.style.setProperty('border-bottom', '1px solid rgba(255,255,255,0.1)', 'important');
    }

    list.innerHTML = `
                    <div class="online-file-card">
                        <div class="online-cloud-icon">☁️</div>
                        <div class="online-card-title">Cloud Storage</div>
                        <div class="online-card-desc">Your project files are stored securely on OneDrive.</div>
                        <button onclick="openCurrentStudentFolder()" class="online-open-btn">
                            <span>Open OneDrive Folder</span>
                            <span>↗</span>
                        </button>

                        <button onclick="openOneDriveTutorial()" class="online-open-btn" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); margin-top: 10px;">
                            <span>❓ How does this work?</span>
                        </button>
                    </div>
                `;
}

// Load all student folders (Logged Out)
async function loadAllFolders() {
    const list = document.getElementById('sidebar-list');
    list.innerHTML = '<li style="padding:10px; color:#9CA3AF;">Loading folders...</li>';

    try {
        const response = await fetch('/api/student-folders');
        const data = await response.json();

        if (data.success) {
            allStudentFolders = data.folders;
            // Capture root path
            if (data.rootPath) {
                window.serverRootPath = data.rootPath;
            }
            renderSidebarList(allStudentFolders, 'folder');
        } else {
            list.innerHTML = `<li style="padding:10px; color:#EF4444;">${data.error || 'Failed to load folders'}</li>`;
        }
    } catch (error) {
        console.error('Error loading folders:', error);
        list.innerHTML = `<li style="padding:10px; color:#EF4444;">Connection error</li>`;
    }
}

// Fetch student files (Logged In)
async function fetchStudentFiles(studentName) {
    const list = document.getElementById('sidebar-list');

    // If we have a Google Drive Link, we skip local fetching and just show a message
    const fileLink = localStorage.getItem('currentStudentFileLink');
    if (fileLink) {
        list.innerHTML = `
                        <li style="padding:15px; color:#60A5FA; text-align:center;">
                            <div style="font-size: 2em; margin-bottom: 10px;">☁️</div>
                            <div>Files available on Google Drive</div>
                            <div style="font-size: 0.8em; color: #9CA3AF; margin-top:5px;">Click "Open My Folder" above</div>
                        </li>
                     `;
        return;
    }

    // In ONLINE mode, skip local folder fetch - files are on Google Drive
    if (window.DEPLOYMENT_MODE === 'online') {
        list.innerHTML = `
                        <li style="padding:15px; color:#60A5FA; text-align:center;">
                            <div style="font-size: 2em; margin-bottom: 10px;">☁️</div>
                            <div>Files available on Google Drive</div>
                            <div style="font-size: 0.8em; color: #9CA3AF; margin-top:5px;">Click above or copy path and open in another tab to open the OneDrive Folder</div>
                        </li>
                     `;
        return;
    }

    list.innerHTML = '<li style="padding:10px; color:#9CA3AF;">Loading files...</li>';

    try {
        const url = `/api/student-folders/${encodeURIComponent(studentName)}/files`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            // Keep track of resolved folder name for the "Open My Folder" button
            window.currentStudentFolder = data.resolvedFolderName || studentName;
            renderSidebarList(data.files, 'file');
        } else {
            list.innerHTML = `<li style="padding:10px; color:#EF4444;">${data.error || 'Failed to load folders'}</li>`;
        }
    } catch (err) {
        console.error('Error fetching files:', err);
        list.innerHTML = `<li style="padding:10px; color:#EF4444;">${err.message}</li>`;
    }
}

// Generic Render Function for Sidebar List
function renderSidebarList(items, type) {
    const list = document.getElementById('sidebar-list');
    list.innerHTML = '';
    allSidebarItems = items; // Store for filtering

    if (!items || items.length === 0) {
        list.innerHTML = '<li style="padding:10px; color:#9CA3AF;">No items found</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'sidebar-list-item';

        const div = document.createElement('div');
        div.className = 'sidebar-list-item-content';

        if (type === 'folder') {
            // FOLDER ITEM
            div.innerHTML = `
                            <span class="sidebar-item-icon">📁</span>
                            <div style="flex-grow: 1;">
                                <div style="color: #E5E7EB;">${item.name}</div>
                                <span class="file-metadata">${item.fileCount || 0} files</span>
                            </div>
                        `;
            li.onclick = () => openFolder(item.name);
        } else {
            // FILE ITEM
            let icon = '📄';
            if (item.type === 'image') icon = '🖼️';
            if (item.type === 'video') icon = '🎥';
            if (item.type === 'pdf') icon = '📑';
            if (item.type === 'scratch') icon = '🐱';
            if (item.type === 'python') icon = '🐍';

            const date = new Date(item.modified);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            div.innerHTML = `
                            <span class="sidebar-item-icon">${icon}</span>
                            <div style="flex-grow: 1;">
                                <div style="color: #E5E7EB;">${item.name}</div>
                                <span class="file-metadata">Modified: ${dateStr}</span>
                            </div>
                        `;

            // Click to open file
            if (item.protocolUrl) {
                li.onclick = () => {
                    // Inject current hostname into the URL so the client script knows which server to connect to
                    // item.protocolUrl is like "studentfile://Student Name/File.ext"
                    // We want "studentfile://HOSTNAME/Student Name/File.ext"

                    const serverName = window.location.hostname;
                    const path = item.protocolUrl.replace('studentfile://', '');
                    const newUrl = `studentfile://${serverName}/${path}`;

                    console.log('Opening file:', newUrl);
                    window.open(newUrl, '_self');
                };
            }
        }

        li.appendChild(div);
        list.appendChild(li);
    });
}

// Sidebar Search Filter
let searchTimeout;
document.getElementById('sidebar-folder-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();

    // [ANALYTICS] Track Search (Debounced)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (term.length > 2) {
            window.trackSearch(term);
        }
    }, 1000);

    const filtered = allSidebarItems.filter(item => item.name.toLowerCase().includes(term));

    // Re-render using local data (simple client-side filter)
    // We determine type based on sidebarMode
    const type = sidebarMode === 'login' ? 'file' : 'folder';

    // Manually re-render to avoid fetching again
    const list = document.getElementById('sidebar-list');
    list.innerHTML = '';

    if (filtered.length === 0) {
        list.innerHTML = '<li style="padding:10px; color:#9CA3AF;">No matches found</li>';
        return;
    }

    // ... reusing render logic is redundant, let's just call renderSidebarList but NOT update allSidebarItems
    // Actually, renderSidebarList updates allSidebarItems, so we need a separate internal render or just pass a flag
    // For simplicity, let's just duplicate the loop here or refactor. 
    // Better: Refactor renderSidebarList to accept a "updateCache" flag? 
    // Or just manually loop here since it's small.

    // Let's call renderSidebarList but save/restore allSidebarItems
    const savedItems = allSidebarItems;
    renderSidebarList(filtered, type);
    allSidebarItems = savedItems; // Restore full list
});

// "Open My Folder" Button Action
function openCurrentStudentFolder() {
    // Check if we have a direct file link (Online Mode)
    const fileLink = localStorage.getItem('currentStudentFileLink');

    if (fileLink) {
        window.open(fileLink, '_blank');
        return;
    }

    const folderName = window.currentStudentFolder || currentStudent;
    if (folderName) {
        openFolder(folderName);

        // Show path if we have the root path
        if (window.serverRootPath) {
            const fullPath = window.serverRootPath + '/' + folderName; // Simple concatenation, adjust for OS separator if needed but '/' usually works for display
            const pathContainer = document.getElementById('folder-path-container');
            const pathInput = document.getElementById('folder-path-input');

            // Fix for Windows paths if needed, but display usually is fine
            // We'll replace forward slashes with backslashes if it looks like Windows
            let displayPath = fullPath;
            if (window.serverRootPath.includes('\\')) {
                displayPath = fullPath.replace(/\//g, '\\');
            }

            pathInput.value = displayPath;
            pathContainer.style.display = 'block';
        }
    } else {
        alert('No student folder identified.');
    }
}

// Copy Path Function
function copyFolderPath() {
    const copyText = document.getElementById("folder-path-input");
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(copyText.value).then(() => {
        // Visual feedback
        const btn = document.querySelector('.copy-btn');
        const origText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        setTimeout(() => {
            btn.innerHTML = origText;
        }, 2000);
    });
}

// ============================================================================
// AUTO-LOGOUT & SESSION ENFORCEMENT
// ============================================================================

// 1. FRESH START CHECK (Logout if server restarted)
async function checkServerSession() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();

        if (data.serverStartTime) {
            const storedSession = localStorage.getItem('serverSession');
            const currentSession = String(data.serverStartTime);

            if (!storedSession) {
                // First time connecting this browser ever (or after clear)
                localStorage.setItem('serverSession', currentSession);
            } else if (storedSession !== currentSession) {
                // Server has restarted since last login!
                console.log('[SESSION] Server restart detected. Forcing logout.');
                localStorage.setItem('serverSession', currentSession);

                // If user was logged in, force logout
                if (localStorage.getItem('studentName')) {
                    doAutoLogout();
                }
            }
        }
    } catch (e) {
        console.error("Session check failed", e);
    }
}

// 2. INACTIVITY TIMER
// Handling moved to inactivity.js for global coverage

// Listen for any activity
// Handled in inactivity.js

// Initialize timer on load
checkServerSession(); // Check session on load

// ============================================================================


// Open folder on client (Protocol Handler)
function openFolder(folderName) {
    const serverName = window.location.hostname;
    // [WINDOWS FIX] Windows explorer doesn't decode %20 automatically in UNC paths from simple handlers.
    // We keep spaces literal (browsers usually handle this for custom protocols or at least pass it along)
    // We also strictly encode other special chars, but spaces are the main issue.
    let safeFolder = encodeURIComponent(folderName).replace(/%20/g, ' ');
    const protocolUrl = `studentfolder://${serverName}/${safeFolder}`;
    console.log(`Launching Folder: ${protocolUrl}`);

    // Visual Feedback
    const statusDiv = document.createElement('div');
    Object.assign(statusDiv.style, {
        position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
        background: '#3B82F6', color: 'white', padding: '10px 20px', borderRadius: '20px',
        zIndex: '10000', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    });
    statusDiv.textContent = `📂 Opening ${folderName}...`;
    document.body.appendChild(statusDiv);
    setTimeout(() => document.body.removeChild(statusDiv), 2000);

    try {
        window.open(protocolUrl, '_self');
    } catch (e) {
        console.error('Failed to open protocol URL:', e);
    }
}

// Logout
function logout() {
    currentStudent = null;
    studentProgress = null;
    localStorage.removeItem('currentStudent');
    updateLoginButton();

    renderAssignedProjects([]);
    updateFilterVisibility();

    // Refresh display to remove completion indicators
    if (allProjects.length > 0) {
        displayProjects(allProjects, 'All Projects');
    }
}

// Open teacher panel with password
function openTeacherPanel() {
    const password = prompt('Enter teacher password:');
    if (password === 'learntobot') {
        window.location.href = '/teacher.html';
    } else if (password !== null) {
        alert('Incorrect password');
    }
}

// ========================================================================
// ONLINE MODE LOGIN LOGIC (Parent Email Check)
// ========================================================================

let isBlockingModal = false;

// Check configuration on load to determine mode
async function checkOnlineMode() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();

        if (config.isOnline) {
            console.log('Online Mode detected. Checking login status...');
            const student = localStorage.getItem('currentStudent');

            // If no student is logged in, DO NOT force the blocking modal automatically
            // based on user feedback to allow "Continue without logging in" flow.
            // if (!student) {
            //     forceBlockingLogin();
            // }
        }
    } catch (e) {
        console.error('Failed to check online config:', e);
    }
}

// Trigger the blocking modal
function forceBlockingLogin() {
    isBlockingModal = true;
    const modal = document.getElementById('loginModal');

    // Show modal
    modal.classList.add('active');

    // Switch to Online View
    document.getElementById('classLoginView').style.display = 'none';
    document.getElementById('allStudentsView').style.display = 'none';
    document.getElementById('onlineParentView').style.display = 'block';

    // HIDE ESCAPE ROUTES
    // Hide Close Button
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) closeBtn.style.display = 'none';

    // Hide "Continue without logging in"
    const skipBtn = document.getElementById('skipLoginBtn');
    if (skipBtn) skipBtn.style.display = 'none';

    // Disable clicking outside to close
    modal.removeAttribute('onclick');
}

// Skip login handler
function skipLogin() {
    logout(); // Logs out student
    // Log out instructor
    localStorage.removeItem('instructorLoggedIn');
    localStorage.removeItem('instructorName');

    // Close modal
    toggleLoginModal();

    // If in blocking mode, we need to re-enable interactions
    if (isBlockingModal) {
        isBlockingModal = false;
        const modal = document.getElementById('loginModal');
        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) closeBtn.style.display = 'block';
        modal.setAttribute('onclick', 'if(event.target === this) toggleLoginModal()');
    }
}

// Function call for parent email check
async function checkParentEmail() {
    const emailInput = document.getElementById('parentEmailInput');
    const email = emailInput.value.trim();
    const btn = document.getElementById('findKidsBtn');
    const errorDiv = document.getElementById('parentEmailError'); // CORRECTED ID

    if (!email) {
        errorDiv.textContent = 'Please enter an email address.';
        errorDiv.style.display = 'block';
        return;
    }

    // UI Loading State
    btn.textContent = 'Checking...';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    errorDiv.style.display = 'none';

    try {
        const response = await fetch('/api/check-parent-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();
        console.log('[DEBUG] Parent Check Response:', data);

        if (data.success) {
            // Success! Show children
            renderFoundChildren(data.children);
        } else {
            // Failed
            console.warn('[DEBUG] Parent Check Failed:', data.message);
            errorDiv.textContent = data.message || 'No account found for this email.';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking email:', error);
        errorDiv.textContent = 'Server error: ' + error.message;
        errorDiv.style.display = 'block';
    } finally {
        btn.textContent = 'Find My Kids';
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

function renderFoundChildren(children) {
    const buttonsContainer = document.getElementById('foundChildrenList'); // CORRECTED ID

    buttonsContainer.innerHTML = ''; // Clear previous

    children.forEach(child => {
        const btn = document.createElement('div');
        // Style looking like a student card
        btn.style.cssText = `
                        background: #1F2937;
                        border: 1px solid #374151;
                        padding: 15px;
                        border-radius: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        transition: all 0.2s;
                    `;
        btn.onmouseover = () => { btn.style.background = '#374151'; btn.style.borderColor = '#3B82F6'; };
        btn.onmouseout = () => { btn.style.background = '#1F2937'; btn.style.borderColor = '#374151'; };

        btn.innerHTML = `
                        <div style="width: 40px; height: 40px; background: #3B82F6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2em; color: white !important;">
                            ${child.name.charAt(0)}
                        </div>
                        <div>
                            <div style="font-weight: bold; font-size: 1.1em; color: white !important;">${child.name}</div>
                            <div style="color: #9CA3AF; font-size: 0.9em;">Parent: ${child.parentName}</div>
                        </div>
                    `;

        btn.onclick = () => {
            // Login Logic
            console.log('[Login Debug] Clicking child button:', child);
            // Pass the fileLink if available
            selectStudent(child.name, child.fileLink, false, child.id);

            // We might want to unlock screen first
            isBlockingModal = false;
        };

        buttonsContainer.appendChild(btn);
    });

    // Switch to selection view
    document.getElementById('parentEmailStep').style.display = 'none';
    document.getElementById('parentChildSelectStep').style.display = 'block';
}

function resetParentLogin() {
    document.getElementById('parentEmailStep').style.display = 'block';
    document.getElementById('parentChildSelectStep').style.display = 'none';
    document.getElementById('parentEmailInput').value = '';
    document.getElementById('parentEmailError').style.display = 'none';
}

// Init Check
checkOnlineMode();


// Toggle login modal
function toggleLoginModal() {
    if (isBlockingModal) return;

    const modal = document.getElementById('loginModal');
    const isOpen = modal.classList.contains('active');

    if (isOpen) {
        modal.classList.remove('active');
        if (window.DEPLOYMENT_MODE === 'online') {
            // Reset online view
            document.getElementById('onlineParentView').style.display = 'block';
            document.getElementById('classLoginView').style.display = 'none';
            document.getElementById('parentEmailStep').style.display = 'block';
            document.getElementById('parentChildSelectStep').style.display = 'none';
            document.getElementById('parentEmailInput').value = '';
        } else {
            // NORMAL OFFLINE RESET
            // Reset Search
            const search = document.getElementById('studentSearch');
            const listSection = document.getElementById('studentList');

            if (search) search.value = '';
            // Keep list view clean
            if (listSection) listSection.style.display = 'none';
        }
    } else {
        modal.classList.add('active');
        if (window.DEPLOYMENT_MODE === 'online') {
            // ONLINE VIEW
            document.getElementById('onlineParentView').style.display = 'block';
            document.getElementById('classLoginView').style.display = 'none';

            const skipBtn = document.getElementById('skipLoginBtn');
            if (skipBtn) skipBtn.style.display = 'none';

            setTimeout(() => document.getElementById('parentEmailInput')?.focus(), 100);
        } else {
            // OFFLINE VIEW
            document.getElementById('onlineParentView').style.display = 'none';
            document.getElementById('classLoginView').style.display = 'block';

            const skipBtn = document.getElementById('skipLoginBtn');
            if (skipBtn) skipBtn.style.display = 'block';

            loadStudents(); // Load for search

            // Show student list by default
            const listSection = document.getElementById('studentList');
            if (listSection) listSection.style.display = 'block';

            // FOCUS SEARCH BAR IMMEDIATELY
            setTimeout(() => {
                const search = document.getElementById('studentSearch');
                if (search) search.focus();
            }, 100);
        }
    }
}

// NO-OP or Minimal Reset (Kept to prevent breaking existing calls)
function toggleLoginView(view) {
    // We barely use this now, but if called, just ensure search is reset if 'class'
    if (view === 'class') {
        const search = document.getElementById('studentSearch');
        if (search) {
            search.value = '';
            search.dispatchEvent(new Event('input')); // Trigger reset logic
        }
    }
}

// Load Today's Classes into Modal
// Formerly loadClassView - Removed per user request


// Helper to generate consistent pleasant colors from names
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// Update login button and User Profile Display
async function updateLoginButton() {
    // Update navbar elements
    const navbarUser = document.getElementById('navbarUser'); // Legacy
    const userProfilePill = document.getElementById('userProfilePill');
    const userPointsDisplay = document.getElementById('userPointsDisplay');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userHeadshotDisplay = document.getElementById('userHeadshotDisplay');

    const navbarLoginBtn = document.getElementById('navbarLoginBtn');
    const navbarLogoutBtn = document.getElementById('navbarLogoutBtn');
    const navMyProjects = document.getElementById('navMyProjects');

    if (currentStudent) {
        // LOGGED IN STATE

        // 1. Show Pill, Hide Login Btn
        if (userProfilePill) userProfilePill.style.display = 'flex';
        if (navbarUser) navbarUser.style.display = 'none'; // Hide legacy
        navbarLoginBtn.style.display = 'none';
        navbarLogoutBtn.style.display = 'inline-block';
        if (navMyProjects) {
            // Show ONLY if not an instructor
            const isInstructor = localStorage.getItem('instructorLoggedIn') === 'true';
            navMyProjects.style.display = isInstructor ? 'none' : 'block';
        }

        // 2. Set Name immediately
        if (userNameDisplay) userNameDisplay.textContent = currentStudent;

        // 3. Fetch Full Profile (Points & Headshot)
        try {
            const response = await fetch('/api/leaderboard');
            const data = await response.json();

            if (data.success && data.leaderboard) {
                const student = data.leaderboard.find(s => s.name === currentStudent);

                if (student) {
                    // Update Points
                    if (userPointsDisplay) {
                        userPointsDisplay.textContent = (student.totalPoints || 0).toLocaleString();
                    }

                    // Update Headshot
                    if (userHeadshotDisplay) {
                        let headshotUrl = student.headshot;

                        // Fix URL if needed (copied from other parts of app)
                        if (headshotUrl) {
                            if (headshotUrl.includes('Child Names_Images/')) {
                                headshotUrl = headshotUrl.replace('Child Names_Images/', 'headshots/');
                            } else if (!headshotUrl.startsWith('headshots/') && !headshotUrl.startsWith('/headshots/') && !headshotUrl.startsWith('http')) {
                                headshotUrl = 'headshots/' + headshotUrl;
                            }

                            userHeadshotDisplay.src = headshotUrl;
                            userHeadshotDisplay.style.display = 'block';
                        } else {
                            // No headshot? Use UI Avatars or hide
                            // userHeadshotDisplay.style.display = 'none';
                            userHeadshotDisplay.src = `https://ui-avatars.com/api/?background=3B82F6&color=fff&name=${encodeURIComponent(currentStudent)}`;
                            userHeadshotDisplay.style.display = 'block';
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch user profile for navbar:', e);
        }

    } else {
        // LOGGED OUT STATE
        if (userProfilePill) userProfilePill.style.display = 'none';
        if (navbarUser) navbarUser.style.display = 'none';
        navbarLoginBtn.style.display = 'inline-block';
        navbarLogoutBtn.style.display = 'none';
        if (navMyProjects) navMyProjects.style.display = 'none';
    }

    // Update Sidebar
    updateSidebarState();

    // Update Page Title
    updatePageTitle();
}

// Update Page Title based on login state
function updatePageTitle() {
    const title = document.querySelector('.header h1');
    if (title) {
        if (currentStudent) {
            title.textContent = `👋 Welcome ${currentStudent}`;
        } else {
            title.textContent = '🤖 LearnToBot Class';
        }
    }
}



// Initialize login state on page load
updateLoginButton();
// WebSocket connection for remote control
const socket = io();

socket.on('connect', () => {
    console.log('Connected to server via WebSocket');

    // Send student name if logged in
    if (currentStudent) {
        // [BACKUP] Send ID for attendance marking
        const storedId = localStorage.getItem('studentId') || currentStudentId;
        socket.emit('student-login', {
            studentName: currentStudent,
            studentId: storedId
        });
    }

    // Notify server of current page
    socket.emit('page-change', { page: 'Projects Home' });
});

// [NEW] Helper to check video permissions
function canShowVideos() {
    // If offline, always allow
    if (window.DEPLOYMENT_MODE !== 'online') return true;
    // If online, only allow if logged in
    const student = localStorage.getItem('currentStudent');
    const instructor = localStorage.getItem('instructorLoggedIn');
    return !!(student || instructor);
}

// Demo Video Hover Logic
function playDemoVideo(card) {
    // SECURITY CHECK: Only play if allowed
    if (!canShowVideos()) return;

    const demoUrl = card.getAttribute('data-demo-url');
    if (!demoUrl) return;

    const iconContainer = card.querySelector('.project-icon');
    if (!iconContainer) return;

    // Check if video already exists
    if (iconContainer.querySelector('video')) return;

    const video = document.createElement('video');
    video.src = demoUrl;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.position = 'absolute';
    video.style.top = '0';
    video.style.left = '0';
    video.style.borderRadius = '15px 15px 0 0'; // Match card top radius

    // Keep original image visible until video plays to avoid black flash
    video.oncanplay = () => {
        video.style.zIndex = '5';
    };

    iconContainer.appendChild(video);
}

function stopDemoVideo(card) {
    const iconContainer = card.querySelector('.project-icon');
    if (!iconContainer) return;

    const video = iconContainer.querySelector('video');
    if (video) {
        video.remove();
    }
}

// Listen for navigation commands from teacher
socket.on('navigate', (data) => {
    console.log('Navigation command received:', data.url);
    window.location.href = data.url;
});

// Update server when student logs in
const originalSelectStudent = selectStudent;
selectStudent = function (studentName) {
    originalSelectStudent(studentName);
    socket.emit('student-login', { studentName: studentName });
};
document.addEventListener('DOMContentLoaded', function () {
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
        const now = new Date();
        lastUpdatedElement.textContent = now.toLocaleString();
    }
});
document.addEventListener('DOMContentLoaded', async function () {
    // [SAFETY] Force-hide loader after 6 seconds to prevent infinite hanging
    setTimeout(() => {
        const loader = document.getElementById('initialLoader');
        if (loader && loader.style.display !== 'none' && loader.style.opacity !== '0') {
            console.warn('[Loader Safety] Force-hiding stuck loader');
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 6000);

    // First: Fetch deployment mode from server
    try {
        const confResp = await fetch('/api/config');
        const confData = await confResp.json();

        // Set Global Mode
        window.DEPLOYMENT_MODE = confData.mode || 'offline';
        // Also set the variable used by other scripts if it exists globally
        if (typeof DEPLOYMENT_MODE !== 'undefined') {
            DEPLOYMENT_MODE = window.DEPLOYMENT_MODE;
        } else {
            window.DEPLOYMENT_MODE = window.DEPLOYMENT_MODE;
        }

        // [AUTO-LOGOUT] Check if server restarted
        const storedStartTime = localStorage.getItem('serverStartTime');
        const currentStartTime = confData.serverStartTime ? confData.serverStartTime.toString() : null;

        if (currentStartTime && storedStartTime && currentStartTime !== storedStartTime) {
            console.warn('[SESSION] Server restart detected. Logging out all users.');
            // Clear session
            localStorage.removeItem('currentStudent');
            localStorage.removeItem('instructorLoggedIn');
            localStorage.removeItem('instructorName');
            localStorage.setItem('serverStartTime', currentStartTime);

            // Reload to enforce logout
            window.location.reload();
            return;
        }

        // Store current start time if not set
        if (currentStartTime) {
            localStorage.setItem('serverStartTime', currentStartTime);
        }

        console.log(`[LTB] Initialized in ${window.DEPLOYMENT_MODE} mode`);

        // LOGIN FLOW CONFIGURATION
        const modal = document.getElementById('loginModal');
        const classView = document.getElementById('classLoginView');
        const onlineView = document.getElementById('onlineParentView');
        const instructorLink = document.getElementById('instructorLoginContainer');

        // 1. ALWAYS HIDE INSTRUCTOR LINK ON HOMEPAGE
        if (instructorLink) instructorLink.style.display = 'none';

        if (window.DEPLOYMENT_MODE === 'online') {
            // ONLINE MODE: Default to Parent Email Login
            if (classView) classView.style.display = 'none';
            if (onlineView) onlineView.style.display = 'block';
        } else {
            // OFFLINE MODE: Default to Class/Student Picker
            if (classView) classView.style.display = 'block';
            if (onlineView) onlineView.style.display = 'none';
        }

        // [CRITICAL] Initialize Access Gating
        // This determines if we show the "Login" gate or the content
        initializeAccess();

    } catch (e) {
        console.error('Failed to fetch config for initialization:', e);
        // Fallback to offline
        window.DEPLOYMENT_MODE = 'offline';
        initializeAccess();
    }

    // Note: removed redundant await fetchDeploymentMode(); call

    // Initialize Staging Environment
    console.log('Staging environment initialized');

    // MOBILE DETECTION: Force Instructor Login - DISABLED PER USER REQUEST
    // const isMobile = window.innerWidth <= 768; 

    // Ensure login modal is active ONLY if not logged in
    const modal = document.getElementById('loginModal');
    const currentStudent = localStorage.getItem('currentStudent');

    // if (isMobile) {
    //     // FORCE INSTRUCTOR LOGIN ON MOBILE
    //     console.log('Mobile device detected - Opening Instructor Login');
    //     if (modal) modal.classList.remove('active'); // Ensure student modal is closed
    //     openInstructorLogin(); // Defined earlier in file
    // }
    // else 

    if (modal && !currentStudent) {
        if (window.DEPLOYMENT_MODE === 'online') {
            // ONLINE MODE: Do NOT auto-open login modal
            // User must click "Login" manually
            console.log('Online Mode: Suppressing auto-login modal');
        } else {
            // OFFLINE MODE: Open Student Login automatically
            modal.classList.add('active');
            loadStudents(); // Load student list

            // Focus search box
            setTimeout(() => {
                const search = document.getElementById('studentSearch');
                if (search) search.focus();
            }, 500);
        }
    } else if (currentStudent) {
        // If already logged in, just load students in background
        loadStudents();
    }

    // Load projects
    loadProjects();

    // Start connection monitor
    updateConnectionCount();
    setInterval(updateConnectionCount, 5000);

    // Initial sidebar state
    updateSidebarState();
});
document.addEventListener('DOMContentLoaded', () => {
    fetchMarqueeData();
});

async function fetchMarqueeData() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();

        if (data.success && data.leaderboard.length > 0) {
            renderMarquee(data.leaderboard);
        }
    } catch (error) {
        console.error('Failed to load marquee:', error);
    }
}

function renderMarquee(students) {
    const container = document.getElementById('marqueeContent');
    const wrapper = document.getElementById('leaderboardMarquee');

    // Filter valid points and Shuffle
    const validStudents = students.filter(s => (s.totalPoints || 0) > 0);
    if (validStudents.length === 0) return;

    // Fisher-Yates Shuffle
    for (let i = validStudents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validStudents[i], validStudents[j]] = [validStudents[j], validStudents[i]];
    }

    // Take top 30 random students to keep DOM light
    const displayList = validStudents.slice(0, 30);

    // Generate HTML
    const itemsHtml = displayList.map(student => {
        const points = student.totalPoints || 0;
        // Name cleaning
        let cleanName = student.name.split('@')[0];
        cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

        // Headshot logic
        const safeId = student.id ? student.id.toString().replace(/\//g, '_') : '';
        const headshotSrc = safeId ? `/headshots/${safeId}.jpg` : student.headshot;
        const fallback = `this.onerror=null; this.src='https://ui-avatars.com/api/?background=random&name=${encodeURIComponent(cleanName)}'`;

        return `
                <div class="marquee-item" onclick="window.location.href='/leaderboard.html'">
                    <img src="${headshotSrc}" class="marquee-avatar" onerror="${fallback}">
                    <div class="marquee-info">
                        <span class="marquee-name">${cleanName}</span>
                        <span class="marquee-points">${points.toLocaleString()} PTS</span>
                    </div>
                </div>`;
    }).join('');

    // Duplicate content 10 times to ensure smooth infinite scroll
    container.innerHTML = itemsHtml.repeat(10);
    wrapper.style.display = 'block';
}
function toggleHowToUseModal() {
    const modal = document.getElementById('howToUseModal');
    const gif = document.getElementById('howToUseGif');

    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
        // Lazy load the GIF only when opening
        if (gif && !gif.src.endsWith('.gif')) {
            gif.src = gif.getAttribute('data-src');
        }
    }
}
