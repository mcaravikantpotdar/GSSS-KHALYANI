/* ==========================================================================
   MASTER CONFIGURATION - ONLY EDIT THIS SECTION
   ========================================================================== */
const CONFIG = {
    githubOwner: "mcaravikantpotdar",
    githubRepo: "GSSS-KHALYANI",
    githubBranch: "main",
    currentYear: "2026-27",
    dataPath: "data/",
    mediaPath: "media/"
};

/* ==========================================================================
   DO NOT EDIT BELOW THIS LINE - APPLICATION LOGIC
   ========================================================================== */

let state = {
    schoolDetails: null,
    feedData: [],
    isAdmin: false,
    pat: sessionStorage.getItem('github_pat') || null
};

const DOM = {
    logo: document.getElementById('school-logo'),
    name: document.getElementById('school-name'),
    udise: document.getElementById('udise-code'),
    mission: document.getElementById('mission-statement'),
    feedContainer: document.getElementById('feed-column'),
    adminBtn: document.getElementById('btn-admin-login'),
    authModal: document.getElementById('modal-auth'),
    authInput: document.getElementById('input-pat'),
    authSubmit: document.getElementById('btn-auth-submit'),
    authCancel: document.getElementById('btn-auth-cancel'),
    authError: document.getElementById('auth-error-msg'),
    editorModal: document.getElementById('modal-editor'),
    editorForm: document.getElementById('post-editor-form'),
    editorCancel: document.getElementById('btn-editor-cancel'),
    linksList: document.getElementById('quick-links-list')
};

async function init() {
    console.log("System Starting...");
    checkAdminStatus();
    setupEventListeners();
    await fetchSchoolDetails();
    await fetchFeedData();
    renderAdminUI();
}

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

async function fetchSchoolDetails() {
    try {
        const res = await fetch(`${CONFIG.dataPath}school_details.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load school details.");
        state.schoolDetails = await res.json();
        renderHero();
        renderSidebar();
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
        
        if (!state.isAdmin) data = data.filter(post => post.status === "published");
        
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
        
        const dateStr = new Date(post.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        let html = ``;
        if (post.is_pinned) html += `<span class="pin-badge">📌 Pinned</span>`;
        if (state.isAdmin && post.status === "draft") html += `<span class="pin-badge" style="background: #dc2626; right: 80px;">DRAFT</span>`;
        
        // Tags and Date
        html += `<div class="post-header">`;
        if (post.categories && post.categories.length > 0) {
            html += `<div class="tags-container">` + post.categories.map(c => `<span class="category-tag">#${c}</span>`).join('') + `</div>`;
        }
        html += `<span class="post-date">• ${dateStr}</span></div>`;

        // Unified Text Content
        html += `<h2 class="post-title-en">${post.title}</h2>
                 <div class="post-content"><p>${post.content.replace(/\n/g, '<br>')}</p></div>`;

        // Image Slider
        if (post.media && post.media.length > 0) {
            html += `<div class="post-media">`;
            post.media.forEach((img, idx) => {
                html += `<img src="${img}" class="slider-img ${idx === 0 ? 'active' : ''}" alt="Attachment ${idx+1}">`;
            });
            if (post.media.length > 1) {
                html += `
                    <button class="slider-btn prev" onclick="changeSlide(this, -1)">&#10094;</button>
                    <button class="slider-btn next" onclick="changeSlide(this, 1)">&#10095;</button>
                    <div class="slider-counter">1 / ${post.media.length}</div>
                `;
            }
            html += `</div>`;
        }

        if (state.isAdmin) {
            html += `<div class="admin-actions"><button class="btn-secondary btn-small" onclick="alert('Edit logic coming soon!')">✏️ Edit</button></div>`;
        }

        postEl.innerHTML = html;
        DOM.feedContainer.appendChild(postEl);
    });
}

// Global function for the slider buttons
window.changeSlide = function(btn, dir) {
    const container = btn.closest('.post-media');
    const images = container.querySelectorAll('.slider-img');
    const counter = container.querySelector('.slider-counter');
    let activeIdx = Array.from(images).findIndex(img => img.classList.contains('active'));
    
    images[activeIdx].classList.remove('active');
    let newIdx = (activeIdx + dir + images.length) % images.length;
    images[newIdx].classList.add('active');
    
    if (counter) counter.innerText = `${newIdx + 1} / ${images.length}`;
};

function renderAdminUI() {
    if (!state.isAdmin) return;
    const newBtn = document.createElement('button');
    newBtn.className = "btn-primary";
    newBtn.style.margin = "0 auto 2rem auto";
    newBtn.style.display = "block";
    newBtn.innerText = "+ Create New Post";
    newBtn.onclick = () => DOM.editorModal.style.display = "flex";
    DOM.feedContainer.prepend(newBtn);

    // Render Checkboxes
    if (state.schoolDetails && state.schoolDetails.categories) {
        const catContainer = document.getElementById('edit-category-container');
        catContainer.innerHTML = state.schoolDetails.categories.map(c => 
            `<label><input type="checkbox" class="cat-checkbox" value="${c}"> ${c}</label>`
        ).join('');
    }
}

async function processImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const scale = Math.min(1, 720 / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handlePostSave(e) {
    e.preventDefault();
    if (!state.pat) return alert("Please login first");

    const btn = document.getElementById('btn-editor-save');
    btn.innerText = "Saving to GitHub...";
    btn.disabled = true;

    try {
        const timestamp = Date.now();
        const postID = `post_${timestamp}`;
        const mediaPaths = [];

        // 1. Handle Multiple Image Uploads
        const fileInput = document.getElementById('edit-media');
        if (fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                btn.innerText = `Uploading Image ${i+1}/${fileInput.files.length}...`;
                const base64 = await processImage(fileInput.files[i]);
                const padIndex = String(i+1).padStart(2, '0');
                const fileName = `${CONFIG.currentYear}_${postID}_pic_${padIndex}.jpg`;
                
                await githubRequest(`${CONFIG.mediaPath}${fileName}`, 'PUT', {
                    message: `Upload image ${i+1} for ${postID}`,
                    content: base64,
                    branch: CONFIG.githubBranch
                });
                mediaPaths.push(`${CONFIG.mediaPath}${fileName}`);
            }
        }

        btn.innerText = "Updating Feed...";

        // 2. Read existing feed
        const filePath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        let fileData;
        try { fileData = await githubRequest(filePath); } 
        catch (err) { fileData = { content: btoa("[]"), sha: null }; }
        
        const currentContent = JSON.parse(decodeURIComponent(escape(window.atob(fileData.content))));

        // 3. Build Unified Post Object
        const selectedCats = Array.from(document.querySelectorAll('.cat-checkbox:checked')).map(cb => cb.value);
        
        const newPost = {
            id: postID,
            status: document.querySelector('input[name="edit-status"]:checked').value,
            is_pinned: document.getElementById('edit-pinned').checked,
            timestamp: timestamp,
            categories: selectedCats,
            title: document.getElementById('edit-title').value,
            content: document.getElementById('edit-content').value,
            media: mediaPaths
        };

        // 4. Save
        currentContent.unshift(newPost);
        const payload = {
            message: `Add new post: ${newPost.title}`,
            content: window.btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2)))),
            branch: CONFIG.githubBranch
        };
        if (fileData.sha) payload.sha = fileData.sha;

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
        if (token.startsWith("ghp_") || token.startsWith("github_pat_")) {
            sessionStorage.setItem('github_pat', token);
            window.location.reload(); 
        } else {
            DOM.authError.innerText = "Invalid token format. Must start with ghp_ or github_pat_";
            DOM.authError.style.display = 'block';
        }
    });

    DOM.editorCancel.addEventListener('click', () => {
        DOM.editorModal.style.display = 'none';
    });

    DOM.editorForm.addEventListener('submit', handlePostSave);
}

init();
