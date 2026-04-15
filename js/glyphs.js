/**
 * TypeForge Pro — Glyphs Panel v4
 * - 多选字形批量修改度量参数
 * - 显示 fonttools 所有字形属性
 * - 虚拟滚动优化大量字形加载
 * - 支持添加新字形
 */
import { $, $$, state, api, toast } from './state.js';
import { switchToPanel } from './navigation.js';

const BATCH_SIZE = 100;  // 虚拟滚动批次大小
const ROW_HEIGHT = 88;    // 每行高度(px) — 含 gap
const COLS = 4;
const VISIBLE_BUFFER = 3; // 额外渲染的行数

let allGlyphs = [];       // 全量字形数据
let filteredGlyphs = []; // 过滤后的字形
let selectedGlyphs = new Set(); // 选中的字形
let previewFontUrl = '';
let _scrollTop = 0;
let _raf = null;

export function initGlyphs() {
  $('#glyphSearch')?.addEventListener('input', e => {
    filterAndRender(e.target.value);
  });
  
  // 全选
  $('#glyphSelectAll')?.addEventListener('click', () => selectAll());
  $('#glyphSelectNone')?.addEventListener('click', () => clearSelection());
  
  // 批量修改
  $('#glyphBatchEdit')?.addEventListener('click', () => showBatchEdit());
  $('#glyphBatchSave')?.addEventListener('click', () => saveBatchMetrics());
  
  // 添加新字形
  $('#glyphAddNew')?.addEventListener('click', () => showAddGlyphDialog());
  
  // 导出 SVG / PNG
  $('#glyphExportSvgBtn')?.addEventListener('click', () => exportGlyphs('svg'));
  $('#glyphExportPngBtn')?.addEventListener('click', () => exportGlyphs('png'));
  
  // 监听滚动（虚拟滚动）
  $('#glyphGrid')?.addEventListener('scroll', onScroll);
}

export async function loadGlyphs() {
  const res = await api(`/glyphs/${state.SID}`);
  const data = await res.json();
  allGlyphs = data.glyphs || [];
  filteredGlyphs = [...allGlyphs];
  selectedGlyphs.clear();
  _scrollTop = 0;

  const grid = $('#glyphGrid');
  if (grid) {
    grid.scrollTop = 0;
    // Wrap with a sizer so overflow-y:auto works correctly
    ensureGridSizer(grid);
  }

  updateCountDisplay();
  ensureFontFace();
  filterAndRender('');
  populateVecGlyphSelect();
}

/** Create or update the absolutely-positioned sizer inside grid */
function ensureGridSizer(grid) {
  let sizer = grid.querySelector('.glyph-sizer');
  if (!sizer) {
    sizer = document.createElement('div');
    sizer.className = 'glyph-sizer';
    sizer.style.cssText = 'position:absolute;top:0;left:0;width:1px;pointer-events:none';
    grid.appendChild(sizer);
  }
  const totalRows = Math.ceil(filteredGlyphs.length / COLS);
  sizer.style.height = `${totalRows * ROW_HEIGHT}px`;
}

/** @font-face */
function ensureFontFace() {
  if (!state.SID) return;
  previewFontUrl = `/api/preview/${state.SID}?t=${Date.now()}`;
  let styleEl = document.getElementById('glyphFontFace');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'glyphFontFace';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @font-face {
      font-family: 'GlyphPreviewFont';
      src: url('${previewFontUrl}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  `;
}

function filterAndRender(query = '') {
  const lf = query.toLowerCase();
  if (lf) {
    filteredGlyphs = allGlyphs.filter(g =>
      g.name.toLowerCase().includes(lf) ||
      (g.char && g.char.includes(lf)) ||
      (g.unicode !== null && g.unicode !== undefined && g.unicode.toString(16).includes(lf))
    );
  } else {
    filteredGlyphs = [...allGlyphs];
  }

  const grid = $('#glyphGrid');
  if (!grid) return;

  _scrollTop = 0;
  grid.scrollTop = 0;
  ensureGridSizer(grid);
  renderVisibleRows();
  updateCountDisplay();
}

function renderVisibleRows() {
  _raf = null;
  const grid = $('#glyphGrid');
  if (!grid) return;

  const containerH = grid.clientHeight || 600;
  const startRow = Math.max(0, Math.floor(_scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
  const endRow = Math.min(
    Math.ceil(filteredGlyphs.length / COLS),
    Math.ceil((_scrollTop + containerH) / ROW_HEIGHT) + VISIBLE_BUFFER
  );

  // Remove old row divs (keep .glyph-sizer)
  Array.from(grid.children).forEach(c => {
    if (!c.classList.contains('glyph-sizer')) c.remove();
  });

  for (let row = startRow; row < endRow; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'glyph-row';
    rowDiv.style.cssText = `position:absolute;top:${row * ROW_HEIGHT}px;left:0;right:0;height:${ROW_HEIGHT - 8}px;display:grid;grid-template-columns:repeat(${COLS},1fr);gap:8px;padding:0 4px`;

    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      if (idx >= filteredGlyphs.length) break;
      rowDiv.appendChild(createGlyphCard(filteredGlyphs[idx]));
    }
    grid.appendChild(rowDiv);
  }
}

function onScroll(e) {
  _scrollTop = e.target.scrollTop;
  if (!_raf) _raf = requestAnimationFrame(renderVisibleRows);
}

function createGlyphCard(g) {
  const card = document.createElement('div');
  card.className = 'glyph-card' + (selectedGlyphs.has(g.name) ? ' selected' : '');
  card.dataset.name = g.name;
  
  const charDisplay = g.char
    ? `<span class="glyph-char-font">${escHtml(g.char)}</span>`
    : `<span class="glyph-char-empty">○</span>`;

  card.innerHTML = `
    <div class="glyph-thumb" data-name="${g.name}">${charDisplay}</div>
    <div class="glyph-label" title="${escHtml(g.name)}">${escHtml(g.name)}</div>`;
  
  // 点击选中/取消选中
  card.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(g.name);
    } else {
      loadGlyphDetail(g.name);
    }
  });
  
  // 双击打开矢量编辑器
  card.addEventListener('dblclick', () => openGlyphInVectorEditor(g.name));
  
  return card;
}

function toggleSelection(name) {
  if (selectedGlyphs.has(name)) {
    selectedGlyphs.delete(name);
  } else {
    selectedGlyphs.add(name);
  }
  // 更新卡片样式
  const card = document.querySelector(`.glyph-card[data-name="${name}"]`);
  if (card) card.classList.toggle('selected', selectedGlyphs.has(name));
  updateCountDisplay();
}

function selectAll() {
  filteredGlyphs.forEach(g => selectedGlyphs.add(g.name));
  document.querySelectorAll('.glyph-card').forEach(c => c.classList.add('selected'));
  updateCountDisplay();
}

function clearSelection() {
  selectedGlyphs.clear();
  document.querySelectorAll('.glyph-card').forEach(c => c.classList.remove('selected'));
  updateCountDisplay();
}

function updateCountDisplay() {
  const sel = selectedGlyphs.size;
  $('#glyphCount').textContent = sel > 0
    ? `${filteredGlyphs.length} / 已选 ${sel}`
    : `${filteredGlyphs.length} 字形`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadGlyphDetail(name) {
  try {
    const encoded = encodeURIComponent(name);
    const res = await api(`/glyph/${state.SID}/${encoded}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    showGlyphDetailPanel(data);
  } catch (e) {
    const detail = $('#glyphDetail');
    if (detail) detail.innerHTML = `<p style="color:var(--err);font-size:12px">加载失败: ${escHtml(e.message)}</p><p style="color:var(--tx-3);font-size:11px">字形名: ${escHtml(name)}</p>`;
  }
}

function showGlyphDetailPanel(data) {
  const glyphInfo = allGlyphs.find(g => g.name === data.name);
  const charDisplay = glyphInfo?.char
    ? `<span style="font-family:'GlyphPreviewFont',sans-serif;font-size:100px;line-height:1;display:block;text-align:center;padding:10px 0">${escHtml(glyphInfo.char)}</span>`
    : '';
  
  // fonttools 完整属性
  const ft = data._fonttools || {};
  const typeLabel = data.isComposite ? '复合' : (data.isEmpty ? '空' : '简单');
  
  let componentsHtml = '';
  if (data.components && data.components.length > 0) {
    componentsHtml = `
      <div style="margin-top:8px">
        <span class="lbl">组件 (${data.components.length})</span>
        <div style="font-size:11px;color:var(--tx-2);max-height:80px;overflow:auto">
          ${data.components.map(c => `<div>${escHtml(c.glyphName)} (${c.x || 0}, ${c.y || 0})</div>`).join('')}
        </div>
      </div>`;
  }
  
  $('#glyphDetail').innerHTML = `
    ${charDisplay}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-top:8px">
      <div><span class="lbl">名称</span><div style="font-weight:600">${escHtml(data.name)}</div></div>
      <div><span class="lbl">类型</span><div><span class="tag ${data.isComposite ? 'tag-warn' : 'tag-ac'}">${typeLabel}</span></div></div>
      <div><span class="lbl">Unicode</span><div>${glyphInfo?.unicode ? 'U+' + glyphInfo.unicode.toString(16).toUpperCase().padStart(4, '0') : '—'}</div></div>
      <div><span class="lbl">轮廓数</span><div>${data.numberOfContours}</div></div>
      <div><span class="lbl">Advance Width</span><input class="fld" id="glyphAW" value="${data.advanceWidth}" type="number" style="width:80px;padding:3px 6px"></div>
      <div><span class="lbl">LSB</span><input class="fld" id="glyphLSB" value="${data.leftSideBearing}" type="number" style="width:80px;padding:3px 6px" readonly></div>
      <div><span class="lbl">xMin</span><div>${data.xMin}</div></div>
      <div><span class="lbl">xMax</span><div>${data.xMax}</div></div>
      <div><span class="lbl">yMin</span><div>${data.yMin}</div></div>
      <div><span class="lbl">yMax</span><div>${data.yMax}</div></div>
    </div>
    ${componentsHtml}
    <div style="margin-top:8px">
      <span class="lbl">点数</span><div>${ft.totalPoints || 0} | 轮廓 ${ft.totalContours || 0}</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-sm" id="glyphSaveMetrics">保存度量</button>
      <button class="btn-ghost btn-sm" id="glyphToVec">🖌️ 编辑</button>
      <button class="btn-ghost btn-sm" id="glyphBigPreview">🔍 大图</button>
      <button class="btn-ghost btn-sm" id="glyphSelectForBatch">☑ 选中</button>
      <button class="btn-ghost btn-sm" id="glyphExportSvg">SVG</button>
      <button class="btn-ghost btn-sm" id="glyphExportPng">PNG</button>
    </div>`;
  
  $('#glyphSaveMetrics')?.addEventListener('click', async () => {
    try {
      await api(`/glyph/${state.SID}/${encodeURIComponent(data.name)}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceWidth: +$('#glyphAW').value })
      });
      toast('字形度量已更新');
    } catch (e) { toast(e.message, 'err'); }
  });
  
  $('#glyphToVec')?.addEventListener('click', () => openGlyphInVectorEditor(data.name));
  
  $('#glyphBigPreview')?.addEventListener('click', () => showBigPreview(data, glyphInfo));
  
  $('#glyphSelectForBatch')?.addEventListener('click', () => {
    toggleSelection(data.name);
    showBatchEdit();
  });
  
  $('#glyphExportSvg')?.addEventListener('click', () => exportSingleGlyph(data.name, 'svg'));
  $('#glyphExportPng')?.addEventListener('click', () => exportSingleGlyph(data.name, 'png'));
}

function showBatchEdit() {
  if (selectedGlyphs.size === 0) {
    toast('请先选择要编辑的字形（Ctrl+点击）', 'warn');
    return;
  }
  
  $('#glyphDetail').innerHTML = `
    <div style="margin-bottom:12px">
      <span class="lbl">批量编辑 (${selectedGlyphs.size} 个字形)</span>
      <div style="font-size:11px;color:var(--tx-2)">所有选中字形的度量将同时更新</div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px">
        Advance Width:
        <input class="fld" id="batchAW" type="number" value="" placeholder="留空保持不变" style="width:100px;margin-left:8px">
      </label>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px">
        LSB 偏移:
        <input class="fld" id="batchLSB" type="number" value="" placeholder="留空保持不变" style="width:100px;margin-left:8px">
      </label>
    </div>
    <div style="margin-bottom:12px;font-size:11px;color:var(--tx-2)">
      选中: ${[...selectedGlyphs].slice(0, 10).join(', ')}${selectedGlyphs.size > 10 ? '...' : ''}
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm btn-ok" id="glyphBatchSave">应用</button>
      <button class="btn-ghost btn-sm" id="batchClearSel">清除选择</button>
    </div>`;
  
  $('#glyphBatchSave')?.addEventListener('click', saveBatchMetrics);
  $('#batchClearSel')?.addEventListener('click', () => {
    clearSelection();
    $('#glyphDetail').innerHTML = '<p style="color:var(--tx-2)">点击字形查看详情</p>';
  });
}

async function saveBatchMetrics() {
  const batchAW = $('#batchAW')?.value;
  const batchLSB = $('#batchLSB')?.value;
  
  if (!batchAW && !batchLSB) {
    toast('请输入要修改的值', 'warn');
    return;
  }
  
  const glyphs = [...selectedGlyphs].map(name => {
    const g = { name };
    if (batchAW) g.advanceWidth = parseInt(batchAW);
    if (batchLSB) g.leftSideBearing = parseInt(batchLSB);
    return g;
  });
  
  try {
    const res = await api(`/glyphs-batch-metrics/${state.SID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glyphs })
    });
    const result = await res.json();
    toast(`已更新 ${result.updatedCount} 个字形的度量`);
    clearSelection();
  } catch (e) {
    toast('批量更新失败: ' + e.message, 'err');
  }
}

function showAddGlyphDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h3 style="font-size:18px;font-weight:700;margin-bottom:16px">添加新字形</h3>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;display:block;margin-bottom:4px">字形名称 *</label>
        <input class="fld" id="newGlyphName" placeholder="如: uni4E00" style="width:100%">
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;display:block;margin-bottom:4px">Unicode (可选)</label>
        <input class="fld" id="newGlyphUnicode" placeholder="如: 4E00" style="width:100%">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-ghost btn-sm" id="addGlyphCancel">取消</button>
        <button class="btn btn-sm btn-ok" id="addGlyphConfirm">创建</button>
      </div>
    </div>`;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('#addGlyphCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#addGlyphConfirm').addEventListener('click', async () => {
    const name = $('#newGlyphName')?.value.trim();
    const unicodeStr = $('#newGlyphUnicode')?.value.trim();
    
    if (!name) {
      toast('请输入字形名称', 'warn');
      return;
    }
    
    let unicode = null;
    if (unicodeStr) {
      unicode = parseInt(unicodeStr, 16);
      if (isNaN(unicode)) {
        toast('Unicode 格式错误', 'err');
        return;
      }
    }
    
    try {
      await api(`/glyphs/${state.SID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unicode })
      });
      toast(`字形 ${name} 已创建`);
      overlay.remove();
      loadGlyphs(); // 刷新列表
    } catch (e) {
      toast('创建失败: ' + e.message, 'err');
    }
  });
  
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function openGlyphInVectorEditor(name) {
  switchToPanel('vector');
  const sel = $('#vecGlyphSelect');
  if (sel) sel.value = name;
  setTimeout(() => document.getElementById('vecLoadBtn')?.click(), 100);
}

function showBigPreview(data, glyphInfo) {
  const bounds = data.bounds || [0, -200, 500, 800];
  const w = (bounds[2] - bounds[0]) || 500;
  const h = Math.abs(bounds[3] - bounds[1]) || 800;
  const pad = 40;
  const em = 1000;
  
  const charPreview = glyphInfo?.char
    ? `<div style="font-family:'GlyphPreviewFont',sans-serif;font-size:200px;line-height:1;text-align:center;padding:20px">${escHtml(glyphInfo.char)}</div>`
    : '';
  
  let svg = `<svg viewBox="${bounds[0] - pad} ${-bounds[3] - pad} ${w + pad * 2} ${h + pad * 2}" width="100%" height="100%" style="background:var(--bg-2)">`;
  for (let i = 0; i <= em; i += 100) {
    svg += `<line x1="0" y1="${-i}" x2="${em}" y2="${-i}" stroke="var(--bd)" stroke-width="0.3"/>`;
    svg += `<line x1="${i}" y1="0" x2="${i}" y2="${-em}" stroke="var(--bd)" stroke-width="0.3"/>`;
  }
  svg += `<line x1="-50" y1="0" x2="${em + 50}" y2="0" stroke="var(--ok)" stroke-width="0.8"/>`;
  if (data.path) {
    svg += `<path d="${data.path}" fill="var(--ac)" fill-opacity="0.2" stroke="var(--ac)" stroke-width="2" transform="scale(1,-1)"/>`;
  }
  svg += '</svg>';
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="modal" style="max-width:600px;width:95%">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:18px;font-weight:700">${escHtml(data.name)}</h3>
      <button class="btn-ghost btn-sm" id="bigPreviewClose">关闭</button>
    </div>
    ${charPreview}
    <div style="height:350px">${svg}</div>
    <div style="margin-top:8px;font-size:11px;color:var(--tx-2)">
      Bounds: [${data.xMin}, ${data.yMin}] → [${data.xMax}, ${data.yMax}] | 
      Advance: ${data.advanceWidth} | LSB: ${data.leftSideBearing}
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#bigPreviewClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function populateVecGlyphSelect() {
  const sel = $('#vecGlyphSelect');
  if (!sel) return;
  const fragment = document.createDocumentFragment();
  for (const g of allGlyphs) {
    const opt = document.createElement('option');
    opt.value = g.name;
    opt.textContent = `${g.char || ''} ${g.name}`;
    fragment.appendChild(opt);
  }
  sel.innerHTML = '';
  sel.appendChild((fragment));
}

// ─── Export Functions ──────────────────────────────────────────

async function exportSingleGlyph(name, format) {
  if (!state.SID) return;
  const ext = format.toUpperCase();
  toast(`正在导出 ${name}.${ext}...`);
  try {
    const url = `/api/glyph/${state.SID}/${encodeURIComponent(name)}/export/${format}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '导出失败' }));
      throw new Error(err.error);
    }
    const blob = await res.blob();
    triggerDownload(blob, `${name}.${format}`);
    toast(`已导出: ${name}.${format}`);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function exportGlyphs(format) {
  if (!state.SID) {
    toast('请先加载字体', 'warn');
    return;
  }

  // Determine which glyphs to export: selected > filtered > all
  let names;
  if (selectedGlyphs.size > 0) {
    names = [...selectedGlyphs];
  } else {
    names = filteredGlyphs.map(g => g.name);
  }

  if (names.length === 0) {
    toast('没有可导出的字形', 'warn');
    return;
  }

  const ext = format.toUpperCase();
  const label = selectedGlyphs.size > 0
    ? `${selectedGlyphs.size} 个选中字形`
    : `${names.length} 个字形`;

  // Single glyph: download directly, no zip
  if (names.length === 1) {
    await exportSingleGlyph(names[0], format);
    return;
  }

  // Multi: zip download
  toast(`正在打包 ${label} 为 ${ext} ZIP...`);
  try {
    const res = await api(`/glyphs/${state.SID}/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names })
    });
    const blob = await res.blob();
    const basename = state.fontInfo?.filename?.replace(/\.\w+$/, '') || 'glyphs';
    triggerDownload(blob, `${basename}_glyphs_${format}.zip`);
    toast(`已导出 ${label} → ${ext} ZIP`);
  } catch (e) {
    toast('导出失败: ' + e.message, 'err');
  }
}

function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
