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
    // Structural
    tickerContainer: document.getElementById('urgent-ticker-container'),
    tickerText: document.getElementById('ticker-text'),
    logo: document.getElementById('school-logo'),
    name: document.getElementById('school-name'),
    udise: document.getElementById('udise-code'),
    mission: document.getElementById('mission-statement'),
    
    // Tabs & Panels
    tabFeed: document.getElementById('tab-feed'),
    tabPeople: document.getElementById('tab-people'),
    feedColumn: document.getElementById('feed-column'),
    peopleColumn: document.getElementById('people-column'),
    adminPanel: document.getElementById('admin-control-panel'),
    staffAdminPanel: document.getElementById('admin-staff-panel'),
    
    // Ticker Editor
    tickerBtn: document.getElementById('btn-edit-ticker'),
    tickerModal: document.getElementById('modal-ticker'),
    tickerInput: document.getElementById('input-ticker-text'),
    tickerActive: document.getElementById('input-ticker-active'),
    tickerSave: document.getElementById('btn-ticker-save'),
    tickerCancel: document.getElementById('btn-ticker-cancel'),
    
    // Feed Elements
    createBtn: document.getElementById('btn-create-post'),
    feedContainer: document.getElementById('feed-column'),
    editorModal: document.getElementById('modal-editor'),
    editorForm: document.getElementById('post-editor-form'),
    mediaPreview: document.getElementById('edit-preview-container'),
    
    // Staff Elements
    addStaffBtn: document.getElementById('btn-add-staff'),
    staffGrid: document.getElementById('staff-grid'),
    staffModal: document.getElementById('modal-staff'),
    staffForm: document.getElementById('staff-editor-form'),
    staffPreview: document.getElementById('staff-preview-container'),
    
    // System
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

/* --- FETCHERS & SYNC LOGIC --- */

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
        }
        renderStaff();
    } catch (e) { console.error(e); }
}

function startLockPolling() {
    if (window.lockInterval) clearInterval(window.lockInterval);
    window.lockInterval = setInterval(() => {
        let fetchNeeded = false;
        let renderNeeded = false;
        
        // Check Ticker Lock
        const tt = sessionStorage.getItem('sync_ticker');
        if (tt && Date.now() - parseInt(tt) > 60000) { sessionStorage.removeItem('sync_ticker'); fetchNeeded = true; }

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

        if (fetchNeeded) { fetchSchoolDetails(); fetchFeedData(); fetchStaffData(); } 
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

    // Render Ticker
    const isTickerLocked = sessionStorage.getItem('sync_ticker') && (Date.now() - parseInt(sessionStorage.getItem('sync_ticker')) <= 60000);
    const ticker = state.schoolDetails.alert_ticker || { message: "", is_active: false };
    
    if (ticker.is_active || isTickerLocked) {
        DOM.tickerContainer.style.display = 'flex';
        DOM.tickerText.innerText = ticker.message;
        if (isTickerLocked) DOM.tickerContainer.classList.add('sync-locked');
        else DOM.tickerContainer.classList.remove('sync-locked');
    } else {
        DOM.tickerContainer.style.display = 'none';
    }
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
    Array.from(DOM.feedContainer.children).forEach(child => { if (child.id !== 'admin-control-panel') child.remove(); });
    if (state.feedData.length === 0) {
        const msg = document.createElement('div'); msg.className = "loader"; msg.innerText = "No posts available yet.";
        DOM.feedContainer.appendChild(msg); return;
    }
    state.feedData.forEach(post => {
        const isLocked = (sessionStorage.getItem('sync_edit_' + post.id) || sessionStorage.getItem('sync_del_' + post.id)) && (Date.now() - parseInt(sessionStorage.getItem('sync_edit_' + post.id) || sessionStorage.getItem('sync_del_' + post.id)) <= 60000);
        const card = document.createElement('article'); card.className = `post-card ${post.is_pinned ? 'pinned' : ''} ${isLocked ? 'sync-locked' : ''}`;
        card.innerHTML = `
            ${post.is_pinned ? '<span class="pin-badge">📌 Pinned</span>' : ''}
            <div class="post-header"><div class="tags-container">${post.categories ? post.categories.map(c => `<span class="category-tag">#${c}</span>`).join('') : ''}</div><span class="post-date">• ${new Date(post.timestamp).toLocaleDateString('en-IN')}</span></div>
            <h2 class="post-title-en">${post.title || "Untitled"}</h2><div class="post-content">${post.content || ""}</div>
            ${post.media && post.media.length ? `<div class="post-media">${post.media.map((m, idx) => `<img src="${m}" class="slider-img ${idx === 0 ? 'active' : ''}">`).join('')}${post.media.length > 1 ? `<button class="slider-btn" style="left:0" onclick="changeSlide(this,-1)">&#10094;</button><button class="slider-btn" style="right:0" onclick="changeSlide(this,1)">&#10095;</button><div class="slider-counter">1 / ${post.media.length}</div>` : ''}</div>` : ''}
            ${state.isAdmin ? `<div class="admin-actions"><button class="btn-secondary btn-small" ${isLocked ? 'disabled' : ''} onclick="window.editPost('${post.id}')">✏️ Edit</button><button class="btn-secondary btn-small" style="color:#dc2626;" ${isLocked ? 'disabled' : ''} onclick="window.deletePost('${post.id}')">🗑️ Delete</button></div>` : ''}
        `;
        DOM.feedContainer.appendChild(card);
    });
}

function renderStaff() {
    const loader = document.getElementById('staff-loader'); if(loader) loader.style.display = 'none';
    DOM.staffGrid.innerHTML = state.staffData.length ? "" : `<div class="loader" style="grid-column: 1/-1;">No staff records found.</div>`;
    state.staffData.forEach(staff => {
        const isLocked = (sessionStorage.getItem('sync_edit_staff_' + staff.id) || sessionStorage.getItem('sync_del_staff_' + staff.id)) && (Date.now() - parseInt(sessionStorage.getItem('sync_edit_staff_' + staff.id) || sessionStorage.getItem('sync_del_staff_' + staff.id)) <= 60000);
        const card = document.createElement('div'); card.className = `staff-card ${isLocked ? 'sync-locked' : ''}`;
        card.innerHTML = `<div class="staff-photo-container"><img src="${staff.photo || 'media/default_avatar.png'}"></div><h3 class="staff-name">${staff.name}</h3><div class="staff-designation">${staff.designation}</div><div class="staff-subject">${staff.subject || ''}</div>${state.isAdmin ? `<div class="admin-actions"><button class="btn-secondary btn-small" onclick="window.editStaff('${staff.id}')">✏️ Edit</button><button class="btn-secondary btn-small" style="color:#dc2626;" onclick="window.deleteStaff('${staff.id}')">🗑️ Delete</button></div>` : ''}`;
        DOM.staffGrid.appendChild(card);
    });
}

/* --- ACTION HANDLERS --- */

async function handleTickerSave() {
    const saveBtn = DOM.tickerSave; saveBtn.innerText = "Syncing..."; saveBtn.disabled = true;
    try {
        const fPath = `${CONFIG.dataPath}school_details.json`;
        const fData = await githubRequest(fPath);
        let content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        content.alert_ticker = { message: DOM.tickerInput.value, is_active: DOM.tickerActive.checked };
        await githubRequest(fPath, 'PUT', { message: `Updated ticker`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_ticker', Date.now().toString());
        state.schoolDetails = content; renderHero();
        DOM.tickerModal.style.display = 'none';
    } catch (err) { alert(err.message); } finally { saveBtn.innerText = "Update Ticker"; saveBtn.disabled = false; }
}

async function handlePostSave(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-editor-save'); saveBtn.innerText = "Uploading..."; saveBtn.disabled = true;
    try {
        const editPostID = document.getElementById('edit-post-id').value;
        const isEditing = !!editPostID; const pid = isEditing ? editPostID : `post_${Date.now()}`;
        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        let fData; try { fData = await githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));

        const files = document.getElementById('edit-media').files;
        let newMediaPaths = [];
        for (let i = 0; i < files.length; i++) {
            const b64 = await processImage(files[i]);
            const fname = `${CONFIG.currentYear}_${pid}_pic_${i}_${Date.now()}.jpg`;
            await githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: `Img`, content: b64 });
            newMediaPaths.push(`${CONFIG.mediaPath}${fname}`);
        }
        const postObj = { id: pid, timestamp: isEditing ? content.find(p => p.id === pid).timestamp : Date.now(), status: document.querySelector('input[name="edit-status"]:checked').value, is_pinned: document.getElementById('edit-pinned').checked, categories: Array.from(document.querySelectorAll('.cat-checkbox:checked')).map(c => c.value), title: document.getElementById('edit-title').value, content: document.getElementById('edit-content').innerHTML, media: [...state.currentEditingMedia, ...newMediaPaths] };
        if (isEditing) { const idx = content.findIndex(p => p.id === pid); content[idx] = postObj; } else { content.unshift(postObj); }
        await githubRequest(fPath, 'PUT', { message: `Post update`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_edit_' + pid, Date.now().toString());
        DOM.editorModal.style.display = 'none';
        if(isEditing) { const idx = state.feedData.findIndex(p => p.id === pid); state.feedData[idx] = postObj; } else { state.feedData.unshift(postObj); }
        renderFeed();
    } catch (err) { alert(err.message); } finally { saveBtn.disabled = false; saveBtn.innerText = "Save & Publish"; }
}

async function handleStaffSave(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-staff-save'); saveBtn.innerText = "Syncing..."; saveBtn.disabled = true;
    try {
        const editID = document.getElementById('edit-staff-id').value;
        const sid = editID || `staff_${Date.now()}`;
        const fPath = `${CONFIG.dataPath}staff.json`;
        let fData; try { fData = await githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));

        const fileInput = document.getElementById('edit-staff-photo');
        let finalPhoto = state.currentEditingStaffPhoto;
        if (fileInput.files.length > 0) {
            const b64 = await processImage(fileInput.files[0]);
            const fname = `staff_${sid}_${Date.now()}.jpg`;
            await githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: `Staff photo`, content: b64 });
            finalPhoto = `${CONFIG.mediaPath}${fname}`;
        }
        const staffObj = { id: sid, name: document.getElementById('edit-staff-name').value, designation: document.getElementById('edit-staff-designation').value, subject: document.getElementById('edit-staff-subject').value, photo: finalPhoto };
        if (editID) { const idx = content.findIndex(s => s.id === sid); if(idx !== -1) content[idx] = staffObj; } else { content.push(staffObj); }
        await githubRequest(fPath, 'PUT', { message: `Staff update`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_edit_staff_' + sid, Date.now().toString());
        DOM.staffModal.style.display = 'none';
        if(editID) { const idx = state.staffData.findIndex(s => s.id === sid); state.staffData[idx] = staffObj; } else { state.staffData.push(staffObj); }
        renderStaff();
    } catch (err) { alert(err.message); } finally { saveBtn.disabled = false; saveBtn.innerText = "Save Record"; }
}

/* --- UTILITIES & SYSTEM --- */

async function processImage(file) {
    return new Promise(res => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'); const scale = Math.min(1, 720 / img.width);
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
        state.isAdmin = true; DOM.adminBtn.innerText = "Logout Admin"; 
        DOM.adminPanel.style.display = DOM.staffAdminPanel.style.display = "block";
    } 
}

function setupEventListeners() {
    DOM.adminBtn.onclick = () => state.isAdmin ? (sessionStorage.clear(), location.reload()) : (DOM.authModal.style.display='flex');
    DOM.authCancel.onclick = () => DOM.authModal.style.display='none';
    DOM.authSubmit.onclick = () => { const t = DOM.authInput.value.trim(); if(t.length > 20){ sessionStorage.setItem('github_pat', t); location.reload(); } };
    DOM.tabFeed.onclick = () => { DOM.tabFeed.classList.add('active'); DOM.tabPeople.classList.remove('active'); DOM.feedColumn.style.display = 'block'; DOM.peopleColumn.style.display = 'none'; };
    DOM.tabPeople.onclick = () => { DOM.tabPeople.classList.add('active'); DOM.tabFeed.classList.remove('active'); DOM.peopleColumn.style.display = 'block'; DOM.feedColumn.style.display = 'none'; };
    
    DOM.tickerBtn.onclick = () => { DOM.tickerInput.value = state.schoolDetails.alert_ticker?.message || ""; DOM.tickerActive.checked = state.schoolDetails.alert_ticker?.is_active || false; DOM.tickerModal.style.display = 'flex'; };
    DOM.tickerCancel.onclick = () => DOM.tickerModal.style.display = 'none';
    DOM.tickerSave.onclick = handleTickerSave;

    DOM.editorCancel.onclick = () => DOM.editorModal.style.display='none';
    DOM.createBtn.onclick = () => { DOM.editorForm.reset(); document.getElementById('edit-post-id').value = ""; document.getElementById('edit-content').innerHTML = ""; state.currentEditingMedia = []; renderMediaPreview(); DOM.editorModal.style.display = "flex"; };
    DOM.editorForm.onsubmit = handlePostSave;

    DOM.staffCancel.onclick = () => DOM.staffModal.style.display='none';
    DOM.addStaffBtn.onclick = () => { DOM.staffForm.reset(); document.getElementById('edit-staff-id').value = ""; state.currentEditingStaffPhoto = null; renderStaffPreview(); DOM.staffModal.style.display = "flex"; };
    DOM.staffForm.onsubmit = handleStaffSave;
}

// Global functions for window access
window.editPost = (id) => { const p = state.feedData.find(x => x.id === id); if(!p) return; document.getElementById('edit-post-id').value = p.id; document.getElementById('edit-title').value = p.title; document.getElementById('edit-content').innerHTML = p.content; state.currentEditingMedia = p.media || []; renderMediaPreview(); DOM.editorModal.style.display = 'flex'; };
window.editStaff = (id) => { const s = state.staffData.find(x => x.id === id); if(!s) return; document.getElementById('edit-staff-id').value = s.id; document.getElementById('edit-staff-name').value = s.name; document.getElementById('edit-staff-designation').value = s.designation; document.getElementById('edit-staff-subject').value = s.subject; state.currentEditingStaffPhoto = s.photo; renderStaffPreview(); DOM.staffModal.style.display = 'flex'; };
window.removeStaffImage = () => { state.currentEditingStaffPhoto = null; renderStaffPreview(); };

init();
