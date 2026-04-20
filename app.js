/* ==========================================================================
   MASTER CONFIG & STATE
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
    currentEditingStaffPhoto: null
};

/* ==========================================================================
   GLOBAL UTILITIES (Exposed to window for HTML calls)
   ========================================================================== */
window.execCommand = (cmd) => { document.execCommand(cmd, false, null); document.getElementById('edit-content').focus(); };
window.insertTable = () => { document.execCommand('insertHTML', false, `<table border="1" style="width:100%; border-collapse:collapse;"><tr><td>Data</td><td>Data</td></tr></table><p><br></p>`); };

window.changeSlide = (btn, dir) => {
    const container = btn.closest('.post-media');
    const imgs = container.querySelectorAll('.slider-img');
    const count = container.querySelector('.slider-counter');
    let idx = Array.from(imgs).findIndex(img => img.classList.contains('active'));
    imgs[idx].classList.remove('active');
    let nIdx = (idx + dir + imgs.length) % imgs.length;
    imgs[nIdx].classList.add('active');
    if (count) count.innerText = `${nIdx + 1} / ${imgs.length}`;
};

/* ==========================================================================
   CORE API LOGIC
   ========================================================================== */
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
        
        // Sync Lock Filter
        data = data.filter(p => {
            const dt = sessionStorage.getItem('sync_del_' + p.id);
            return !(dt && (Date.now() - parseInt(dt) <= 60000));
        });

        state.feedData = data.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.timestamp - a.timestamp));
        renderFeed();
    } catch (e) { console.error(e); }
}

async function fetchStaffData() {
    try {
        const res = await fetch(`${CONFIG.dataPath}staff.json?t=${Date.now()}`);
        if(res.ok) {
            let data = await res.json();
            data = data.filter(s => {
                const dt = sessionStorage.getItem('sync_del_staff_' + s.id);
                return !(dt && (Date.now() - parseInt(dt) <= 60000));
            });
            state.staffData = data;
        }
        renderStaff();
    } catch (e) { console.error(e); }
}

/* ==========================================================================
   LOCK POLLING (SILENT RE-SYNC)
   ========================================================================== */
function startLockPolling() {
    if (window.lockInterval) clearInterval(window.lockInterval);
    window.lockInterval = setInterval(() => {
        let fetchNeeded = false;
        
        // Ticker lock
        const tt = sessionStorage.getItem('sync_ticker');
        if (tt && Date.now() - parseInt(tt) > 60000) { sessionStorage.removeItem('sync_ticker'); fetchNeeded = true; }

        // Feed locks
        state.feedData.forEach(p => {
            if (sessionStorage.getItem('sync_edit_' + p.id) && Date.now() - parseInt(sessionStorage.getItem('sync_edit_' + p.id)) > 60000) fetchNeeded = true;
            if (sessionStorage.getItem('sync_del_' + p.id) && Date.now() - parseInt(sessionStorage.getItem('sync_del_' + p.id)) > 60000) fetchNeeded = true;
        });

        if (fetchNeeded) { fetchSchoolDetails(); fetchFeedData(); fetchStaffData(); }
    }, 5000);
}

/* ==========================================================================
   RENDERERS
   ========================================================================== */
function renderHero() {
    const d = state.schoolDetails; if(!d) return;
    document.getElementById('school-name').innerText = d.school_name;
    document.getElementById('udise-code').innerText = `UDISE: ${d.udise_code}`;
    document.getElementById('mission-statement').innerText = d.mission_statement;
    const logo = document.getElementById('school-logo');
    if(d.logo_path) { logo.src = d.logo_path; logo.style.display = 'block'; }

    // Ticker Logic
    const isTickerLocked = sessionStorage.getItem('sync_ticker') && (Date.now() - parseInt(sessionStorage.getItem('sync_ticker')) <= 60000);
    const ticker = d.alert_ticker || { message: "", is_active: false };
    const tickerContainer = document.getElementById('urgent-ticker-container');
    if (ticker.is_active || isTickerLocked) {
        tickerContainer.style.display = 'flex';
        document.getElementById('ticker-text').innerText = ticker.message;
        tickerContainer.className = `ticker-wrapper ${isTickerLocked ? 'sync-locked' : ''}`;
    } else { tickerContainer.style.display = 'none'; }
}

function renderSidebar() {
    const list = document.getElementById('quick-links-list');
    if(state.schoolDetails) list.innerHTML = state.schoolDetails.categories.map(c => `<li><a href="#">${c}</a></li>`).join('');
}

function renderFeed() {
    const container = document.getElementById('feed-column');
    Array.from(container.children).forEach(c => { if(c.id !== 'admin-control-panel') c.remove(); });

    state.feedData.forEach(post => {
        const isLocked = (sessionStorage.getItem('sync_edit_' + post.id) || sessionStorage.getItem('sync_del_' + post.id)) && (Date.now() - parseInt(sessionStorage.getItem('sync_edit_' + post.id) || sessionStorage.getItem('sync_del_' + post.id)) <= 60000);
        const card = document.createElement('article');
        card.className = `post-card ${post.is_pinned ? 'pinned' : ''} ${isLocked ? 'sync-locked' : ''}`;
        card.innerHTML = `
            ${post.is_pinned ? '<span class="pin-badge">📌 Pinned</span>' : ''}
            <div class="post-header"><span class="post-date">${new Date(post.timestamp).toLocaleDateString('en-IN')}</span></div>
            <h2 class="post-title-en">${post.title}</h2>
            <div class="post-content">${post.content}</div>
            ${post.media && post.media.length ? `<div class="post-media">${post.media.map((m, idx) => `<img src="${m}" class="slider-img ${idx === 0 ? 'active' : ''}">`).join('')}${post.media.length > 1 ? `<button class="slider-btn" style="left:0" onclick="window.changeSlide(this,-1)">&#10094;</button><button class="slider-btn" style="right:0" onclick="window.changeSlide(this,1)">&#10095;</button><div class="slider-counter">1 / ${post.media.length}</div>` : ''}</div>` : ''}
            ${state.isAdmin ? `<div class="admin-actions"><button class="btn-secondary" onclick="window.editPost('${post.id}')">✏️ Edit</button><button class="btn-secondary" style="color:red" onclick="window.deletePost('${post.id}')">🗑️ Delete</button></div>` : ''}
        `;
        container.appendChild(card);
    });
}

function renderStaff() {
    const grid = document.getElementById('staff-grid'); grid.innerHTML = "";
    state.staffData.forEach(s => {
        const isLocked = (sessionStorage.getItem('sync_edit_staff_' + s.id) || sessionStorage.getItem('sync_del_staff_' + s.id)) && (Date.now() - parseInt(sessionStorage.getItem('sync_edit_staff_' + s.id) || sessionStorage.getItem('sync_del_staff_' + s.id)) <= 60000);
        const card = document.createElement('div'); card.className = `staff-card ${isLocked ? 'sync-locked' : ''}`;
        card.innerHTML = `<div class="staff-photo-container"><img src="${s.photo || 'media/default.png'}"></div><h3 class="staff-name">${s.name}</h3><div class="staff-designation">${s.designation}</div><div class="staff-subject">${s.subject || ''}</div>${state.isAdmin ? `<div class="admin-actions"><button class="btn-secondary" onclick="window.editStaff('${s.id}')">✏️ Edit</button><button class="btn-secondary" style="color:red" onclick="window.deleteStaff('${s.id}')">🗑️ Delete</button></div>` : ''}`;
        grid.appendChild(card);
    });
    document.getElementById('staff-loader').style.display = 'none';
}

/* ==========================================================================
   IMAGE PREVIEW MASTER
   ========================================================================== */
function renderMediaPreview() {
    const container = document.getElementById('edit-preview-container');
    container.innerHTML = state.currentEditingMedia.length ? "" : "No images.";
    state.currentEditingMedia.forEach((path, idx) => {
        const item = document.createElement('div'); item.className = 'preview-item';
        item.innerHTML = `<img src="${path}"><button type="button" class="remove-img-btn" onclick="window.removeExistingImage(${idx})">×</button>`;
        container.appendChild(item);
    });
}
window.removeExistingImage = (idx) => { state.currentEditingMedia.splice(idx, 1); renderMediaPreview(); };

function renderStaffPreview() {
    const container = document.getElementById('staff-preview-container');
    container.innerHTML = state.currentEditingStaffPhoto ? `<div class="preview-item"><img src="${state.currentEditingStaffPhoto}"><button type="button" class="remove-img-btn" onclick="window.removeStaffImage()">×</button></div>` : "No photo.";
}
window.removeStaffImage = () => { state.currentEditingStaffPhoto = null; renderStaffPreview(); };

/* ==========================================================================
   ACTION HANDLERS
   ========================================================================== */
window.editPost = (id) => {
    const p = state.feedData.find(x => x.id === id); if(!p) return;
    document.getElementById('edit-post-id').value = p.id;
    document.getElementById('edit-title').value = p.title;
    document.getElementById('edit-content').innerHTML = p.content;
    state.currentEditingMedia = p.media ? [...p.media] : [];
    renderMediaPreview();
    document.getElementById('modal-editor').style.display = 'flex';
};

window.deletePost = async (id) => {
    if(!confirm("Delete post?")) return;
    try {
        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        const fData = await githubRequest(fPath);
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const newContent = content.filter(x => x.id !== id);
        await githubRequest(fPath, 'PUT', { message: `Del ${id}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_del_' + id, Date.now().toString());
        state.feedData = state.feedData.filter(x => x.id !== id); renderFeed();
    } catch (e) { alert(e.message); }
};

window.editStaff = (id) => {
    const s = state.staffData.find(x => x.id === id); if(!s) return;
    document.getElementById('edit-staff-id').value = s.id;
    document.getElementById('edit-staff-name').value = s.name;
    document.getElementById('edit-staff-designation').value = s.designation;
    document.getElementById('edit-staff-subject').value = s.subject;
    state.currentEditingStaffPhoto = s.photo;
    renderStaffPreview();
    document.getElementById('modal-staff').style.display = 'flex';
};

window.deleteStaff = async (id) => {
    if(!confirm("Delete staff?")) return;
    try {
        const fPath = `${CONFIG.dataPath}staff.json`;
        const fData = await githubRequest(fPath);
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        const newContent = content.filter(x => x.id !== id);
        await githubRequest(fPath, 'PUT', { message: `Del Staff ${id}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_del_staff_' + id, Date.now().toString());
        state.staffData = state.staffData.filter(x => x.id !== id); renderStaff();
    } catch (e) { alert(e.message); }
};

/* ==========================================================================
   SAVE LOGIC
   ========================================================================== */
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

async function handlePostSave(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-editor-save'); btn.innerText = "Syncing..."; btn.disabled = true;
    try {
        const pid = document.getElementById('edit-post-id').value || `post_${Date.now()}`;
        const isEditing = !!document.getElementById('edit-post-id').value;
        const fPath = `${CONFIG.dataPath}${CONFIG.currentYear}.json`;
        let fData; try { fData = await githubRequest(fPath); } catch { fData = { content: btoa("[]"), sha: null }; }
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));

        const files = document.getElementById('edit-media').files;
        let newPaths = [];
        for (let i = 0; i < files.length; i++) {
            const b64 = await processImage(files[i]);
            const fname = `${pid}_img_${i}_${Date.now()}.jpg`;
            await githubRequest(`${CONFIG.mediaPath}${fname}`, 'PUT', { message: `Img`, content: b64 });
            newPaths.push(`${CONFIG.mediaPath}${fname}`);
        }

        const postObj = {
            id: pid, timestamp: Date.now(), title: document.getElementById('edit-title').value,
            status: document.querySelector('input[name="edit-status"]:checked').value,
            is_pinned: document.getElementById('edit-pinned').checked,
            content: document.getElementById('edit-content').innerHTML,
            media: [...state.currentEditingMedia, ...newPaths]
        };

        if(isEditing) { const idx = content.findIndex(x => x.id === pid); content[idx] = postObj; } else { content.unshift(postObj); }
        await githubRequest(fPath, 'PUT', { message: `Update Post`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_edit_' + pid, Date.now().toString());
        document.getElementById('modal-editor').style.display = 'none';
        if(isEditing) { const idx = state.feedData.findIndex(x => x.id === pid); state.feedData[idx] = postObj; } else { state.feedData.unshift(postObj); }
        renderFeed();
    } catch (e) { alert(e.message); } finally { btn.innerText = "Save & Publish"; btn.disabled = false; }
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
function setupEventListeners() {
    document.getElementById('btn-admin-login').onclick = () => state.isAdmin ? (sessionStorage.clear(), location.reload()) : (document.getElementById('modal-auth').style.display = 'flex');
    document.getElementById('btn-auth-submit').onclick = () => { const t = document.getElementById('input-pat').value.trim(); if(t.length > 20) { sessionStorage.setItem('github_pat', t); location.reload(); } };
    document.getElementById('btn-auth-cancel').onclick = () => document.getElementById('modal-auth').style.display = 'none';

    document.getElementById('tab-feed').onclick = () => { document.getElementById('tab-feed').className = 'nav-btn active'; document.getElementById('tab-people').className = 'nav-btn'; document.getElementById('feed-column').style.display = 'block'; document.getElementById('people-column').style.display = 'none'; };
    document.getElementById('tab-people').onclick = () => { document.getElementById('tab-people').className = 'nav-btn active'; document.getElementById('tab-feed').className = 'nav-btn'; document.getElementById('people-column').style.display = 'block'; document.getElementById('feed-column').style.display = 'none'; };

    document.getElementById('btn-create-post').onclick = () => { document.getElementById('post-editor-form').reset(); document.getElementById('edit-post-id').value = ""; document.getElementById('edit-content').innerHTML = ""; state.currentEditingMedia = []; renderMediaPreview(); document.getElementById('modal-editor').style.display = 'flex'; };
    document.getElementById('post-editor-form').onsubmit = handlePostSave;
    document.getElementById('btn-editor-cancel').onclick = () => document.getElementById('modal-editor').style.display = 'none';

    document.getElementById('btn-edit-ticker').onclick = () => { document.getElementById('input-ticker-text').value = state.schoolDetails.alert_ticker?.message || ""; document.getElementById('input-ticker-active').checked = state.schoolDetails.alert_ticker?.is_active || false; document.getElementById('modal-ticker').style.display = 'flex'; };
    document.getElementById('btn-ticker-cancel').onclick = () => document.getElementById('modal-ticker').style.display = 'none';
    document.getElementById('btn-ticker-save').onclick = async () => {
        const fPath = `data/school_details.json`;
        const fData = await githubRequest(fPath);
        const content = JSON.parse(decodeURIComponent(escape(atob(fData.content))));
        content.alert_ticker = { message: document.getElementById('input-ticker-text').value, is_active: document.getElementById('input-ticker-active').checked };
        await githubRequest(fPath, 'PUT', { message: 'Ticker', content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: fData.sha });
        sessionStorage.setItem('sync_ticker', Date.now().toString());
        state.schoolDetails = content; renderHero();
        document.getElementById('modal-ticker').style.display = 'none';
    };
}

async function init() {
    if(state.pat) { state.isAdmin = true; document.getElementById('admin-control-panel').style.display = 'block'; document.getElementById('admin-staff-panel').style.display = 'block'; }
    setupEventListeners();
    await fetchSchoolDetails();
    await fetchFeedData();
    await fetchStaffData();
    startLockPolling();
}

init();
