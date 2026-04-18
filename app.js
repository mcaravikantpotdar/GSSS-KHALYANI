/* ==========================================================================
   MASTER CONFIGURATION - ONLY EDIT THIS SECTION
   ========================================================================== */
const CONFIG = {
    // 1. Your GitHub Repository Details
    githubOwner: "mcaravikantpotdar", // Your exact username
    githubRepo: "GSSS-KHALYANI",      // Your exact repo
    githubBranch: "main",             // Usually "main" or "master"
    
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
    authError: document.getElementById('auth-error-msg'),
    // Editor (New)
    editorModal: document.getElementById('modal-editor'),
    editorForm: document.getElementById('post-editor-form'),
    editorCancel: document.getElementById('btn-editor-cancel'),
    // Sidebar (New)
    linksList: document.getElementById('quick-links-list')
};

// --- Initialization ---
async function init() {
    console.log("System Starting...");
    checkAdminStatus();
    setupEventListeners();
    
    await fetchSchoolDetails();
    await fetchFeedData();
    renderAdminUI(); // Added Admin UI Initialization
}

// --- GitHub API Helper (New) ---
async function githubRequest(path, method = 'GET', body = null) {
    const url = `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/contents/${path}`;
    const headers = {
        'Authorization': `token ${state.pat}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    return await res.json();
}

// --- Data Fetching ---
async function fetchSchoolDetails() {
    try {
        const res = await fetch(`${CONFIG.dataPath}school_details.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load school details.");
        state.schoolDetails = await res.json();
        renderHero();
        renderSidebar(); // Added Sidebar Rendering
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
        
        if (!state.isAdmin) {
            data = data.filter(post => post.status === "published");
        }
        
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

function renderSidebar() {
    if (!state.schoolDetails || !state.schoolDetails.categories) return;
    DOM.linksList.innerHTML = state.schoolDetails.categories.map(cat => 
        `<li><a href="#" onclick="alert('Category filter coming soon!')">${cat}</a></li>`
    ).join('');
}

function renderFeed() {
    DOM.feedContainer.innerHTML = ""; 
    
    if (state.feedData.length === 0) {
        DOM.feedContainer.innerHTML = `<div class="loader">No posts available yet.</div>`;
        return;
    }

    state.feedData.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = `post-card ${post.is_pinned ? 'pinned' : ''}`;
        
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

function renderAdminUI() {
    if (!state.isAdmin) return;
    
    // Create "+ Create New Post" Button
    const newBtn = document.createElement('button');
    newBtn.className = "btn-primary";
    newBtn.style.margin = "0 auto 2rem auto";
    newBtn.style.display = "block";
    newBtn.innerText = "+ Create New Post";
    newBtn.onclick = () => DOM.editorModal.style.display = "flex";
    
    DOM.feedContainer.prepend(newBtn);

    // Populate Category Dropdown in Editor
    if (state.schoolDetails && state.schoolDetails.categories) {
        const catSelect = document.getElementById('edit-category');
        catSelect.innerHTML = state.schoolDetails.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

// --- Image Compression Logic (New) ---
async function processImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                // Compress width to max 720px
                const scale = Math.min(1, 720 / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Return Base64 string without data URI prefix
                resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// --- Saving Logic (New) ---
async function handlePostSave(e) {
    e.preventDefault();
    if (!state.pat) return alert("Please login first");

    const btn = document.getElementById('btn-editor-save');
    btn.innerText = "Saving to GitHub...";
    btn.disabled = true;

    try {
        const timestamp = Date.now();
        const postID = `post_${timestamp}`;
        let mediaPath = null;

        // 1. Handle Image Upload if exists
        const fileInput = document.getElementById('edit-media');
        if (fileInput.files[0]) {
            const base64 = await processImage(fileInput.files[0]);
            const fileName = `${CONFIG.currentYear}_${postID}_pic_01.jpg`;
            await githubRequest(`${CONFIG.mediaPath}${fileName}`, 'PUT', {
                message: `Upload image for ${postID}`,
                content: base64,
                branch: CONFIG.githubBranch
            });
            mediaPath = `${CONFIG.mediaPath}${fileName}`;
        }

        // 2. Fetch current JSON file to get its SHA (required for updating)
        const filePath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        let fileData;
        try {
            fileData = await githubRequest(filePath);
        } catch (err) {
            // If file doesn't exist yet, we'll create it
            fileData = { content: btoa("[]"), sha: null };
        }
        
        // Decode existing JSON array
        const currentContent = JSON.parse(decodeURIComponent(escape(window.atob(fileData.content))));

        // 3. Build New Post Object
        const newPost = {
            id: postID,
            status: document.querySelector('input[name="edit-status"]:checked').value,
            is_pinned: document.getElementById('edit-pinned').checked,
            timestamp: timestamp,
            category: document.getElementById('edit-category').value,
            title_en: document.getElementById('edit-title-en').value,
            title_hi: document.getElementById('edit-title-hi').value,
            content_en: document.getElementById('edit-content-en').value,
            content_hi: document.getElementById('edit-content-hi').value,
            media: mediaPath ? [mediaPath] : []
        };

        // 4. Add to array and push back to GitHub
        currentContent.unshift(newPost); // Add to beginning of array
        
        const payload = {
            message: `Add new post: ${newPost.title_en}`,
            content: window.btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2)))),
            branch: CONFIG.githubBranch
        };
        if (fileData.sha) payload.sha = fileData.sha; // Include SHA if updating

        await githubRequest(filePath, 'PUT', payload);

        alert("Post saved successfully!");
        window.location.reload();
        
    } catch (err) {
        console.error(err);
        alert("Error saving: " + err.message);
    } finally {
        btn.innerText = "Save & Publish";
        btn.disabled = false;
    }
}

// --- Event Listeners ---
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
    // Admin Login/Logout
    DOM.adminBtn.addEventListener('click', () => {
        if (state.isAdmin) {
            sessionStorage.removeItem('github_pat');
            window.location.reload();
        } else {
            DOM.authModal.style.display = 'flex';
        }
    });

    DOM.authCancel.addEventListener('click', () => {
        DOM.authModal.style.display = 'none';
        DOM.authError.style.display = 'none';
    });

    DOM.authSubmit.addEventListener('click', () => {
        const token = DOM.authInput.value.trim();
        // Preserved your exact token validation rule
        if (token.startsWith("ghp_") || token.startsWith("github_pat_")) {
            sessionStorage.setItem('github_pat', token);
            window.location.reload(); 
        } else {
            DOM.authError.innerText = "Invalid token format. Must start with ghp_ or github_pat_";
            DOM.authError.style.display = 'block';
        }
    });

    // Editor Modals
    DOM.editorCancel.addEventListener('click', () => {
        DOM.editorModal.style.display = 'none';
    });

    DOM.editorForm.addEventListener('submit', handlePostSave);
}

// Boot the system
init();
