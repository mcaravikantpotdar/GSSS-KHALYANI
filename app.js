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
    staffData: [],
    isAdmin: false,
    pat: sessionStorage.getItem('github_pat') || null,
    currentEditingMedia: [],
    currentEditingStaffPhoto: null
};

const DOM = {
    logo: document.getElementById('school-logo'),
    name: document.getElementById('school-name'),
    udise: document.getElementById('udise-code'),
    mission: document.getElementById('mission-statement'),
    
    // Tabs & Containers
    tabFeed: document.getElementById('tab-feed'),
    tabPeople: document.getElementById('tab-people'),
    feedColumn: document.getElementById('feed-column'),
    peopleColumn: document.getElementById('people-column'),
    
    // Feed Elements
    adminPanel: document.getElementById('admin-control-panel'),
    createBtn: document.getElementById('btn-create-post'),
    feedContainer: document.getElementById('feed-column'),
    editorModal: document.getElementById('modal-editor'),
    editorForm: document.getElementById('post-editor-form'),
    editorCancel: document.getElementById('btn-editor-cancel'),
    mediaPreview: document.getElementById('edit-preview-container'),
    
    // Staff Elements
    staffAdminPanel: document.getElementById('admin-staff-panel'),
    addStaffBtn: document.getElementById('btn-add-staff'),
    staffGrid: document.getElementById('staff-grid'),
    staffModal: document.getElementById('modal-staff'),
    staffForm: document.getElementById('staff-editor-form'),
    staffCancel: document.getElementById('btn-staff-cancel'),
    staffPreview: document.getElementById('staff-preview-container'),
    
    // Auth
    adminBtn: document.getElementById('btn-admin-login'),
    authModal: document.getElementById('modal-auth'),
    authInput: document.getElementById('input-pat'),
    authSubmit: document.getElementById('btn-auth-submit'),
    authCancel: document.getElementById('btn-auth-cancel'),
    linksList: document.getElementById('quick-links-list')
};

async function init() {
    checkAdminStatus();
    setupEventListeners();
    await fetchSchoolDetails();
    await fetchFeedData();
    await fetchStaffData();
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

/* --- FETCHERS --- */

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

async function fetchStaffData() {
    try {
        const res = await fetch(`${CONFIG.dataPath}staff.json?t=${Date.now()}`);
        if(res.ok) {
            let data = await res.json();
            data = data.filter(s => {
                const dt = sessionStorage.getItem('sync_del_staff_' + s.id);
                if (dt && (Date.now() - parseInt(dt) > 60000)) return false; 
                return true;
            });
            state.staffData = data;
        } else {
            state.staffData = []; // File might not exist yet
        }
        renderStaff();
    } catch (e) { console.error(e); state.staffData = []; renderStaff(); }
}

/* --- POLLING --- */

function startLockPolling() {
    if (window.lockInterval) clearInterval(window.lockInterval);
    window.lockInterval = setInterval(() => {
        let fetchNeeded = false;
        let renderNeeded = false;
        
        // Check Feed Locks
        state.feedData.forEach(p => {
            const et = sessionStorage.getItem('sync_edit_' + p.id);
            if (et && Date.now() - parseInt(et) > 60000) { sessionStorage.removeItem('sync_edit_' + p.id); fetchNeeded = true; }
        });
        const prevFeedLen = state.feedData.length;
        state.feedData = state.feedData.filter(p => {
            const dt = sessionStorage.getItem('sync_del_' + p.id);
            if (dt && Date.now() - parseInt(dt) > 60000) { sessionStorage.removeItem('sync_del_' + p.id); return false; }
            return true;
        });
        if (prevFeedLen !== state.feedData.length) renderNeeded = true;

        // Check Staff Locks
        state.staffData.forEach(s => {
            const et = sessionStorage.getItem('sync_edit_staff_' + s.id);
            if (et && Date.now() - parseInt(et) > 60000) { sessionStorage.removeItem('sync_edit_staff_' + s.id); fetchNeeded = true; }
        });
        const prevStaffLen = state.staffData.length;
        state.staffData = state.staffData.filter(s => {
            const dt = sessionStorage.getItem('sync_del_staff_' + s.id);
            if (dt && Date.now() - parseInt(dt) > 60000) { sessionStorage.removeItem('sync_del_staff_' + s.id); return false; }
            return true;
        });
        if (prevStaffLen !== state.staffData.length) renderNeeded = true;
        
        if (fetchNeeded) { fetchFeedData(); fetchStaffData(); } 
        else if (renderNeeded) { renderFeed(); renderStaff(); }
    }, 5000); 
}

/* --- RENDERERS --- */

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

function renderAdminUI() {
    if (state.isAdmin && state.schoolDetails && state.schoolDetails.categories) {
        document.getElementById('edit-category-container').innerHTML = state.schoolDetails.categories.map(c => 
            `<label><input type="checkbox" class="cat-checkbox" value="${c}"> ${c}</label>`
        ).join('');
    }
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

function renderStaff() {
    const loader = document.getElementById('staff-loader');
    if(loader) loader.style.display = 'none';
    DOM.staffGrid.innerHTML = "";

    if (state.staffData.length === 0) {
        DOM.staffGrid.innerHTML = `<div class="loader" style="grid-column: 1/-1;">No staff records found.</div>`;
        return;
    }

    state.staffData.forEach(staff => {
        const isEditLocked = sessionStorage.getItem('sync_edit_staff_' + staff.id) && (Date.now() - parseInt(sessionStorage.getItem('sync_edit_staff_' + staff.id)) <= 60000);
        const isDelLocked = sessionStorage.getItem('sync_del_staff_' + staff.id) && (Date.now() - parseInt(sessionStorage.getItem('sync_del_staff_' + staff.id)) <= 60000);
        const isLocked = isEditLocked || isDelLocked;

        const card = document.createElement('div');
        card.className = `staff-card ${isLocked ? 'sync-locked' : ''}`;
        
        let html = `
            <div class="staff-photo-container">
                <img src="${staff.photo || 'media/default_avatar.png'}" alt="${staff.name}">
            </div>
            <h3 class="staff-name">${staff.name}</h3>
            <div class="staff-designation">${staff.designation}</div>
            <div class="staff-subject">${staff.subject || ''}</div>
        `;

        if (state.isAdmin) {
            html += `<div class="admin-actions">
                <button class="btn-secondary btn-small" ${isLocked ? 'disabled' : ''} onclick="window.editStaff('${staff.id}')">${isEditLocked ? '⏳ Syncing...' : '✏️ Edit'}</button>
                <button class="btn-secondary btn-small" style="color: #dc2626; border-color: #dc2626;" ${isLocked ? 'disabled' : ''} onclick="window.deleteStaff('${staff.id}')">${isDelLocked ? '⏳ Deleting...' : '🗑️ Delete'}</button>
            </div>`;
        }
        card.innerHTML = html;
        DOM.staffGrid.appendChild(card);
    });
}

/* --- FEED INTERACTIONS --- */

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

function renderMediaPreview() {
    DOM.mediaPreview.innerHTML = state.currentEditingMedia.length ? "" : "No existing images.";
    state.currentEditingMedia.forEach((path, idx) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.innerHTML = `<img src="${path}"><button type="button" class="remove-img-btn" onclick="window.removeExistingImage(${idx})">×</button>`;
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
        await githubRequest(fPath, 'PUT', { message: `Deleted post ${postID}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))), sha: fData.sha });
        
        sessionStorage.setItem('sync_del_' + postID, Date.now().toString());
        // Phantom Update
        state.feedData = state.feedData.filter(p => p.id !== postID);
        renderFeed();
    } catch (err) { alert("Error deleting post: " + err.message); }
};

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
            alert("Post deleted elsewhere. Refreshing."); location.reload(); return;
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

        // Gallery Master Fix: Combine existing (undeleted) array with new uploads
        const finalMedia = [...state.currentEditingMedia, ...newMediaPaths];

        const postObj = {
            id: pid, timestamp: isEditing ? content.find(p => p.id === pid).timestamp : Date.now(), 
            status: document.querySelector('input[name="edit-status"]:checked').value,
            is_pinned: document.getElementById('edit-pinned').checked,
            categories: Array.from(document.querySelectorAll('.cat-checkbox:checked')).map(c => c.value),
            title: document.getElementById('edit-title').value, content: document.getElementById('edit-content').innerHTML,
            media: finalMedia
        };

        if (isEditing) { const idx = content.findIndex(p => p.id === pid); content[idx] = postObj; } 
        else { content.unshift(postObj); }

        await githubRequest(fPath, 'PUT', { message: `${isEditing ? 'Updated' : 'Added'} post`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        
        // Phantom Entry / Lock Setup
        sessionStorage.setItem('sync_edit_' + pid, Date.now().toString());
        DOM.editorModal.style.display = 'none';
        saveBtn.disabled = false; saveBtn.innerText = "Save & Publish";
        
        // Inject into local state instantly
        if(isEditing) { const idx = state.feedData.findIndex(p => p.id === pid); state.feedData[idx] = postObj; }
        else { state.feedData.unshift(postObj); }
        state.feedData.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.timestamp - a.timestamp));
        renderFeed();

    } catch (err) { alert("Error: " + err.message); saveBtn.disabled = false; saveBtn.innerText = "Save & Publish"; }
}

/* --- STAFF INTERACTIONS --- */

function renderStaffPreview() {
    DOM.staffPreview.innerHTML = state.currentEditingStaffPhoto ? 
        `<div class="preview-item"><img src="${state.currentEditingStaffPhoto}"><button type="button" class="remove-img-btn" onclick="window.removeStaffImage()">×</button></div>` 
        : "No existing photo.";
}

window.removeStaffImage = function() {
    state.currentEditingStaffPhoto = null;
    renderStaffPreview();
};

window.editStaff = function(staffID) {
    const staff = state.staffData.find(s => s.id === staffID);
    if (!staff) return;
    DOM.staffForm.reset();
    document.getElementById('edit-staff-id').value = staff.id;
    document.getElementById('staff-editor-title').innerText = "Edit Staff Member";
    document.getElementById('edit-staff-name').value = staff.name || "";
    document.getElementById('edit-staff-designation').value = staff.designation || "";
    document.getElementById('edit-staff-subject').value = staff.subject || "";
    state.currentEditingStaffPhoto = staff.photo || null;
    renderStaffPreview();
    DOM.staffModal.style.display = "flex";
};

window.deleteStaff = async function(staffID) {
    if (!confirm("Are you sure you want to permanently delete this staff record?")) return;
    try {
        const fPath = `${CONFIG.dataPath}staff.json`;
        const fData = await githubRequest(fPath);
        let content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const newContent = content.filter(s => s.id !== staffID);
        await githubRequest(fPath, 'PUT', { message: `Deleted staff ${staffID}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))), sha: fData.sha });
        
        sessionStorage.setItem('sync_del_staff_' + staffID, Date.now().toString());
        state.staffData = state.staffData.filter(s => s.id !== staffID);
        renderStaff();
    } catch (err) { alert("Error deleting staff: " + err.message); }
};

async function handleStaffSave(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-staff-save');
    saveBtn.innerText = "Writing to Repository..."; saveBtn.disabled = true;

    try {
        const editID = document.getElementById('edit-staff-id').value;
        const isEditing = !!editID;
        const sid = isEditing ? editID : `staff_${Date.now()}`;
        
        const fPath = `${CONFIG.dataPath}staff.json`;
        let fData; try { fData = await githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));

        const fileInput = document.getElementById('edit-staff-photo');
        let finalPhoto = state.currentEditingStaffPhoto;
        
        if (fileInput.files.length > 0) {
            saveBtn.innerText = `Uploading Photo...`;
            const b64 = await processImage(fileInput.files[0]);
            const fname = `staff_${sid}_${Date.now()}.jpg`;
            await githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: `Staff photo upload`, content: b64 });
            finalPhoto = `${CONFIG.mediaPath}${fname}`;
        }

        const staffObj = {
            id: sid,
            name: document.getElementById('edit-staff-name').value,
            designation: document.getElementById('edit-staff-designation').value,
            subject: document.getElementById('edit-staff-subject').value,
            photo: finalPhoto
        };

        if (isEditing) { const idx = content.findIndex(s => s.id === sid); if(idx !== -1) content[idx] = staffObj; } 
        else { content.push(staffObj); } // Add to bottom

        await githubRequest(fPath, 'PUT', { message: `${isEditing ? 'Updated' : 'Added'} staff`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        
        sessionStorage.setItem('sync_edit_staff_' + sid, Date.now().toString());
        DOM.staffModal.style.display = 'none';
        saveBtn.disabled = false; saveBtn.innerText = "Save Record";
        
        // Phantom Staff Entry
        if(isEditing) { const idx = state.staffData.findIndex(s => s.id === sid); state.staffData[idx] = staffObj; }
        else { state.staffData.push(staffObj); }
        renderStaff();

    } catch (err) { alert("Error: " + err.message); saveBtn.disabled = false; saveBtn.innerText = "Save Record"; }
}

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

function checkAdminStatus() { 
    if (state.pat) { 
        state.isAdmin = true; DOM.adminBtn.innerText = "Logout Admin"; DOM.adminBtn.style.color = "var(--accent-color)"; 
        if(DOM.adminPanel) DOM.adminPanel.style.display = "block";
        if(DOM.staffAdminPanel) DOM.staffAdminPanel.style.display = "block";
    } 
}

function setupEventListeners() {
    // Auth
    DOM.adminBtn.onclick = () => state.isAdmin ? (sessionStorage.removeItem('github_pat'), location.reload()) : (DOM.authModal.style.display='flex');
    DOM.authCancel.onclick = () => DOM.authModal.style.display='none';
    DOM.authSubmit.onclick = () => { const t = DOM.authInput.value.trim(); if(t.startsWith('ghp_') || t.startsWith('github_pat_')){ sessionStorage.setItem('github_pat', t); location.reload(); } };
    
    // Tabs
    DOM.tabFeed.onclick = () => { DOM.tabFeed.classList.add('active'); DOM.tabPeople.classList.remove('active'); DOM.feedColumn.style.display = 'block'; DOM.peopleColumn.style.display = 'none'; };
    DOM.tabPeople.onclick = () => { DOM.tabPeople.classList.add('active'); DOM.tabFeed.classList.remove('active'); DOM.peopleColumn.style.display = 'block'; DOM.feedColumn.style.display = 'none'; };

    // Post Editor
    DOM.editorCancel.onclick = () => DOM.editorModal.style.display='none';
    if(DOM.createBtn) {
        DOM.createBtn.onclick = () => {
            DOM.editorForm.reset(); document.getElementById('edit-post-id').value = ""; document.getElementById('edit-content').innerHTML = ""; 
            state.currentEditingMedia = []; renderMediaPreview(); document.getElementById('editor-title').innerText = "Create New Post";
            DOM.editorModal.style.display = "flex";
        };
    }
    DOM.editorForm.onsubmit = handlePostSave;

    // Staff Editor
    DOM.staffCancel.onclick = () => DOM.staffModal.style.display='none';
    if(DOM.addStaffBtn) {
        DOM.addStaffBtn.onclick = () => {
            DOM.staffForm.reset(); document.getElementById('edit-staff-id').value = ""; 
            state.currentEditingStaffPhoto = null; renderStaffPreview(); document.getElementById('staff-editor-title').innerText = "Add Staff Member";
            DOM.staffModal.style.display = "flex";
        };
    }
    DOM.staffForm.onsubmit = handleStaffSave;
}

init();
