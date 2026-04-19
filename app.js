/* ==========================================================================
   MASTER CONFIGURATION
   ========================================================================== */
const CONFIG = {
    githubOwner: "mcaravikantpotdar",
    githubRepo: "GSSS-KHALYANI",
    githubBranch: "main",
    currentYear: "2026-27",
    dataPath: "data/",
    mediaPath: "media/"
};

// --- RICH TEXT COMMANDS ---
window.execCommand = function(command) {
    document.execCommand(command, false, null);
    document.getElementById('edit-content').focus();
};

window.insertTable = function() {
    const tableHTML = `<table border="1" style="width:100%; border-collapse:collapse;"><tr><th>Header 1</th><th>Header 2</th></tr><tr><td>Data 1</td><td>Data 2</td></tr></table><p><br></p>`;
    document.execCommand('insertHTML', false, tableHTML);
};

/* ==========================================================================
   APPLICATION LOGIC
   ========================================================================== */

let state = {
    schoolDetails: null, feedData: [], isAdmin: false,
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
    editorModal: document.getElementById('modal-editor'),
    editorForm: document.getElementById('post-editor-form'),
    editorCancel: document.getElementById('btn-editor-cancel'),
    linksList: document.getElementById('quick-links-list')
};

async function init() {
    checkAdminStatus();
    setupEventListeners();
    await fetchSchoolDetails();
    await fetchFeedData();
    renderAdminUI();
}

async function githubRequest(path, method = 'GET', body = null) {
    const url = `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/contents/${path}`;
    const headers = { 'Authorization': `token ${state.pat}`, 'Accept': 'application/vnd.github.v3+json' };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
}

async function fetchSchoolDetails() {
    try {
        const res = await fetch(`${CONFIG.dataPath}school_details.json?t=${Date.now()}`);
        state.schoolDetails = await res.json();
        renderHero();
        renderSidebar();
    } catch (e) { console.error(e); }
}

async function fetchFeedData() {
    try {
        const res = await fetch(`${CONFIG.dataPath}${CONFIG.currentYear}.json?t=${Date.now()}`);
        let data = await res.json();
        
        if (!state.isAdmin) data = data.filter(p => p.status === "published");
        
        // MEMORY MASK: Filter out any posts marked as deleted in this browser session
        data = data.filter(p => !sessionStorage.getItem('deleted_' + p.id));

        state.feedData = data.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.timestamp - a.timestamp));
        renderFeed();
    } catch (e) { console.error(e); }
}

function renderHero() {
    if (!state.schoolDetails) return;
    DOM.name.innerText = state.schoolDetails.school_name;
    DOM.udise.innerText = `UDISE: ${state.schoolDetails.udise_code}`;
    DOM.mission.innerText = state.schoolDetails.mission_statement;
    if (state.schoolDetails.logo_path) { DOM.logo.src = state.schoolDetails.logo_path; DOM.logo.style.display = "block"; }
}

function renderSidebar() {
    if (!state.schoolDetails) return;
    DOM.linksList.innerHTML = state.schoolDetails.categories.map(c => `<li><a href="#">${c}</a></li>`).join('');
}

function renderFeed() {
    DOM.feedContainer.innerHTML = state.feedData.length ? "" : `<div class="loader">No posts available yet.</div>`;
    state.feedData.forEach(post => {
        const card = document.createElement('article');
        card.className = `post-card ${post.is_pinned ? 'pinned' : ''}`;
        
        const displayTitle = post.title || post.title_en || "Untitled Post";
        const displayContent = post.content || post.content_en || "No content available.";

        let html = `
            ${post.is_pinned ? '<span class="pin-badge">📌 Pinned</span>' : ''}
            <div class="post-header">
                <div class="tags-container">${post.categories ? post.categories.map(c => `<span class="category-tag">#${c}</span>`).join('') : ''}</div>
                <span class="post-date">• ${new Date(post.timestamp).toLocaleDateString('en-IN')}</span>
            </div>
            <h2 class="post-title-en">${displayTitle}</h2>
            <div class="post-content">${displayContent}</div>
        `;
        if (post.media && post.media.length > 0) {
            html += `<div class="post-media">`;
            post.media.forEach((m, idx) => html += `<img src="${m}" class="slider-img ${idx === 0 ? 'active' : ''}">`);
            if (post.media.length > 1) {
                html += `<button class="slider-btn" style="left:0" onclick="changeSlide(this,-1)">&#10094;</button>
                         <button class="slider-btn" style="right:0" onclick="changeSlide(this,1)">&#10095;</button>
                         <div class="slider-counter">1 / ${post.media.length}</div>`;
            }
            html += `</div>`;
        }

        if (state.isAdmin) {
            html += `
                <div class="admin-actions">
                    <button class="btn-secondary btn-small" onclick="window.editPost('${post.id}')">✏️ Edit</button>
                    <button class="btn-secondary btn-small" style="color: #dc2626; border-color: #dc2626;" onclick="window.deletePost('${post.id}')">🗑️ Delete</button>
                </div>
            `;
        }
        card.innerHTML = html;
        DOM.feedContainer.appendChild(card);
    });
}

window.changeSlide = function(btn, dir) {
    const container = btn.closest('.post-media');
    const imgs = container.querySelectorAll('.slider-img');
    const count = container.querySelector('.slider-counter');
    let idx = Array.from(imgs).findIndex(img => img.classList.contains('active'));
    imgs[idx].classList.remove('active');
    let nIdx = (idx + dir + imgs.length) % imgs.length;
    imgs[nIdx].classList.add('active');
    if (count) count.innerText = `${nIdx + 1} / ${imgs.length}`;
};

function renderAdminUI() {
    if (!state.isAdmin) return;
    const btn = document.createElement('button');
    btn.className = "btn-primary"; btn.style.display = "block"; btn.style.margin = "0 auto 2rem auto";
    btn.innerText = "+ Create New Post"; 
    btn.onclick = () => {
        DOM.editorForm.reset();
        document.getElementById('edit-post-id').value = ""; 
        document.getElementById('edit-content').innerHTML = ""; 
        document.getElementById('editor-title').innerText = "Create New Post";
        DOM.editorModal.style.display = "flex";
    };
    DOM.feedContainer.prepend(btn);

    if (state.schoolDetails && state.schoolDetails.categories) {
        document.getElementById('edit-category-container').innerHTML = state.schoolDetails.categories.map(c => 
            `<label><input type="checkbox" class="cat-checkbox" value="${c}"> ${c}</label>`
        ).join('');
    }
}

window.editPost = function(postID) {
    const post = state.feedData.find(p => p.id === postID);
    if (!post) return;

    DOM.editorForm.reset();
    document.getElementById('edit-post-id').value = post.id;
    document.getElementById('editor-title').innerText = "Edit Post";
    document.getElementById('edit-title').value = post.title || post.title_en || "";
    document.getElementById('edit-content').innerHTML = post.content || post.content_en || "";
    
    document.querySelector(`input[name="edit-status"][value="${post.status || 'published'}"]`).checked = true;
    document.getElementById('edit-pinned').checked = post.is_pinned || false;

    const checkboxes = document.querySelectorAll('.cat-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = post.categories && post.categories.includes(cb.value);
    });

    DOM.editorModal.style.display = "flex";
};

window.deletePost = async function(postID) {
    if (!confirm("Are you sure you want to permanently delete this post?")) return;

    try {
        const postElement = document.querySelector(`[onclick*="${postID}"]`).closest('.post-card');
        if (postElement) postElement.style.opacity = '0.3';

        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        const fData = await githubRequest(fPath);
        let content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));

        const newContent = content.filter(p => p.id !== postID);

        await githubRequest(fPath, 'PUT', {
            message: `Deleted post ${postID}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))),
            sha: fData.sha
        });
        
        // MEMORY MASK: Record the deletion locally so it doesn't reappear on refresh
        sessionStorage.setItem('deleted_' + postID, 'true');

        state.feedData = state.feedData.filter(p => p.id !== postID);
        if (postElement) postElement.remove();

        alert("Post deleted successfully from the database. It may take a minute for the public website to update.");
    } catch (err) {
        alert("Error deleting post: " + err.message);
        location.reload(); 
    }
};

async function processImage(file) {
    return new Promise(res => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 720 / img.width);
                canvas.width = img.width * scale; canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                res(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handlePostSave(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-editor-save');
    saveBtn.innerText = "Writing to Repository..."; saveBtn.disabled = true;

    try {
        const editPostID = document.getElementById('edit-post-id').value;
        const isEditing = !!editPostID;
        const pid = isEditing ? editPostID : `post_${Date.now()}`;
        
        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        let fData; try { fData = await githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));

        // EXISTENCE CHECK FOR GHOST EDITS
        if (isEditing) {
            const index = content.findIndex(p => p.id === pid);
            if (index === -1) {
                alert("Cannot save changes. This post appears to have been deleted or moved. The page will now refresh to show the current state.");
                location.reload();
                return;
            }
        }

        const files = document.getElementById('edit-media').files;
        let newMediaPaths = [];

        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                saveBtn.innerText = `Uploading Image ${i+1}/${files.length}...`;
                const b64 = await processImage(files[i]);
                const fname = `${CONFIG.currentYear}_${pid}_pic_${String(i+1).padStart(2,'0')}.jpg`;
                await githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: `Img ${i+1}`, content: b64 });
                newMediaPaths.push(`${CONFIG.mediaPath}${fname}`);
            }
            saveBtn.innerText = "Writing to Repository...";
        }

        let finalMedia = newMediaPaths;
        if (isEditing && files.length === 0) {
            const existingPost = content.find(p => p.id === pid);
            if (existingPost && existingPost.media) finalMedia = existingPost.media;
        }

        const postObj = {
            id: pid, 
            timestamp: isEditing ? content.find(p => p.id === pid).timestamp : Date.now(), 
            status: document.querySelector('input[name="edit-status"]:checked').value,
            is_pinned: document.getElementById('edit-pinned').checked,
            categories: Array.from(document.querySelectorAll('.cat-checkbox:checked')).map(c => c.value),
            title: document.getElementById('edit-title').value,
            content: document.getElementById('edit-content').innerHTML,
            media: finalMedia
        };

        if (isEditing) {
            const index = content.findIndex(p => p.id === pid);
            content[index] = postObj;
        } else {
            content.unshift(postObj);
        }

        await githubRequest(fPath, 'PUT', {
            message: isEditing ? `Updated post: ${postObj.title}` : `Add new post: ${postObj.title}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
            sha: fData.sha
        });
        
        alert("Changes saved to the database. Due to GitHub's processing time, these changes will appear on the public website in about 1–2 minutes.");
        location.reload();
    } catch (err) { alert("Error: " + err.message); saveBtn.disabled = false; saveBtn.innerText = "Save & Publish"; }
}

function checkAdminStatus() { 
    if (state.pat) { state.isAdmin = true; DOM.adminBtn.innerText = "Logout Admin"; DOM.adminBtn.style.color = "var(--accent-color)"; } 
}

function setupEventListeners() {
    DOM.adminBtn.onclick = () => state.isAdmin ? (sessionStorage.removeItem('github_pat'), location.reload()) : (DOM.authModal.style.display='flex');
    DOM.authCancel.onclick = () => DOM.authModal.style.display='none';
    DOM.authSubmit.onclick = () => { 
        const t = DOM.authInput.value.trim(); 
        if(t.startsWith('ghp_') || t.startsWith('github_pat_')){ sessionStorage.setItem('github_pat', t); location.reload(); } 
    };
    DOM.editorCancel.onclick = () => DOM.editorModal.style.display='none';
    DOM.editorForm.onsubmit = handlePostSave;
}

init();
