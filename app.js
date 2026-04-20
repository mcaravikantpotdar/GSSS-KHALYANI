/* ==========================================================================
   CONFIG & STATE
   ========================================================================== */
const CONFIG = {
    githubOwner: "mcaravikantpotdar",
    githubRepo: "GSSS-KHALYANI",
    githubBranch: "main",
    currentYear: "2026-27",
    dataPath: "data/",
    mediaPath: "media/"
};

let state = {
    schoolDetails: null, 
    feedData: [], 
    staffData: [],
    isAdmin: false,
    pat: sessionStorage.getItem('github_pat') || null,
    currentEditingMedia: [],
    currentEditingStaffPhoto: null,
    auditorTimer: null
};

/* ==========================================================================
   GLOBAL BINDINGS
   ========================================================================== */
window.execCommand = (cmd) => { document.execCommand(cmd, false, null); document.getElementById('edit-content').focus(); };
window.insertTable = () => { document.execCommand('insertHTML', false, `<table border="1" style="width:100%; border-collapse:collapse;"><tr><td>Data</td><td>Data</td></tr></table><p><br></p>`); };

window.changeSlide = (btn, dir) => {
    const container = btn.closest('.post-media');
    const imgs = container.querySelectorAll('.slider-img');
    let idx = Array.from(imgs).findIndex(img => img.classList.contains('active'));
    imgs[idx].classList.remove('active');
    let nIdx = (idx + dir + imgs.length) % imgs.length;
    imgs[nIdx].classList.add('active');
};

/* ==========================================================================
   SMART AUDITOR ENGINE (Wait 20s, then Poll 10s)
   ========================================================================== */
window.addToAuditor = (type, id, expectedData = null) => {
    const queue = JSON.parse(sessionStorage.getItem('auditor_queue') || '{}');
    queue[id] = { type, data: expectedData, timestamp: Date.now(), attempts: 0 };
    sessionStorage.setItem('auditor_queue', JSON.stringify(queue));
    window.ensureAuditorIsRunning();
};

window.ensureAuditorIsRunning = () => {
    if (state.auditorTimer) return;
    state.auditorTimer = setInterval(window.auditVerificationLoop, 10000);
};

window.auditVerificationLoop = async () => {
    const queue = JSON.parse(sessionStorage.getItem('auditor_queue') || '{}');
    const ids = Object.keys(queue);
    
    if (ids.length === 0) {
        clearInterval(state.auditorTimer);
        state.auditorTimer = null;
        return;
    }

    let changed = false;
    for (const id of ids) {
        const item = queue[id];
        if ((Date.now() - item.timestamp) < 20000 && item.attempts === 0) continue;

        item.attempts++;
        const isVerified = await window.verifyRemoteState(item, id);

        if (isVerified) {
            delete queue[id];
            changed = true;
        }
    }

    if (changed) {
        sessionStorage.setItem('auditor_queue', JSON.stringify(queue));
        await window.refreshAllData();
    }
};

window.verifyRemoteState = async (item, id) => {
    try {
        const t = Date.now();
        if (item.type === 'ticker') {
            const res = await fetch(`${CONFIG.dataPath}school_details.json?t=${t}`);
            const remote = await res.json();
            return JSON.stringify(remote.alert_ticker) === JSON.stringify(item.data);
        }
        if (item.type === 'post') {
            const res = await fetch(`${CONFIG.dataPath}${CONFIG.currentYear}.json?t=${t}`);
            const remote = await res.json();
            const found = remote.find(p => p.id === id);
            return item.data ? JSON.stringify(found) === JSON.stringify(item.data) : !found;
        }
        if (item.type === 'staff') {
            const res = await fetch(`${CONFIG.dataPath}staff.json?t=${t}`);
            const remote = await res.json();
            const found = remote.find(s => s.id === id);
            return item.data ? JSON.stringify(found) === JSON.stringify(item.data) : !found;
        }
    } catch (e) { return false; }
    return false;
};

/* ==========================================================================
   API & FETCHING
   ========================================================================== */
window.githubRequest = async (path, method = 'GET', body = null) => {
    const url = `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/contents/${path}`;
    const headers = { 'Authorization': `token ${state.pat}`, 'Accept': 'application/vnd.github.v3+json' };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
};

window.refreshAllData = async () => {
    await window.fetchSchoolDetails();
    await window.fetchFeedData();
    await window.fetchStaffData();
};

window.fetchSchoolDetails = async () => {
    try {
        const res = await fetch(`${CONFIG.dataPath}school_details.json?t=${Date.now()}`);
        state.schoolDetails = await res.json();
        window.renderHero();
        window.renderSidebar();
    } catch (e) { console.error(e); }
};

window.fetchFeedData = async () => {
    try {
        const res = await fetch(`${CONFIG.dataPath}${CONFIG.currentYear}.json?t=${Date.now()}`);
        let data = await res.json();
        if (!state.isAdmin) data = data.filter(p => p.status === "published");
        state.feedData = data.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.timestamp - a.timestamp));
        window.renderFeed();
    } catch (e) { console.error(e); }
};

window.fetchStaffData = async () => {
    try {
        const res = await fetch(`${CONFIG.dataPath}staff.json?t=${Date.now()}`);
        if(res.ok) state.staffData = await res.json();
        window.renderStaff();
    } catch (e) { console.error(e); }
};

/* ==========================================================================
   RENDERERS (FIXED LOADERS)
   ========================================================================== */
window.isLocked = (id) => {
    const queue = JSON.parse(sessionStorage.getItem('auditor_queue') || '{}');
    return !!queue[id];
};

window.renderHero = () => {
    const d = state.schoolDetails; if(!d) return;
    document.getElementById('school-name').innerText = d.school_name;
    document.getElementById('udise-code').innerText = `UDISE: ${d.udise_code}`;
    document.getElementById('mission-statement').innerText = d.mission_statement;
    const logo = document.getElementById('school-logo');
    if(d.logo_path) { logo.src = d.logo_path; logo.style.display = 'block'; }

    const tickerLocked = window.isLocked('ticker_global');
    const ticker = d.alert_ticker || { message: "", is_active: false };
    const container = document.getElementById('urgent-ticker-container');
    if (ticker.is_active || tickerLocked) {
        container.style.display = 'flex';
        document.getElementById('ticker-text').innerText = ticker.message;
        container.className = `ticker-wrapper ${tickerLocked ? 'sync-locked' : ''}`;
    } else { container.style.display = 'none'; }
};

window.renderSidebar = () => {
    const list = document.getElementById('quick-links-list');
    if(state.schoolDetails) list.innerHTML = state.schoolDetails.categories.map(c => `<li><a href="#">${c}</a></li>`).join('');
};

window.renderFeed = () => {
    const container = document.getElementById('feed-column');
    // FIXED: Protect the loader from being deleted
    Array.from(container.children).forEach(c => { 
        if(c.id !== 'admin-control-panel' && c.id !== 'feed-loader') c.remove(); 
    });

    state.feedData.forEach(post => {
        const locked = window.isLocked(post.id);
        const card = document.createElement('article');
        card.className = `post-card ${post.is_pinned ? 'pinned' : ''} ${locked ? 'sync-locked' : ''}`;
        card.innerHTML = `
            <div class="post-header"><span class="post-date">${new Date(post.timestamp).toLocaleDateString()}</span></div>
            <h2>${post.title}</h2><div class="post-content">${post.content}</div>
            ${post.media && post.media.length ? `<div class="post-media">${post.media.map((m, i) => `<img src="${m}" class="slider-img ${i===0?'active':''}">`).join('')}${post.media.length > 1 ? `<button class="slider-btn" style="left:0" onclick="window.changeSlide(this,-1)">&#10094;</button><button class="slider-btn" style="right:0" onclick="window.changeSlide(this,1)">&#10095;</button>` : ''}</div>` : ''}
            ${state.isAdmin ? `<div class="admin-actions"><button class="btn-secondary" onclick="window.editPost('${post.id}')">✏️ Edit</button><button class="btn-secondary" style="color:red" onclick="window.deletePost('${post.id}')">🗑️ Delete</button></div>` : ''}
        `;
        container.appendChild(card);
    });
    // Safety check for loader
    const loader = document.getElementById('feed-loader');
    if(loader) loader.style.display = 'none';
};

window.renderStaff = () => {
    const grid = document.getElementById('staff-grid'); 
    if(grid) grid.innerHTML = "";
    state.staffData.forEach(s => {
        const locked = window.isLocked(s.id);
        const card = document.createElement('div'); card.className = `staff-card ${locked ? 'sync-locked' : ''}`;
        card.innerHTML = `<div class="staff-photo-container"><img src="${s.photo || 'media/default.png'}"></div><h3>${s.name}</h3><div class="staff-designation">${s.designation}</div><div>${s.subject || ''}</div>${state.isAdmin ? `<div class="admin-actions"><button class="btn-secondary" onclick="window.editStaff('${s.id}')">✏️ Edit</button><button class="btn-secondary" style="color:red" onclick="window.deleteStaff('${s.id}')">🗑️ Delete</button></div>` : ''}`;
        if(grid) grid.appendChild(card);
    });
    const loader = document.getElementById('staff-loader');
    if(loader) loader.style.display = 'none';
};

/* ==========================================================================
   CRUD & GALLERY (ZERO-LOSS)
   ========================================================================== */
window.removeExistingImage = (idx) => { state.currentEditingMedia.splice(idx, 1); window.renderMediaPreview(); };
window.renderMediaPreview = () => {
    const c = document.getElementById('edit-preview-container'); if(!c) return;
    c.innerHTML = "";
    state.currentEditingMedia.forEach((p, i) => {
        const div = document.createElement('div'); div.className = 'preview-item';
        div.innerHTML = `<img src="${p}"><button type="button" class="remove-img-btn" onclick="window.removeExistingImage(${i})">×</button>`;
        c.appendChild(div);
    });
};

window.removeStaffImage = () => { state.currentEditingStaffPhoto = null; window.renderStaffPreview(); };
window.renderStaffPreview = () => {
    const c = document.getElementById('staff-preview-container'); if(!c) return;
    c.innerHTML = state.currentEditingStaffPhoto ? `<div class="preview-item"><img src="${state.currentEditingStaffPhoto}"><button type="button" class="remove-img-btn" onclick="window.removeStaffImage()">×</button></div>` : "None";
};

window.processImage = async (file) => {
    return new Promise(res => {
        const r = new FileReader(); r.onload = e => {
            const i = new Image(); i.onload = () => {
                const cvs = document.createElement('canvas'); const s = Math.min(1, 720/i.width);
                cvs.width = i.width*s; cvs.height = i.height*s;
                cvs.getContext('2d').drawImage(i, 0, 0, cvs.width, cvs.height);
                res(cvs.toDataURL('image/jpeg', 0.85).split(',')[1]);
            }; i.src = e.target.result;
        }; r.readAsDataURL(file);
    });
};

window.editPost = (id) => {
    const p = state.feedData.find(x => x.id === id); if(!p) return;
    document.getElementById('edit-post-id').value = p.id;
    document.getElementById('edit-title').value = p.title;
    document.getElementById('edit-content').innerHTML = p.content;
    state.currentEditingMedia = [...(p.media || [])]; window.renderMediaPreview();
    document.getElementById('modal-editor').style.display = 'flex';
};

window.deletePost = async (id) => {
    if(!confirm("Delete?")) return;
    const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
    const fData = await window.githubRequest(fPath);
    const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
    const newContent = content.filter(x => x.id !== id);
    await window.githubRequest(fPath, 'PUT', { message: 'Del', content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))), sha: fData.sha });
    window.addToAuditor('post', id, null);
    state.feedData = state.feedData.filter(x => x.id !== id); window.renderFeed();
};

window.handlePostSave = async (e) => {
    e.preventDefault(); const btn = document.getElementById('btn-editor-save'); btn.innerText = "Syncing..."; btn.disabled = true;
    try {
        const id = document.getElementById('edit-post-id').value || `post_${Date.now()}`;
        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        let fData; try { fData = await window.githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const files = document.getElementById('edit-media').files;
        let newPaths = [];
        for (let i=0; i<files.length; i++) {
            const b64 = await window.processImage(files[i]);
            const fname = `${id}_${i}_${Date.now()}.jpg`;
            await window.githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: 'Img', content: b64 });
            newPaths.push(`${CONFIG.mediaPath}${fname}`);
        }
        const obj = { id, timestamp: Date.now(), title: document.getElementById('edit-title').value, status: document.querySelector('input[name="edit-status"]:checked').value, is_pinned: document.getElementById('edit-pinned').checked, content: document.getElementById('edit-content').innerHTML, media: [...state.currentEditingMedia, ...newPaths] };
        const idx = content.findIndex(x => x.id === id);
        if(idx > -1) content[idx] = obj; else content.unshift(obj);
        await window.githubRequest(fPath, 'PUT', { message: 'Post', content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        window.addToAuditor('post', id, obj);
        document.getElementById('modal-editor').style.display = 'none';
        if(idx > -1) state.feedData[idx] = obj; else state.feedData.unshift(obj);
        window.renderFeed();
    } catch(err) { alert(err.message); } finally { btn.innerText = "Save"; btn.disabled = false; }
};

window.editStaff = (id) => {
    const s = state.staffData.find(x => x.id === id); if(!s) return;
    document.getElementById('edit-staff-id').value = s.id;
    document.getElementById('edit-staff-name').value = s.name;
    document.getElementById('edit-staff-designation').value = s.designation;
    document.getElementById('edit-staff-subject').value = s.subject;
    state.currentEditingStaffPhoto = s.photo; window.renderStaffPreview();
    document.getElementById('modal-staff').style.display = 'flex';
};

window.deleteStaff = async (id) => {
    if(!confirm("Delete?")) return;
    const fPath = `${CONFIG.dataPath}staff.json`;
    const fData = await window.githubRequest(fPath);
    const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
    const newContent = content.filter(x => x.id !== id);
    await window.githubRequest(fPath, 'PUT', { message: 'Del Staff', content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))), sha: fData.sha });
    window.addToAuditor('staff', id, null);
    state.staffData = state.staffData.filter(x => x.id !== id); window.renderStaff();
};

window.handleStaffSave = async (e) => {
    e.preventDefault(); const btn = document.getElementById('btn-staff-save'); btn.innerText = "Syncing..."; btn.disabled = true;
    try {
        const id = document.getElementById('edit-staff-id').value || `staff_${Date.now()}`;
        const fPath = `${CONFIG.dataPath}staff.json`;
        let fData; try { fData = await window.githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const photoInput = document.getElementById('edit-staff-photo');
        let photo = state.currentEditingStaffPhoto;
        if (photoInput.files.length > 0) {
            const b64 = await window.processImage(photoInput.files[0]);
            const fname = `staff_${id}_${Date.now()}.jpg`;
            await window.githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: 'Photo', content: b64 });
            photo = `${CONFIG.mediaPath}${fname}`;
        }
        const obj = { id, name: document.getElementById('edit-staff-name').value, designation: document.getElementById('edit-staff-designation').value, subject: document.getElementById('edit-staff-subject').value, photo };
        const idx = content.findIndex(x => x.id === id);
        if(idx > -1) content[idx] = obj; else content.push(obj);
        await window.githubRequest(fPath, 'PUT', { message: 'Staff', content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        window.addToAuditor('staff', id, obj);
        document.getElementById('modal-staff').style.display = 'none';
        if(idx > -1) state.staffData[idx] = obj; else state.staffData.push(obj);
        window.renderStaff();
    } catch(err) { alert(err.message); } finally { btn.innerText = "Save"; btn.disabled = false; }
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
function setupEvents() {
    document.getElementById('btn-admin-login').onclick = () => state.isAdmin ? (sessionStorage.clear(), location.reload()) : (document.getElementById('modal-auth').style.display = 'flex');
    document.getElementById('btn-auth-submit').onclick = () => { const t = document.getElementById('input-pat').value.trim(); if(t.length > 20) { sessionStorage.setItem('github_pat', t); location.reload(); } };
    document.getElementById('btn-auth-cancel').onclick = () => document.getElementById('modal-auth').style.display = 'none';

    document.getElementById('tab-feed').onclick = () => { document.getElementById('tab-feed').className = 'nav-btn active'; document.getElementById('tab-people').className = 'nav-btn'; document.getElementById('feed-column').style.display = 'block'; document.getElementById('people-column').style.display = 'none'; };
    document.getElementById('tab-people').onclick = () => { document.getElementById('tab-people').className = 'nav-btn active'; document.getElementById('tab-feed').className = 'nav-btn'; document.getElementById('people-column').style.display = 'block'; document.getElementById('feed-column').style.display = 'none'; };

    document.getElementById('btn-create-post').onclick = () => { document.getElementById('post-editor-form').reset(); document.getElementById('edit-post-id').value = ""; document.getElementById('edit-content').innerHTML = ""; state.currentEditingMedia = []; window.renderMediaPreview(); document.getElementById('modal-editor').style.display = 'flex'; };
    document.getElementById('post-editor-form').onsubmit = window.handlePostSave;
    document.getElementById('btn-editor-cancel').onclick = () => document.getElementById('modal-editor').style.display = 'none';

    document.getElementById('btn-add-staff').onclick = () => { document.getElementById('staff-editor-form').reset(); document.getElementById('edit-staff-id').value = ""; state.currentEditingStaffPhoto = null; window.renderStaffPreview(); document.getElementById('modal-staff').style.display = 'flex'; };
    document.getElementById('staff-editor-form').onsubmit = window.handleStaffSave;
    document.getElementById('btn-staff-cancel').onclick = () => document.getElementById('modal-staff').style.display = 'none';

    document.getElementById('btn-edit-ticker').onclick = () => { document.getElementById('input-ticker-text').value = state.schoolDetails.alert_ticker?.message || ""; document.getElementById('input-ticker-active').checked = state.schoolDetails.alert_ticker?.is_active || false; document.getElementById('modal-ticker').style.display = 'flex'; };
    document.getElementById('btn-ticker-cancel').onclick = () => document.getElementById('modal-ticker').style.display = 'none';
    document.getElementById('btn-ticker-save').onclick = async () => {
        const fPath = `data/school_details.json`;
        const fData = await window.githubRequest(fPath);
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const obj = { message: document.getElementById('input-ticker-text').value, is_active: document.getElementById('input-ticker-active').checked };
        content.alert_ticker = obj;
        await window.githubRequest(fPath, 'PUT', { message: 'Ticker', content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        window.addToAuditor('ticker', 'ticker_global', obj);
        state.schoolDetails = content; window.renderHero();
        document.getElementById('modal-ticker').style.display = 'none';
    };
}

async function init() {
    if(state.pat) { state.isAdmin = true; document.getElementById('admin-control-panel').style.display = 'block'; document.getElementById('admin-staff-panel').style.display = 'block'; }
    setupEvents();
    await window.refreshAllData();
    window.ensureAuditorIsRunning();
}

init();
