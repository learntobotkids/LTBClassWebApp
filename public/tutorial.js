
// OneDrive Tutorial Modal Component
// Dynamically injects HTML/CSS to avoid index.html bloat and encoding issues

const tutorialModalHTML = `
<div id="onedriveTutorialModal" class="tutorial-modal-overlay" style="display: none;">
    <div class="tutorial-modal">
        
        <!-- Header -->
        <div class="tut-header">
            <h2><span style="font-size: 1.5em;">☁️</span> How to Access Project Files</h2>
            <button onclick="closeOneDriveTutorial()" class="tut-close-btn">&times;</button>
        </div>

        <!-- Content Area -->
        <div class="tut-content">
            
            <!-- Step 1 -->
            <div id="tutorial-step-1" class="tutorial-step" style="display: block;">
                <div class="tut-img-container">
                    <img src="instructions-howtos-onedrive/Step 1.png" alt="Step 1">
                </div>
                <h3>Step 1: Click "Open OneDrive Folder"</h3>
                <p>Click the blue button in the sidebar to open the class OneDrive folder in a new tab.</p>
            </div>

            <!-- Step 2 -->
            <div id="tutorial-step-2" class="tutorial-step" style="display: none;">
                <div class="tut-img-container">
                    <img src="instructions-howtos-onedrive/Step 2.png" alt="Step 2">
                </div>
                <h3>Step 2: Find Your Folder</h3>
                <p>In the OneDrive window, scroll down to find the folder with your child's name.</p>
            </div>

            <!-- Step 3 -->
            <div id="tutorial-step-3" class="tutorial-step" style="display: none;">
                <div class="tut-img-container">
                    <img src="instructions-howtos-onedrive/Step 3.png" alt="Step 3">
                </div>
                <h3>Step 3: Download Your File</h3>
                <p>Open your folder, select the project file you need, and click "Download".</p>
            </div>

        </div>

        <!-- Footer -->
        <div class="tut-footer">
            <button id="tut-prev-btn" onclick="prevTutorialStep()" class="tut-nav-btn secondary" style="visibility: hidden;">
                &larr; Previous
            </button>

            <div class="step-indicators">
                <div id="dot-1" class="tut-dot active"></div>
                <div id="dot-2" class="tut-dot"></div>
                <div id="dot-3" class="tut-dot"></div>
            </div>

            <button id="tut-next-btn" onclick="nextTutorialStep()" class="tut-nav-btn primary">
                Next &rarr;
            </button>
        </div>

    </div>
</div>

<style>
    .tutorial-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.85);
        z-index: 99999; /* Super high z-index */
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(5px);
    }

    .tutorial-modal {
        max-width: 800px;
        width: 90%;
        background: #1F2937;
        border-radius: 20px;
        border: 1px solid #374151;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: tutFadeIn 0.3s ease-out;
    }

    @keyframes tutFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }

    .tut-header {
        padding: 20px;
        border-bottom: 1px solid #374151;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #111827;
    }

    .tut-header h2 {
        margin: 0;
        color: #E5E7EB;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .tut-close-btn {
        background: transparent;
        border: none;
        color: #9CA3AF;
        font-size: 2em;
        cursor: pointer;
        line-height: 1;
        padding: 0 10px;
    }

    .tut-close-btn:hover {
        color: white;
    }

    .tut-content {
        padding: 30px;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        min-height: 400px; /* Prevent layout shift */
    }

    .tut-img-container {
        background: #000;
        padding: 10px;
        border-radius: 10px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        display: flex;
        justify-content: center;
    }

    .tut-img-container img {
        max-width: 100%;
        max-height: 350px;
        border-radius: 5px;
        object-fit: contain;
    }

    .tut-content h3 {
        color: #60A5FA;
        margin-bottom: 10px;
        font-size: 1.5em;
    }

    .tut-content p {
        color: #D1D5DB;
        font-size: 1.1em;
        max-width: 600px;
        line-height: 1.5;
    }

    .tut-footer {
        padding: 20px;
        border-top: 1px solid #374151;
        background: #111827;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .tut-nav-btn {
        padding: 10px 25px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.2s;
        border: none;
        font-size: 1em;
    }

    .tut-nav-btn.primary {
        background: #3B82F6;
        color: white;
    }
    .tut-nav-btn.primary:hover {
        background: #2563EB;
        transform: translateY(-1px);
    }

    .tut-nav-btn.secondary {
        background: transparent;
        border: 1px solid #4B5563;
        color: #9CA3AF;
    }
    .tut-nav-btn.secondary:hover {
        border-color: #6B7280;
        color: #E5E7EB;
    }

    .step-indicators {
        display: flex;
        gap: 10px;
    }

    .tut-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #4B5563;
        transition: background 0.3s;
    }
    .tut-dot.active {
        background: #3B82F6;
    }

    /* Mobile Hide */
    @media (max-width: 768px) {
        #onedriveTutorialModal { display: none !important; }
    }
</style>
`;

// State
let currentTutorialStep = 1;
const totalTutorialSteps = 3;

// Inject Functions
window.openOneDriveTutorial = function () {
    // Inject HTML if not exists
    if (!document.getElementById('onedriveTutorialModal')) {
        document.body.insertAdjacentHTML('beforeend', tutorialModalHTML);
    }

    currentTutorialStep = 1;
    updateTutorialUI();
    document.getElementById('onedriveTutorialModal').style.display = 'flex';
};

window.closeOneDriveTutorial = function () {
    const modal = document.getElementById('onedriveTutorialModal');
    if (modal) modal.style.display = 'none';
};

window.nextTutorialStep = function () {
    if (currentTutorialStep < totalTutorialSteps) {
        currentTutorialStep++;
        updateTutorialUI();
    } else {
        closeOneDriveTutorial();
    }
};

window.prevTutorialStep = function () {
    if (currentTutorialStep > 1) {
        currentTutorialStep--;
        updateTutorialUI();
    }
};

function updateTutorialUI() {
    // Update Steps
    for (let i = 1; i <= totalTutorialSteps; i++) {
        const step = document.getElementById(`tutorial-step-${i}`);
        const dot = document.getElementById(`dot-${i}`);

        if (step && dot) {
            if (i === currentTutorialStep) {
                step.style.display = 'block';
                dot.classList.add('active');
                dot.style.background = '#3B82F6';
            } else {
                step.style.display = 'none';
                dot.classList.remove('active');
                dot.style.background = '#4B5563';
            }
        }
    }

    // Update Buttons
    const prevBtn = document.getElementById('tut-prev-btn');
    const nextBtn = document.getElementById('tut-next-btn');

    if (prevBtn) {
        prevBtn.style.visibility = currentTutorialStep === 1 ? 'hidden' : 'visible';
    }

    if (nextBtn) {
        if (currentTutorialStep === totalTutorialSteps) {
            nextBtn.innerHTML = 'Finish';
            nextBtn.style.background = '#10B981';
        } else {
            nextBtn.innerHTML = 'Next &rarr;';
            nextBtn.style.background = '#3B82F6';
        }
    }
}

console.log('[Tutorial] Module Loaded');
