/**
 * TypeForge Pro — Main Application Entry
 */
import { $, $$, state, api, toast, loadPlatformInfo, resetState } from './state.js';
import { initTheme } from './theme.js';
import { initNavigation } from './navigation.js';
import { showOverview } from './overview.js';
import { initNames, loadNames } from './names.js';
import { initMetrics, loadMetrics } from './metrics.js';
import { initCmap, loadCmap } from './cmap.js';
import { initGlyphs, loadGlyphs } from './glyphs.js';
import { initVector } from './vector.js';
import { initOtl, loadOtl } from './otl.js';
import { initPreview, loadPreviewFont } from './preview.js';
import { initConfig, loadAllPanels } from './config.js';
import { initTools } from './tools.js';

// ─── Initialize all modules ──────────────────────────────────
async function init() {
  // Load platform info first
  await loadPlatformInfo();

  // Init UI modules
  initTheme();
  initNavigation();
  initNames();
  initMetrics();
  initCmap();
  initGlyphs();
  initVector();
  initOtl();
  initPreview();
  initConfig();
  initTools();

  // ─── Font Upload ──────────────────────────────────────────
  $('#fontInput')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadFont(file);
  });

  // ─── Download with progress ───────────────────────────────
  $('#downloadBtn')?.addEventListener('click', () => downloadWithProgress('ttf'));
  $('#downloadWoffBtn')?.addEventListener('click', () => downloadWithProgress('woff'));

  // ─── Drag & Drop ─────────────────────────────────────────
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', async e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await uploadFont(file);
  });

  // ─── Health check ────────────────────────────────────────
  fetch('/api/health').then(r => r.json()).then(d => {
    console.log('Backend connected:', d);
  }).catch(() => {
    console.warn('Backend not running. Start with: python app.py');
  });
}

async function uploadFont(file) {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await api('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    // 清空旧面板缓存
    resetState();
    state.SID = data.sessionId;
    state.fontInfo = data;
    $('#fontLabel').textContent = data.filename;
    $('#downloadBtn').disabled = false;
    $('#downloadWoffBtn').disabled = false;
    toast(`已加载: ${data.filename}`);
    showOverview(data);
    await loadAllPanels();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/** Download with progress bar */
async function downloadWithProgress(format) {
  if (!state.SID) return;

  const ext = format === 'woff' ? '.woff' : '.ttf';
  const filename = state.fontInfo.filename.replace(/\.\w+$/, ext);

  // Show progress overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="modal" style="max-width:400px;width:80%">
    <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">💾 导出 ${ext.toUpperCase().slice(1)}</h3>
    <div class="progress-bar" style="margin-bottom:8px">
      <div class="progress-fill" id="exportProgress" style="width:0%"></div>
    </div>
    <div style="font-size:12px;color:var(--tx-2)" id="exportStatus">准备中...</div>
  </div>`;
  document.body.appendChild(overlay);

  const progressFill = overlay.querySelector('#exportProgress');
  const statusEl = overlay.querySelector('#exportStatus');

  try {
    statusEl.textContent = '正在保存字体数据...';
    progressFill.style.width = '20%';

    const url = `/api/download/${state.SID}?format=${format}`;

    // Use fetch with progress
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');

    statusEl.textContent = '正在下载文件...';
    progressFill.style.width = '60%';

    const blob = await response.blob();

    statusEl.textContent = '完成!';
    progressFill.style.width = '100%';

    // Trigger download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

    toast(`已导出: ${filename}`);

    // Auto-close after 1s
    setTimeout(() => overlay.remove(), 1000);
  } catch (e) {
    statusEl.textContent = `错误: ${e.message}`;
    progressFill.style.width = '100%';
    progressFill.style.background = 'var(--err)';
    setTimeout(() => overlay.remove(), 3000);
  }
}

// ─── Start ──────────────────────────────────────────────────
init();
