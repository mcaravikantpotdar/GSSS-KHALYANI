/* ==========================================================================
   MASTER CONFIGURATION - ONLY EDIT THIS SECTION
   ========================================================================== */
const CONFIG = {
    // 1. Your GitHub Repository Details
    githubOwner: "YOUR_GITHUB_USERNAME", // e.g., "schooladmin"
    githubRepo: "YOUR_REPO_NAME",        // e.g., "gsss-kullu-website"
    githubBranch: "main",                // Usually "main" or "master"
    
    // 2. Current Academic Year (Matches your JSON file name in /data/)
    currentYear: "2026-27",
    
    // 3. System Paths
    dataPath: "data/",                   // Where your JSON files live
    mediaPath: "media/"                  // Where your images live
};

/* ==========================================================================
   DO NOT EDIT BELOW THIS LINE - APPLICATION LOGIC
   ========================================================================== */

// --- Global State ---
let state = {
    schoolDetails: null,
    feedData: [],
    isAdmin: false,
    pat: sessionStorage.getItem('github_pat') || null
};

// --- DOM Elements ---
const DOM = {
    // Hero
    logo: document.getElementById('school-logo'),
    name: document.getElementById('school-name'),
    udise: document.getElementById('udise-code'),
    mission: document.getElementById('mission-statement'),
    // Feed
    feedContainer: document.getElementById('feed-column'),
    // Auth
    adminBtn: document.getElementById('btn-admin-login'),
    authModal: document.getElementById('modal-auth'),
    authInput: document.getElementById('input-pat'),
    authSubmit: document.getElementById('btn-auth-submit'),
    authCancel: document.getElementById('btn-auth-cancel'),
    authError: document.getElementById('auth-error-msg')
};

// --- Initialization ---
async function init() {
    console.log("System Starting...");
    checkAdminStatus();
    setupEventListeners();
    
    await fetchSchoolDetails();
    await fetchFeedData();
}

// --- Data Fetching ---
async function fetchSchoolDetails() {
    try {
        // Cache busting timestamp to always get fresh data
        const res = await fetch(`${CONFIG.dataPath}school_details.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load school details.");
        state.schoolDetails = await res.json();
        renderHero();
    } catch (error) {
        console.error(error);
        DOM.name.innerText = "Error loading school profile.";
    }
}

async function fetchFeedData() {
    try {
        const res = await fetch(`${CONFIG.dataPath}${CONFIG.currentYear}.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load feed.");
        let data = await res.json();
        
        // Filter out drafts if not admin
        if (!state.isAdmin) {
            data = data.filter(post => post.status === "published");
        }
        
        // Sort: Pinned first, then by timestamp (newest first)
        state.feedData = data.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return b.timestamp - a.timestamp;
        });
        
        renderFeed();
    } catch (error) {
        console.error(error);
        DOM.feedContainer.innerHTML = `<div class="loader">Unable to load feed data.</div>`;
    }
}

// --- Rendering ---
function renderHero() {
    if (!state.schoolDetails) return;
    
    DOM.name.innerText = state.schoolDetails.school_name;
    DOM.udise.innerText = `UDISE: ${state.schoolDetails.udise_code}`;
    DOM.mission.innerText = state.schoolDetails.mission_statement;
    
    if (state.schoolDetails.logo_path) {
        DOM.logo.src = state.schoolDetails.logo_path;
        DOM.logo.style.display = "block";
    }
}

function renderFeed() {
    DOM.feedContainer.innerHTML = ""; // Clear loader
    
    if (state.feedData.length === 0) {
        DOM.feedContainer.innerHTML = `<div class="loader">No posts available yet.</div>`;
        return;
    }

    state.feedData.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = `post-card ${post.is_pinned ? 'pinned' : ''}`;
        
        // Format Date
        const dateObj = new Date(post.timestamp);
        const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        let html = ``;
        if (post.is_pinned) html += `<span class="pin-badge">📌 Pinned</span>`;
        if (state.isAdmin && post.status === "draft") html += `<span class="pin-badge" style="background: #dc2626; right: 80px;">DRAFT</span>`;
        
        html += `
            <div class="post-header">
                <span class="post-category">${post.category}</span>
                <span class="post-date">• ${dateStr}</span>
            </div>
            <h2 class="post-title-en">${post.title_en}</h2>
            ${post.title_hi ? `<h3 class="post-title-hi">${post.title_hi}</h3>` : ''}
            <div class="post-content">
                <p>${post.content_en}</p>
                ${post.content_hi ? `<p style="margin-top:0.5rem; color: #6b7280;">${post.content_hi}</p>` : ''}
            </div>
        `;

        if (post.media && post.media.length > 0) {
            html += `<div class="post-media"><img src="${post.media[0]}" alt="Post attachment"></div>`;
        }

        // Add Admin Controls if logged in
        if (state.isAdmin) {
            html += `
                <div class="admin-actions">
                    <button class="btn-secondary btn-small" onclick="alert('Edit logic coming soon!')">✏️ Edit</button>
                </div>
            `;
        }

        postEl.innerHTML = html;
        DOM.feedContainer.appendChild(postEl);
    });
}

// --- Admin Authentication Logic ---
function checkAdminStatus() {
    if (state.pat) {
        state.isAdmin = true;
        DOM.adminBtn.innerText = "Logout Admin";
        DOM.adminBtn.style.color = "var(--accent-color)";
    } else {
        state.isAdmin = false;
        DOM.adminBtn.innerText = "Admin Login";
    }
}

function setupEventListeners() {
    // Admin Login/Logout Button
    DOM.adminBtn.addEventListener('click', () => {
        if (state.isAdmin) {
            // Logout
            sessionStorage.removeItem('github_pat');
            window.location.reload();
        } else {
            // Show Login Modal
            DOM.authModal.style.display = 'flex';
        }
    });

    // Close Auth Modal
    DOM.authCancel.addEventListener('click', () => {
        DOM.authModal.style.display = 'none';
        DOM.authError.style.display = 'none';
    });

    // Submit Auth
    DOM.authSubmit.addEventListener('click', () => {
        const token = DOM.authInput.value.trim();
        if (token.startsWith("ghp_") || token.startsWith("github_pat_")) {
            sessionStorage.setItem('github_pat', token);
            window.location.reload(); // Reload to fetch drafts and show admin UI
        } else {
            DOM.authError.innerText = "Invalid token format. Must start with ghp_ or github_pat_";
            DOM.authError.style.display = 'block';
        }
    });
}

// Boot the system
init();
