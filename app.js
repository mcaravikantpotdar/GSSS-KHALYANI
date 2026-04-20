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
    schoolDetails: null, 
    feedData: [], 
    isAdmin: false,
    pat: sessionStorage.getItem('github_pat') || null,
    currentEditingMedia: [] 
};

const DOM = {
    logo: document.getElementById('school-logo'),
    name: document.getElementById('school-name'),
    udise: document.getElementById('udise-code'),
    mission: document.getElementById('mission-statement'),
    feedContainer: document.getElementById('feed-column'),
    adminBtn: document.getElementById('btn-admin-login'),
    adminPanel: document.getElementById('admin-control-panel'),
    createBtn: document.getElementById('btn-create-post'),
    authModal: document.getElementById('modal-auth'),
    authInput: document.getElementById('input-pat'),
    authSubmit: document.getElementById('btn-auth-submit'),
    authCancel: document.getElementById('btn-auth-cancel'),
    editorModal: document.getElementById('modal-editor'),
    editorForm: document.getElementById('post-editor-form'),
    editorCancel: document.getElementById('btn-editor-cancel'),
    linksList: document.getElementById('quick-links-list'),
    mediaPreview: document.getElementById('edit-preview-container')
};

async function init() {
    checkAdminStatus();
    setupEventListeners();
    await fetchSchoolDetails();
    await fetchFeedData();
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
        renderAdminUI();
    } catch (e) { console.error(e); }
}

async function fetchFeedData() {
    try {
        const res = await fetch(`${CONFIG.dataPath}${CONFIG.currentYear}.json?t=${Date.now()}`);
        let data = await res.json();
        if (!state.isAdmin) data = data.filter(p => p.status === "published");
        
        // Exclude deletes that are older than 60 seconds (permanently removed)
        data = data.filter(p => {
            const dt = sessionStorage.getItem('sync_del_' + p.id);
            if (dt && (Date.now() - parseInt(dt) > 60000)) return false; 
            return true;
        });

        state.feedData = data.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.timestamp - a.timestamp));
        renderFeed();
        startLockPolling(); 
    } catch (e) { console.error(e); }
}

function startLockPolling() {
    if (window.lockInterval) clearInterval(window.lockInterval);
    window.lockInterval = setInterval(() => {
        let fetchNeeded = false;
        let renderNeeded = false;
        
        // Check Edits for Silent Sync
        state.feedData.forEach(p => {
            const et = sessionStorage.getItem('sync_edit_' + p.id);
            if (et && Date.now() - parseInt(et) > 60000) {
                sessionStorage.removeItem('sync_edit_' + p.id);
                fetchNeeded = true;
            }
        });

        // Check Deletes for Vanishing Act
        const originalLength = state.feedData.length;
        state.feedData = state.feedData.filter(p => {
            const dt = sessionStorage.getItem('sync_del_' + p.id);
            if (dt && Date.now() - parseInt(dt) > 60000) {
                sessionStorage.removeItem('sync_del_' + p.id);
                return false; 
            }
            return true;
        });

        if (originalLength !== state.feedData.length) renderNeeded = true;
        
        // Execute appropriate action based on timer expiration
        if (fetchNeeded) {
            fetchFeedData(); // Calls a silent network request to grab the fresh deployment
        } else if (renderNeeded) {
            renderFeed(); // Only local state changed, cleanly redraw
        }
    }, 5000); 
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
    Array.from(DOM.feedContainer.children).forEach(child => {
        if (child.id !== 'admin-control-panel') child.remove();
    });

    if (state.feedData.length === 0) {
        const msg = document.createElement('div');
        msg.className = "loader"; msg.innerText = "No posts available yet.";
        DOM.feedContainer.appendChild(msg);
        return;
    }
    
    state.feedData.forEach(post => {
        const isEditLocked = sessionStorage.getItem('sync_edit_' + post.id) && (Date.now() - parseInt(sessionStorage.getItem('sync_edit_' + post.id)) <= 60000);
        const isDelLocked = sessionStorage.getItem('sync_del_' + post.id) && (Date.now() - parseInt(sessionStorage.getItem('sync_del_' + post.id)) <= 60000);
        const isLocked = isEditLocked || isDelLocked;

        const card = document.createElement('article');
        card.className = `post-card ${post.is_pinned ? 'pinned' : ''} ${isLocked ? 'sync-locked' : ''}`;
        
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
            html += `<div class="admin-actions">
                <button class="btn-secondary btn-small" ${isLocked ? 'disabled' : ''} onclick="window.editPost('${post.id}')">${isEditLocked ? '⏳ Syncing...' : '✏️ Edit'}</button>
                <button class="btn-secondary btn-small" style="color: #dc2626; border-color: #dc2626;" ${isLocked ? 'disabled' : ''} onclick="window.deletePost('${post.id}')">${isDelLocked ? '⏳ Deleting...' : '🗑️ Delete'}</button>
            </div>`;
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
    if (state.isAdmin && state.schoolDetails && state.schoolDetails.categories) {
        document.getElementById('edit-category-container').innerHTML = state.schoolDetails.categories.map(c => 
            `<label><input type="checkbox" class="cat-checkbox" value="${c}"> ${c}</label>`
        ).join('');
    }
}

function renderMediaPreview() {
    DOM.mediaPreview.innerHTML = state.currentEditingMedia.length ? "" : "No existing images.";
    state.currentEditingMedia.forEach((path, idx) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.innerHTML = `
            <img src="${path}">
            <button type="button" class="remove-img-btn" onclick="window.removeExistingImage(${idx})">×</button>
        `;
        DOM.mediaPreview.appendChild(item);
    });
}

window.removeExistingImage = function(index) {
    state.currentEditingMedia.splice(index, 1);
    renderMediaPreview();
};

window.editPost = function(postID) {
    const post = state.feedData.find(p => p.id === postID);
    if (!post) return;

    DOM.editorForm.reset();
    document.getElementById('edit-post-id').value = post.id;
    document.getElementById('editor-title').innerText = "Edit Post";
    document.getElementById('edit-title').value = post.title || post.title_en || "";
    document.getElementById('edit-content').innerHTML = post.content || post.content_en || "";
    
    state.currentEditingMedia = post.media ? [...post.media] : [];
    renderMediaPreview();

    const statusRadio = document.querySelector(`input[name="edit-status"][value="${post.status || 'published'}"]`);
    if(statusRadio) statusRadio.checked = true;
    document.getElementById('edit-pinned').checked = post.is_pinned || false;

    const checkboxes = document.querySelectorAll('.cat-checkbox');
    checkboxes.forEach(cb => { cb.checked = post.categories && post.categories.includes(cb.value); });

    DOM.editorModal.style.display = "flex";
};

window.deletePost = async function(postID) {
    if (!confirm("Are you sure you want to permanently delete this post?")) return;
    try {
        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        const fData = await githubRequest(fPath);
        let content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const newContent = content.filter(p => p.id !== postID);
        await githubRequest(fPath, 'PUT', {
            message: `Deleted post ${postID}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))),
            sha: fData.sha
        });
        
        sessionStorage.setItem('sync_del_' + postID, Date.now().toString());
        alert("Post deleted successfully from the database. It may take a minute for the public website to update.");
        location.reload();
    } catch (err) { alert("Error deleting post: " + err.message); location.reload(); }
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

        if (isEditing && content.findIndex(p => p.id === pid) === -1) {
            alert("Cannot save changes. This post appears to have been deleted or moved. The page will now refresh.");
            location.reload(); return;
        }

        const files = document.getElementById('edit-media').files;
        let newMediaPaths = [];
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                saveBtn.innerText = `Uploading Image ${i+1}/${files.length}...`;
                const b64 = await processImage(files[i]);
                const fname = `${CONFIG.currentYear}_${pid}_pic_${String(i+1).padStart(2,'0')}_${Date.now()}.jpg`;
                await githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: `Img upload`, content: b64 });
                newMediaPaths.push(`${CONFIG.mediaPath}${fname}`);
            }
        }

        const finalMedia = isEditing ? [...state.currentEditingMedia, ...newMediaPaths] : newMediaPaths;

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
            const idx = content.findIndex(p => p.id === pid);
            content[idx] = postObj;
        } else {
            content.unshift(postObj);
        }

        await githubRequest(fPath, 'PUT', {
            message: `${isEditing ? 'Updated' : 'Added'} post: ${postObj.title}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
            sha: fData.sha
        });
        
        if (isEditing) sessionStorage.setItem('sync_edit_' + pid, Date.now().toString());

        alert("Changes saved to the database. Due to GitHub's processing time, these changes will appear on the public website in about 1–2 minutes.");
        location.reload();
    } catch (err) { alert("Error: " + err.message); saveBtn.disabled = false; saveBtn.innerText = "Save & Publish"; }
}

function checkAdminStatus() { 
    if (state.pat) { 
        state.isAdmin = true; DOM.adminBtn.innerText = "Logout Admin"; DOM.adminBtn.style.color = "var(--accent-color)"; 
        if(DOM.adminPanel) DOM.adminPanel.style.display = "block";
    } 
}

function setupEventListeners() {
    DOM.adminBtn.onclick = () => state.isAdmin ? (sessionStorage.removeItem('github_pat'), location.reload()) : (DOM.authModal.style.display='flex');
    DOM.authCancel.onclick = () => DOM.authModal.style.display='none';
    DOM.authSubmit.onclick = () => { 
        const t = DOM.authInput.value.trim(); 
        if(t.startsWith('ghp_') || t.startsWith('github_pat_')){ sessionStorage.setItem('github_pat', t); location.reload(); } 
    };
    DOM.editorCancel.onclick = () => DOM.editorModal.style.display='none';
    if(DOM.createBtn) {
        DOM.createBtn.onclick = () => {
            DOM.editorForm.reset();
            document.getElementById('edit-post-id').value = ""; 
            document.getElementById('edit-content').innerHTML = ""; 
            state.currentEditingMedia = [];
            renderMediaPreview();
            document.getElementById('editor-title').innerText = "Create New Post";
            DOM.editorModal.style.display = "flex";
        };
    }
    DOM.editorForm.onsubmit = handlePostSave;
}

init();
