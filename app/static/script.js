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
                console.log(data.series)
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
function renderChart(series, label = 'File 1') {
  const canvas = document.getElementById('engagement-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!series || series.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data available', w / 2, h / 2);
    return;
  }

  // Сбор времён и значений
  const times = series.map(p => Number(p.t) || 0);
  const values = series.map(p => Number(p.value) || 0);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const vMin = 0;
  const vMax = 1;
  const actualDuration = tMax - tMin;

  // Padding — как в renderComparisonChart
  const padL = 50, padR = 150, padT = 40, padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Сетка — как в сравнении
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;

  // Горизонтальная сетка (0%–100% по шагам 10%)
  for (let g = 0; g <= 10; g++) {
    const gy = padT + (1 - g / 10) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();
  }

  // Вертикальная сетка — 12 сегментов
  const segs = 12;
  for (let s = 0; s <= segs; s++) {
    const gx = padL + (s / segs) * plotW;
    ctx.beginPath();
    ctx.moveTo(gx, padT);
    ctx.lineTo(gx, h - padB);
    ctx.stroke();
  }

  // Оси
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(padL, h - padB);
  ctx.lineTo(w - padR, h - padB);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, h - padB);
  ctx.stroke();

  // Подписи осей
  ctx.fillStyle = '#555';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';

  // X-метки: каждые (actualDuration / 12) секунд
  for (let p = 0; p <= segs; p++) {
    if (p % 2 === 0 || p === segs) {
      const xx = padL + (p / segs) * plotW;
      const timeValue = (p / segs) * actualDuration;
      ctx.fillText(`${timeValue.toFixed(0)}s`, xx, h - 20);
    }
  }

  // Y-метки: 0%, 20%, ..., 100%
  ctx.textAlign = 'right';
  for (let g = 0; g <= 10; g += 2) {
    const labelY = `${g * 10}%`;
    const gy = padT + (1 - g / 10) * plotH;
    ctx.fillText(labelY, padL - 8, gy + 4);
  }

  // Масштабные функции — как в сравнении
  const x = t => {
    const relativeTime = t - tMin;
    return padL + (relativeTime / Math.max(1e-9, actualDuration)) * plotW;
  };
  const y = v => padT + (1 - (v - vMin) / Math.max(1e-9, (vMax - vMin))) * plotH;

  // === Рисуем линию по ВСЕМ точкам ===
  const color = '#2a7';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < times.length; i++) {
    const px = x(times[i]);
    const py = y(values[i]);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // === Маркеры: не более MAX_MARKERS ===
  const MAX_MARKERS = 200;
  let markerIndices = [];
  if (times.length <= MAX_MARKERS) {
    markerIndices = Array.from({ length: times.length }, (_, i) => i);
  } else {
    const step = (times.length - 1) / (MAX_MARKERS - 1);
    markerIndices = Array.from({ length: MAX_MARKERS }, (_, i) => Math.round(i * step));
    markerIndices[0] = 0;
    markerIndices[MAX_MARKERS - 1] = times.length - 1;
  }

  ctx.fillStyle = color;
  for (const i of markerIndices) {
    const px = x(times[i]);
    const py = y(values[i]);
    ctx.beginPath();
//    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Порог 70% — пунктир
  const thr = 0.7;
  ctx.strokeStyle = '#e33';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(padL, y(thr));
  ctx.lineTo(w - padR, y(thr));
  ctx.stroke();
  ctx.setLineDash([]);

  // Подпись порога
  ctx.fillStyle = '#e33';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('70%', padL + 4, y(thr) - 6);

  // Информация о длительности
  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Duration: ${actualDuration.toFixed(1)}s`, padL, padT - 10);

  // Легенда (как в сравнении, но один элемент)
  ctx.textAlign = 'left';
  const legendX = w - padR + 10;
  const legendY = padT + 20;
  ctx.fillStyle = color;
  ctx.fillRect(legendX, legendY, 20, 3);
  ctx.fillStyle = '#000';
  ctx.font = '12px sans-serif';
  ctx.fillText(label, legendX + 25, legendY + 5);
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

            <button onclick="deleteFile(${f.id})" style="margin-left: auto;">Удалить</button>
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






// New function for algorithm page to load files in a selectable list
async function loadAlgorithmFiles() {
    const token = localStorage.getItem('token');
    const res = await fetch('/media/files', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const filesEl = document.getElementById('file-list');

    if (res.ok && data.files.length > 0) {
        filesEl.innerHTML = `
            <p>Select a file to analyze:</p>
            <div class="stack">
                ${data.files.map(f => `
                    <div class="file-item" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                         onclick="selectFile(${f.id}, this)" data-filename="${f.filename}">
                            ${f.filename}
                            <small class="muted">(${new Date(f.uploaded_at).toLocaleString()})</small>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        filesEl.innerHTML = '<p>No files available. <a href="/upload">Upload some files first</a>.</p>';
    }
}



function renderComparisonChart(series1, series2, label1 = 'File 1', label2 = 'File 2', commonDuration = null) {
    const canvas = document.getElementById('engagement-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!series1 || !series2 || series1.length === 0 || series2.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available for comparison', w / 2, h / 2);
        return;
    }

    // Сбор всех времён и значений
    const allTimes = [];
    const allValues = [];

    [series1, series2].forEach(series => {
        series.forEach(p => {
            const t = Number(p.t) || 0;
            const v = Number(p.value) || 0;
            allTimes.push(t);
            allValues.push(v);
        });
    });

    const tMin = Math.min(...allTimes);
    const tMax = Math.max(...allTimes);
    const vMin = 0;
    const vMax = 1;
    const actualDuration = commonDuration || (tMax - tMin);

    // Padding
    const padL = 50, padR = 150, padT = 40, padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Grid and Axes
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    for (let g = 0; g <= 10; g++) {
        const gy = padT + (1 - g / 10) * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
    }

    const segs = 12;
    for (let s = 0; s <= segs; s++) {
        const gx = padL + (s / segs) * plotW;
        ctx.beginPath();
        ctx.moveTo(gx, padT);
        ctx.lineTo(gx, h - padB);
        ctx.stroke();
    }

    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(padL, h - padB);
    ctx.lineTo(w - padR, h - padB);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#555';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    for (let p = 0; p <= segs; p++) {
        if (p % 2 === 0 || p === segs) {
            const xx = padL + (p / segs) * plotW;
            const timeValue = (p / segs) * actualDuration;
            ctx.fillText(`${timeValue.toFixed(0)}s`, xx, h - 20);
        }
    }

    ctx.textAlign = 'right';
    for (let g = 0; g <= 10; g += 2) {
        const label = `${g * 10}%`;
        const gy = padT + (1 - g / 10) * plotH;
        ctx.fillText(label, padL - 8, gy + 4);
    }

    // Scale helpers
    const x = t => {
        const relativeTime = t - tMin;
        return padL + (relativeTime / Math.max(1e-9, actualDuration)) * plotW;
    };
    const y = v => padT + (1 - (v - vMin) / Math.max(1e-9, (vMax - vMin))) * plotH;

    const colors = ['#2a7', '#e33'];
    const labels = [label1, label2];
    const MAX_MARKERS = 200; // ← так же, как в renderChart

    [series1, series2].forEach((series, seriesIndex) => {
        const color = colors[seriesIndex];
        const times = series.map(p => Number(p.t) || 0);
        const values = series.map(p => Number(p.value) || 0);

        // === 1. Рисуем ЛИНИЮ по ВСЕМ точкам (без интерполяции) ===
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < times.length; i++) {
            const px = x(times[i]);
            const py = y(values[i]);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // === 2. Выбираем индексы для маркеров — ТОЧНО КАК В renderChart ===
        let markerIndices = [];
        if (times.length <= MAX_MARKERS) {
            markerIndices = Array.from({ length: times.length }, (_, i) => i);
        } else {
            const step = (times.length - 1) / (MAX_MARKERS - 1);
            markerIndices = Array.from({ length: MAX_MARKERS }, (_, i) => {
                return Math.round(i * step);
            });
            // Гарантируем, что первый и последний индексы есть
            markerIndices[0] = 0;
            markerIndices[MAX_MARKERS - 1] = times.length - 1;
        }

        // === 3. Рисуем маркеры только на выбранных индексах ===
        ctx.fillStyle = color;
        for (const i of markerIndices) {
            const px = x(times[i]);
            const py = y(values[i]);
            ctx.beginPath();
//            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Threshold line
    const thr = 0.7;
    ctx.strokeStyle = '#e33';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padL, y(thr));
    ctx.lineTo(w - padR, y(thr));
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold label
    ctx.fillStyle = '#e33';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('70%', padL + 4, y(thr) - 6);

    // Duration info
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Comparison duration: ${actualDuration.toFixed(1)}s`, padL, padT - 10);

    // Legend
    ctx.textAlign = 'left';
    const legendX = w - padR + 10;
    const legendY = padT + 20;
    labels.forEach((label, index) => {
        const color = colors[index];
        ctx.fillStyle = color;
        ctx.fillRect(legendX, legendY + index * 25, 20, 3);
        ctx.fillStyle = '#000';
        ctx.font = '12px sans-serif';
        ctx.fillText(label, legendX + 25, legendY + 5 + index * 25);
    });
}

// Функция для интерполяции серии данных
function interpolateSeries(originalSeries, targetPointCount) {
    if (originalSeries.length <= 1) return originalSeries;

    const result = [];
    const times = originalSeries.map(p => p.t);
    const values = originalSeries.map(p => p.v);

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    for (let i = 0; i < targetPointCount; i++) {
        const progress = i / (targetPointCount - 1);
        const targetTime = minTime + progress * (maxTime - minTime);

        // Находим ближайшие точки для интерполяции
        let leftIndex = 0;
        let rightIndex = originalSeries.length - 1;

        for (let j = 0; j < originalSeries.length - 1; j++) {
            if (originalSeries[j].t <= targetTime && originalSeries[j + 1].t >= targetTime) {
                leftIndex = j;
                rightIndex = j + 1;
                break;
            }
        }

        const leftPoint = originalSeries[leftIndex];
        const rightPoint = originalSeries[rightIndex];

        let interpolatedValue;
        if (leftPoint.t === rightPoint.t) {
            interpolatedValue = leftPoint.v;
        } else {
            const ratio = (targetTime - leftPoint.t) / (rightPoint.t - leftPoint.t);
            interpolatedValue = leftPoint.v + ratio * (rightPoint.v - leftPoint.v);
        }

        result.push({ t: targetTime, v: interpolatedValue });
    }

    return result;
}



// Function to render comparison chart with two datasets
function renderComparisonChart(series1, series2, label1 = 'File 1', label2 = 'File 2') {

    const canvas = document.getElementById('engagement-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (!series1 || !series2 || series1.length === 0 || series2.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных для сравнения', w / 2, h / 2);
        return;
    }

    // Calculate individual time ranges
    const times1 = series1.map(p => Number(p.t) || 0);
    const times2 = series2.map(p => Number(p.t) || 0);

    const tMin1 = Math.min(...times1);
    const tMax1 = Math.max(...times1);
    const tMin2 = Math.min(...times2);
    const tMax2 = Math.max(...times2);

    // Use the maximum duration from both files
    const globalTMin = 0;
    const globalTMax = Math.max(tMax1 - tMin1, tMax2 - tMin2);
    const globalDuration = globalTMax;

    const vMin = 0;
    const vMax = 1;

    // Padding
    const padL = 50, padR = 150, padT = 40, padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Grid and Axes
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    // Horizontal grid
    for (let g = 0; g <= 10; g++) {
        const gy = padT + (1 - g / 10) * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
    }

    // Vertical grid
    const segs = 12;
    for (let s = 0; s <= segs; s++) {
        const gx = padL + (s / segs) * plotW;
        ctx.beginPath();
        ctx.moveTo(gx, padT);
        ctx.lineTo(gx, h - padB);
        ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(padL, h - padB);
    ctx.lineTo(w - padR, h - padB);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#555';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    // X-axis labels - relative time from 0 to max duration
    for (let p = 0; p <= segs; p++) {
        if (p % 2 === 0 || p === segs) {
            const xx = padL + (p / segs) * plotW;
            const timeValue = (p / segs) * globalDuration;
            ctx.fillText(`${timeValue.toFixed(0)}s`, xx, h - 20);
        }
    }

    // Y-axis labels
    ctx.textAlign = 'right';
    for (let g = 0; g <= 10; g += 2) {
        const label = `${g * 10}%`;
        const gy = padT + (1 - g / 10) * plotH;
        ctx.fillText(label, padL - 8, gy + 4);
    }

    // Scale helpers - use relative time starting from 0
    const x = t => {
        return padL + (t / Math.max(1e-9, globalDuration)) * plotW;
    };
    const y = v => padT + (1 - (v - vMin) / Math.max(1e-9, (vMax - vMin))) * plotH;

    // Colors for the two series
    const colors = ['#2a7', '#e33'];
    const labels = [label1, label2];

    // Draw both series with their own time ranges
    [series1, series2].forEach((series, seriesIndex) => {
        const color = colors[seriesIndex];
        const times = series.map(p => Number(p.t) || 0);
        const values = series.map(p => Number(p.value) || 0);

        // Shift times to start from 0 for this series
        const seriesMinTime = seriesIndex === 0 ? tMin1 : tMin2;
        const shiftedTimes = times.map(t => t - seriesMinTime);

        // Sort points by time
        const pairs = shiftedTimes.map((t, i) => ({ t, v: values[i] })).sort((a,b) => a.t - b.t);

        // If too few points, interpolate for smooth chart
        let pointsToDraw = pairs;
        console.log(pairs.length);
        if (pairs.length < 20 && pairs.length > 1) {
            pointsToDraw = interpolateSeries(pairs, 20);
        }

        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let hasPoints = false;
        for (let i = 0; i < pointsToDraw.length; i++) {
            const px = x(pointsToDraw[i].t);
            const py = y(pointsToDraw[i].v);
            if (i === 0) {
                ctx.moveTo(px, py);
                hasPoints = true;
            } else {
                ctx.lineTo(px, py);
            }
        }
        if (hasPoints) {
            ctx.stroke();
        }

        // Draw points - only for original points
        ctx.fillStyle = color;
        for (let i = 0; i < pairs.length; i++) {
            // Show every Nth point to avoid clutter
//            if (i % Math.max(1, Math.floor(pairs.length / 10)) === 0 || i === pairs.length - 1) {
                const px = x(pairs[i].t);
                const py = y(pairs[i].v);
                ctx.beginPath();
//                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
//            }
        }
    });

    // Threshold line
    const thr = 0.7;
    ctx.strokeStyle = '#e33';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padL, y(thr));
    ctx.lineTo(w - padR, y(thr));
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold label
    ctx.fillStyle = '#e33';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('70%', padL + 4, y(thr) - 6);

    // File duration information
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Time range: 0 - ${globalDuration.toFixed(0)}s`, padL, padT - 10);

    // Legend with duration information
    ctx.textAlign = 'left';
    const legendX = w - padR + 10;
    const legendY = padT + 20;

    labels.forEach((label, index) => {
        const color = colors[index];
        const duration = (index === 0 ? tMax1 - tMin1 : tMax2 - tMin2).toFixed(1);

        ctx.fillStyle = color;
        ctx.fillRect(legendX, legendY + index * 25, 20, 3);
        ctx.fillStyle = '#000';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${label} (${duration}s)`, legendX + 25, legendY + 5 + index * 25);
    });
}

// Function for interpolation of series data
function interpolateSeries(originalSeries, targetPointCount) {
    if (originalSeries.length <= 1) return originalSeries;

    const result = [];
    const times = originalSeries.map(p => p.t);
    const values = originalSeries.map(p => p.v);

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    for (let i = 0; i < targetPointCount; i++) {
        const progress = i / (targetPointCount - 1);
        const targetTime = minTime + progress * (maxTime - minTime);

        // Find nearest points for interpolation
        let leftIndex = 0;
        let rightIndex = originalSeries.length - 1;

        for (let j = 0; j < originalSeries.length - 1; j++) {
            if (originalSeries[j].t <= targetTime && originalSeries[j + 1].t >= targetTime) {
                leftIndex = j;
                rightIndex = j + 1;
                break;
            }
        }

        const leftPoint = originalSeries[leftIndex];
        const rightPoint = originalSeries[rightIndex];

        let interpolatedValue;
        if (leftPoint.t === rightPoint.t) {
            interpolatedValue = leftPoint.v;
        } else {
            const ratio = (targetTime - leftPoint.t) / (rightPoint.t - leftPoint.t);
            interpolatedValue = leftPoint.v + ratio * (rightPoint.v - leftPoint.v);
        }

        result.push({ t: targetTime, v: interpolatedValue });
    }

    return result;
}
