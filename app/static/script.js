// Front-end helper functions.
// This file talks to the FastAPI backend using fetch() and handles basic UI updates.

// Upload selected files to the backend. Requires an auth token in localStorage.
// The token is saved after a successful login.
async function upload() {
    const files = document.getElementById('fileInput').files;
    const formData = new FormData();
    for (let f of files) formData.append('files', f);
    const token = localStorage.getItem('token'); // saved after successful login
    if (!token) {
        alert('Set token in localStorage: localStorage.setItem("token", "your_token")');
        return;
    }
    // Send files to backend
    const res = await fetch('/media/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    const data = await res.json();
    const resultsEl = document.getElementById('results');
    if (res.ok) {
        resultsEl.innerHTML = '<p style="color: green;">Uploaded: ' +
            data.results.map(r => r.filename).join(', ') + '</p>';
        // Refresh the file list after successful upload
        loadUserFiles();
    } else {
        resultsEl.innerHTML = '<p style="color: red;">Error: ' + (data.detail || 'Unknown') + '</p>';
    }
}

// Analyze a selected file and render the engagement chart below.
async function analyzeFile(id) {
    const token = localStorage.getItem('token');
    const errEl = document.getElementById('chart-error');
    if (errEl) errEl.textContent = '';
    if (!token) {
        if (errEl) errEl.textContent = 'Not authenticated';
        return;
    }
    try {
        const res = await fetch(`/media/files/${id}/analyze`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        // Debug: see server payload if chart not showing
        if (window && window.console) {
            console.debug('analyze response', data);
            if (Array.isArray(data?.series)) {
                // Tabular view in browser console
                console.table(data.series.map(p => ({ t: Number(p.t), value: Number(p.value) })));
                // Summary
                const vals = data.series.map(p => Number(p.value) || 0);
                const avg = vals.reduce((a,b)=>a+b,0) / Math.max(1, vals.length);
                console.log(`Series length: ${vals.length}, avg value: ${avg.toFixed(3)}`);
            }
        }
        if (!res.ok) {
            if (errEl) errEl.textContent = data.detail || 'Analyze failed';
            return;
        }
        if (!data || !Array.isArray(data.series)) {
            if (errEl) errEl.textContent = 'Unexpected analyze response';
            return;
        }
        renderChart(data.series);
    } catch (e) {
        if (errEl) errEl.textContent = 'Connection error';
    }
}

// Render a simple line chart of value over time on a canvas with id "engagement-chart".
function renderChart(series) {
    const canvas = document.getElementById('engagement-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (!series || series.length === 0) return;

    // Compute bounds on raw data
    const times = series.map(p => Number(p.t) || 0);
    const values = series.map(p => Number(p.value) || 0);
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const vMin = 0; // clamp 0..1 for engagement
    const vMax = 1;

    // Resample into ~12 равных отрезков (0%..100%) — даст 13 точек
    const bins = 12; // 0%, ~8.3%, ..., 100%
    const pairs = times.map((t, i) => ({ t, v: values[i] })).sort((a,b)=>a.t-b.t);
    const interp = (tt) => {
        if (pairs.length === 0) return 0;
        if (tt <= pairs[0].t) return pairs[0].v;
        if (tt >= pairs[pairs.length - 1].t) return pairs[pairs.length - 1].v;
        for (let j = 0; j < pairs.length - 1; j++) {
            const a = pairs[j], b = pairs[j + 1];
            if (tt >= a.t && tt <= b.t) {
                const r = (tt - a.t) / Math.max(1e-9, (b.t - a.t));
                return a.v + r * (b.v - a.v);
            }
        }
        return pairs[pairs.length - 1].v;
    };
    const rTimes = [];
    const rValues = [];
    if (tMax === tMin) {
        rTimes.push(tMin);
        rValues.push(values[0] ?? 0);
    } else {
        for (let b = 0; b <= bins; b++) {
            const tt = tMin + (b / bins) * (tMax - tMin);
            rTimes.push(tt);
            rValues.push(interp(tt));
        }
    }

    // Padding
    const padL = 40, padR = 10, padT = 10, padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Grid and Axes
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    // Horizontal grid every 10%
    for (let g = 0; g <= 10; g++) {
        const gy = padT + (1 - g / 10) * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
    }
    // Vertical grid: adaptive count based on pixel width (denser time divisions)
    // ~ one grid line every ~20px, clamped
    const segs = Math.max(16, Math.min(80, Math.round(plotW / 20)));
    for (let s = 0; s <= segs; s++) {
        const gx = padL + (s / segs) * plotW;
        ctx.beginPath();
        ctx.moveTo(gx, padT);
        ctx.lineTo(gx, h - padB);
        ctx.stroke();
    }
    // Axes lines
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(padL, h - padB);
    ctx.lineTo(w - padR, h - padB);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.stroke();

    // Ticks/labels (simple)
    ctx.fillStyle = '#555';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    // Minor x-ticks at every resampled bin with small markers
    ctx.strokeStyle = '#aaa';
    for (let p = 0; p <= bins; p++) {
        const xx = padL + (p / bins) * plotW;
        ctx.beginPath();
        ctx.moveTo(xx, h - padB);
        ctx.lineTo(xx, h - padB + 4);
        ctx.stroke();
    }
    // Dynamic labeling along X: минимум 10-12 подписей если хватает места
    const approxLabelEveryPx = 60; // не чаще, чтобы не слипались
    const maxLabels = Math.max(3, Math.floor(plotW / approxLabelEveryPx));
    const step = Math.max(1, Math.round(bins / Math.max(1, maxLabels)));
    for (let p = 0; p <= bins; p++) {
        if (p % step !== 0 && p !== bins) continue;
        const xx = padL + (p / bins) * plotW;
        const tt = tMin + (p / bins) * (tMax - tMin);
        ctx.fillText(`${tt.toFixed(0)}s`, xx, h - 10);
    }
    ctx.textAlign = 'right';
    for (let g = 0; g <= 10; g += 2) {
        const label = `${g * 10}%`;
        const gy = padT + (1 - g / 10) * plotH;
        ctx.fillText(label, padL - 6, gy + 4);
    }

    // Scale helpers
    const x = t => padL + ((t - tMin) / Math.max(1e-9, (tMax - tMin))) * plotW;
    const y = v => padT + (1 - (v - vMin) / Math.max(1e-9, (vMax - vMin))) * plotH;

    // Primary line (green) over resampled points
    ctx.strokeStyle = '#2a7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < rTimes.length; i++) {
        const px = x(rTimes[i]);
        const py = y(rValues[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Point markers
    ctx.fillStyle = '#2a7';
    for (let i = 0; i < rTimes.length; i++) {
        const px = x(rTimes[i]);
        const py = y(rValues[i]);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Threshold line at 70% (red) — separates good vs bad time
    const thr = 0.7;
    ctx.strokeStyle = '#e33';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y(thr));
    ctx.lineTo(w - padR, y(thr));
    ctx.stroke();
    // Label for the threshold
    ctx.fillStyle = '#e33';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('70%', padL + 4, y(thr) - 6);

    // Last value tag
    const lastX = x(rTimes[rTimes.length - 1]);
    const lastY = y(rValues[rValues.length - 1]);
    ctx.fillStyle = '#000';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${(rValues[rValues.length - 1] * 100).toFixed(1)}%`, Math.min(lastX + 6, w - 40), lastY - 6);

    // Highlight max and min points with exact values
    const maxVal = Math.max(...rValues);
    const minVal = Math.min(...rValues);
    const maxIdx = rValues.indexOf(maxVal);
    const minIdx = rValues.indexOf(minVal);
    const drawLabel = (idx, color, offsetY) => {
        const px = x(rTimes[idx]);
        const py = y(rValues[idx]);
        // emphasize point
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        const tx = Math.max(padL + 20, Math.min(px, w - padR - 20));
        const ty = Math.max(padT + 12, Math.min(py + offsetY, h - padB - 4));
        ctx.fillText(`${(rValues[idx] * 100).toFixed(1)}%`, tx, ty);
    };
    if (maxIdx >= 0) drawLabel(maxIdx, '#e33', -10);
    if (minIdx >= 0) drawLabel(minIdx, '#33c', 14);
}

// Load the current user's file list and render simple rows with a delete button.
// This function is called after a successful upload and on page load.
async function loadUserFiles() {
    const token = localStorage.getItem('token');
    const res = await fetch('/media/files', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const filesEl = document.getElementById('user-files');
    if (res.ok) {
        filesEl.innerHTML = data.files.map(f => `
            <div style="margin: 0.5rem 0; padding: 0.5rem; border: 1px solid #ccc; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <span>${f.filename} (${new Date(f.uploaded_at).toLocaleString()})</span>
                <button onclick="analyzeFile(${f.id})">Analyze</button>
                <button onclick="deleteFile(${f.id})">Delete</button>
            </div>
        `).join('');
    } else {
        filesEl.innerHTML = '<p style="color: red;">Error loading files</p>';
    }
}
// Authentication check on page load:
// - Detect server restart (boot_id) and clear old tokens
// - If token is missing/invalid, redirect from private pages to /auth
// - If token is valid and we're on /auth, go to /upload
async function checkAuth() {
    // 1) Detect server restart and clear token if boot_id changed
    try {
        const bootRes = await fetch('/meta/boot');
        if (bootRes.ok) {
            const { boot_id } = await bootRes.json();
            const prevBoot = localStorage.getItem('boot_id');
            if (prevBoot && prevBoot !== boot_id) {
                // Server restarted — clear token to avoid using an invalid session
                localStorage.removeItem('token');
            }
            localStorage.setItem('boot_id', boot_id);
        }
    } catch (e) {
        // If we can't fetch boot_id, ignore and continue
    }

    // 2) Work out where we are and whether we need to redirect
    const token = localStorage.getItem('token'); // saved token if logged in
    let path = window.location.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const onAuthPage = path === '/' || path === '/auth' || path.startsWith('/auth?');
    const onUploadPage = path === '/upload' || path.startsWith('/upload?');
    const onProfilePage = path === '/profile' || path.startsWith('/profile?');
    const onAlgorithmPage = path === '/algorithm' || path.startsWith('/algorithm?');

    if (!token) {
        // No token: redirect away from private pages, otherwise show auth forms
        if (onUploadPage || onProfilePage || onAlgorithmPage) {
            window.location.replace('/auth');
            return;
        }
        const tabs = document.querySelector('.tabs');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        if (tabs && loginForm && registerForm) {
            tabs.classList.remove('hidden');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        }
        return;
    }

    // 3) Validate token against the server
    try {
        const res = await fetch('/media/files', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            // Token is valid
            if (onAuthPage) {
                // If we're on the auth page, go to the app
                window.location.replace('/upload');
                return;
            }
            if (onUploadPage || onProfilePage || onAlgorithmPage) {
                // Already on a private page — update UI
                if (typeof loadUserFiles === 'function') {
                    loadUserFiles();
                }
                // Populate username if the element exists
                try {
                    const me = await getCurrentUser();
                    const nameEl = document.getElementById('profile-username');
                    if (nameEl && me && me.username) nameEl.textContent = me.username;
                } catch {}
            }
        } else {
            // Token is invalid
            localStorage.removeItem('token');
            if (onUploadPage || onProfilePage || onAlgorithmPage) {
                window.location.replace('/auth');
                return;
            }
            const tabs = document.querySelector('.tabs');
            const loginForm = document.getElementById('login-form');
            const registerForm = document.getElementById('register-form');
            if (tabs && loginForm && registerForm) {
                tabs.classList.remove('hidden');
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
            }
        }
    } catch (e) {
        // Network or server error: treat as unauthenticated
        localStorage.removeItem('token');
        if (onUploadPage) {
            window.location.replace('/auth');
            return;
        }
        const tabs = document.querySelector('.tabs');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        if (tabs && loginForm && registerForm) {
            tabs.classList.remove('hidden');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        }
    }
}
async function getCurrentUser() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const res = await fetch('/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json();
}

// Small helper to display the username in a nav element if present on the page.
async function showUsernameInNav() {
    try {
        const me = await getCurrentUser();
        const nameEl = document.getElementById('profile-username');
        if (nameEl && me && me.username) nameEl.textContent = me.username;
    } catch (e) {
    }
}

// Remove auth token and navigate to the auth page
function logout() {
    try { localStorage.removeItem('token'); } catch (e) {}
    window.location.replace('/auth');
}

// Delete a file and refresh the list
async function deleteFile(id) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch(`/media/files/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // Ignore body; refresh list regardless
        if (typeof loadUserFiles === 'function') loadUserFiles();
    } catch (e) {}
}