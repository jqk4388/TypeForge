/**
 * TypeForge Pro — Names Panel (Inline Editable)
 * V2: No modal dialogs, inline row editing, dropdown pickers, loading states
 */
import { $, state, api, toast, getPlatformName, getLanguageName, loadPlatformInfo } from './state.js';

// OpenType nameID 定义表
const NAME_ID_MAP = {
  0: '版权声明',
  1: '字体族名 (Family)',
  2: '子族名 (Subfamily)',
  3: '唯一标识 (Unique ID)',
  4: '全名 (Full Name)',
  5: '版本 (Version)',
  6: 'PostScript名称',
  7: '商标 (Trademark)',
  8: '厂商 (Manufacturer)',
  9: '设计师 (Designer)',
  10: '描述 (Description)',
  11: '厂商URL (Vendor URL)',
  12: '设计者URL (Designer URL)',
  13: '许可证描述（License Description）',
  14: '许可证URL（License Info URL）',
  15: '预留（Reserved）',
  16: '首选族名 (Typographic)',
  17: '首选子族名 (Typographic)',
  18: 'MAC兼容全名 (Compatible Full)',
  19: '样本文本 (Sample Text)',
  20: 'PostScript CID查找名',
  21: 'WWS 族名 (WWS Family)',
  22: 'WWS 子族名 (WWS Subfamily)',
  23: '浅色背景调色板名称',
  24: '深色背景调色板名称',
  25: '可变字体PostScript前缀',
  255: '预留（Reserved）',
  256: '内部版本号',
  257: '字符覆盖统计',
  258: '客户定制',
  259: '内部测试信息',
};

// Common nameIDs for dropdown quick-pick
const COMMON_NAME_IDS = [
  { value: 0, label: '0 — 版权声明' },
  { value: 1, label: '1 — 字体族名 (Family)' },
  { value: 2, label: '2 — 子族名 (Subfamily)' },
  { value: 3, label: '3 — 唯一标识 (Unique ID)' },
  { value: 4, label: '4 — 全名 (Full Name)' },
  { value: 5, label: '5 — 版本 (Version)' },
  { value: 6, label: '6 — PostScript名称' },
  { value: 7, label: '7 — 商标 (Trademark)' },
  { value: 8, label: '8 — 厂商 (Manufacturer)' },
  { value: 9, label: '9 — 设计师 (Designer)' },
  { value: 10, label: '10 — 描述 (Description)' },
  { value: 11, label: '11 — 厂商URL' },
  { value: 12, label: '12 — 设计者URL' },
  { value: 13, label: '13 — 许可证描述' },
  { value: 14, label: '14 — 许可证URL' },
  { value: 16, label: '16 — 首选族名 (Typographic)' },
  { value: 17, label: '17 — 首选子族名 (Typographic)' },
  { value: 18, label: '18 — MAC兼容全名' },
  { value: 19, label: '19 — 样本文本' },
  { value: 25, label: '25 — 可变字体PS前缀' },
  { value: 256, label: '256 — 内部版本号' },
  { value: 257, label: '257 — 字符覆盖统计' },
  { value: 258, label: '258 — 客户定制' },
  { value: 259, label: '259 — 内部测试信息' },
];

// Platform definitions
const PLATFORMS = [
  { id: 0, name: 'Unicode', encodings: [{ id: 0, name: '1.0' }, { id: 1, name: '1.1' }, { id: 2, name: 'ISO 10646' }, { id: 3, name: 'BMP UCS-2' }, { id: 4, name: 'Full UCS-4' }] },
  { id: 1, name: 'Macintosh', encodings: [{ id: 0, name: 'Roman' }] },
  { id: 3, name: 'Windows', encodings: [{ id: 0, name: 'Symbol' }, { id: 1, name: 'Unicode BMP' }, { id: 10, name: 'Unicode Full' }] },
];

// Common Windows languages for dropdown
const COMMON_WIN_LANGS = [
  { id: 0x0409, name: '英语(美国)' },
  { id: 0x0809, name: '英语(英国)' },
  { id: 0x0804, name: '简体中文(中国)' },
  { id: 0x0404, name: '繁体中文(台湾)' },
  { id: 0x0C04, name: '繁体中文(香港)' },
  { id: 0x0411, name: '日语' },
  { id: 0x0412, name: '韩语' },
  { id: 0x0407, name: '德语(德国)' },
  { id: 0x040C, name: '法语(法国)' },
  { id: 0x0410, name: '意大利语(意大利)' },
  { id: 0x0416, name: '葡萄牙语(巴西)' },
  { id: 0x0419, name: '俄语' },
  { id: 0x0413, name: '荷兰语(荷兰)' },
  { id: 0x0415, name: '波兰语' },
  { id: 0x040E, name: '匈牙利语' },
  { id: 0x0405, name: '捷克语' },
  { id: 0x041E, name: '泰语' },
  { id: 0x0403, name: '加泰罗尼亚语' },
  { id: 0x042A, name: '越南语' },
];

const COMMON_MAC_LANGS = [
  { id: 0, name: '英语' },
  { id: 33, name: '简体中文' },
  { id: 34, name: '繁体中文' },
  { id: 35, name: '日语' },
  { id: 25, name: '韩语' },
  { id: 19, name: '阿拉伯语' },
  { id: 12, name: '希腊语' },
  { id: 13, name: '土耳其语' },
  { id: 14, name: '乌克兰语' },
  { id: 20, name: '希伯来语' },
  { id: 24, name: '泰语' },
  { id: 30, name: '越南语' },
];

function getNameIDLabel(nameID) {
  return NAME_ID_MAP[nameID] || '';
}

// ─── Status bar (loading indicator) ──────────────────────────────

let _statusTimeout = null;
function showStatus(msg, type = 'loading') {
  const bar = $('#nameStatusBar');
  if (!bar) return;
  bar.textContent = msg;
  bar.className = 'name-status-bar status-' + type;
  bar.style.display = 'flex';
  clearTimeout(_statusTimeout);
  if (type === 'ok' || type === 'err') {
    _statusTimeout = setTimeout(() => { bar.style.display = 'none'; }, 3000);
  }
}
function hideStatus() {
  const bar = $('#nameStatusBar');
  if (bar) bar.style.display = 'none';
  clearTimeout(_statusTimeout);
}

// ─── Helpers ─────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getEncodingsForPlatform(platID) {
  const plat = PLATFORMS.find(p => p.id === platID);
  return plat ? plat.encodings : [{ id: 0, name: 'Unknown' }];
}

function getLanguagesForPlatform(platID) {
  if (platID === 3) return COMMON_WIN_LANGS;
  if (platID === 1) return COMMON_MAC_LANGS;
  return [{ id: 0, name: '默认 (0x0000)' }];
}

function getDefaultEncoding(platID) {
  if (platID === 3) return 1;
  return 0;
}

function getDefaultLang(platID) {
  if (platID === 3) return 0x0409;
  if (platID === 1) return 0;
  return 0;
}

// Build nameID <option> HTML for a select
function buildNameIDOptions(selectedID) {
  let html = '<option value="">选择 nameID...</option>';
  for (const item of COMMON_NAME_IDS) {
    const sel = item.value === selectedID ? ' selected' : '';
    html += `<option value="${item.value}"${sel}>${escHtml(item.label)}</option>`;
  }
  // Custom option at end
  if (!COMMON_NAME_IDS.find(n => n.value === selectedID) && selectedID != null) {
    html += `<option value="${selectedID}" selected>${selectedID} — 自定义</option>`;
  }
  html += '<option value="__custom">自定义 nameID...</option>';
  return html;
}

function buildPlatformOptions(selectedID) {
  let html = '';
  for (const p of PLATFORMS) {
    const sel = p.id === selectedID ? ' selected' : '';
    html += `<option value="${p.id}"${sel}>${p.name} (${p.id})</option>`;
  }
  return html;
}

function buildEncodingOptions(platID, selectedID) {
  const encs = getEncodingsForPlatform(platID);
  let html = '';
  for (const e of encs) {
    const sel = e.id === selectedID ? ' selected' : '';
    html += `<option value="${e.id}"${sel}>${e.name} (${e.id})</option>`;
  }
  return html;
}

function buildLanguageOptions(platID, selectedID) {
  const langs = getLanguagesForPlatform(platID);
  let html = '';
  for (const l of langs) {
    const sel = l.id === selectedID ? ' selected' : '';
    html += `<option value="${l.id}"${sel}>${escHtml(l.name)} (0x${l.id.toString(16).toUpperCase().padStart(4, '0')})</option>`;
  }
  html += `<option value="__custom"${!langs.find(l => l.id === selectedID) && selectedID != null ? ' selected' : ''}>自定义...</option>`;
  return html;
}

// ─── Init ────────────────────────────────────────────────────────

export async function initNames() {
  await loadPlatformInfo();

  $('#nameSearch')?.addEventListener('input', e => renderNameTable(e.target.value));
  $('#nameAddBtn')?.addEventListener('click', onAddRow);
  $('#nameQuickBtn')?.addEventListener('click', toggleQuickEdit);
  $('#nameBatchBtn')?.addEventListener('click', onBatchReplace);
  $('#namePSBtn')?.addEventListener('click', togglePSPanel);
}

export async function loadNames() {
  showStatus('正在加载名称表...');
  try {
    const res = await api(`/name/${state.SID}`);
    const data = await res.json();
    state.nameRecords = data.records || [];
    renderNameTable($('#nameSearch')?.value || '');
    showStatus(`已加载 ${state.nameRecords.length} 条名称记录`, 'ok');
  } catch (e) {
    showStatus('加载失败: ' + e.message, 'err');
    toast(e.message, 'err');
  }
}

// ─── Render Table ────────────────────────────────────────────────

function renderNameTable(filter = '') {
  const lf = filter.toLowerCase();
  const tbody = $('#nameTable tbody');
  tbody.innerHTML = '';

  state.nameRecords.forEach((r, i) => {
    const nidLabel = getNameIDLabel(r.nameID);
    if (lf && !`${r.nameID} ${nidLabel} ${r.value}`.toLowerCase().includes(lf)) return;

    const tr = document.createElement('tr');
    tr.dataset.idx = i;
    tr.className = 'name-row';

    // Build the editable row
    tr.innerHTML = `
      <td class="name-cell name-cell-nid">
        <select class="fld name-select-nid" data-idx="${i}" data-field="nameID">
          ${buildNameIDOptions(r.nameID)}
        </select>
        ${nidLabel ? `<div class="name-nid-label">${escHtml(nidLabel)}</div>` : ''}
      </td>
      <td class="name-cell">
        <select class="fld name-select-plat" data-idx="${i}" data-field="platformID">
          ${buildPlatformOptions(r.platformID)}
        </select>
      </td>
      <td class="name-cell">
        <select class="fld name-select-enc" data-idx="${i}" data-field="encodingID">
          ${buildEncodingOptions(r.platformID, r.encodingID)}
        </select>
      </td>
      <td class="name-cell">
        <select class="fld name-select-lang" data-idx="${i}" data-field="langID">
          ${buildLanguageOptions(r.platformID, r.langID)}
        </select>
      </td>
      <td class="name-cell name-cell-value">
        <input class="fld name-input-value" data-idx="${i}" value="${escHtml(r.value)}" style="min-width:200px">
      </td>
      <td class="name-cell name-cell-actions">
        <button class="btn-ghost btn-sm name-save-btn" data-idx="${i}" title="保存 (Ctrl+Enter)">✓</button>
        <button class="btn-ghost btn-sm name-del-btn" data-idx="${i}" title="删除">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });

  bindRowEvents();
}

// ─── Bind Events ─────────────────────────────────────────────────

function bindRowEvents() {
  const tbody = $('#nameTable tbody');

  // Platform change → update encoding & language dropdowns
  tbody.querySelectorAll('.name-select-plat').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = +sel.dataset.idx;
      const row = sel.closest('tr');
      const newPlatID = +sel.value;
      const encSel = row.querySelector('.name-select-enc');
      const langSel = row.querySelector('.name-select-lang');
      encSel.innerHTML = buildEncodingOptions(newPlatID, getDefaultEncoding(newPlatID));
      langSel.innerHTML = buildLanguageOptions(newPlatID, getDefaultLang(newPlatID));
      markRowDirty(row);
    });
  });

  // NameID custom value
  tbody.querySelectorAll('.name-select-nid').forEach(sel => {
    sel.addEventListener('change', () => {
      const row = sel.closest('tr');
      if (sel.value === '__custom') {
        // Replace select with input for custom nameID
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'fld name-input-nid';
        input.dataset.idx = sel.dataset.idx;
        input.dataset.field = 'nameID';
        input.style.width = '90px';
        input.placeholder = 'nameID';
        sel.replaceWith(input);
        input.focus();
        markRowDirty(row);
      } else {
        // Update label
        const label = row.querySelector('.name-nid-label');
        if (label) {
          const nid = +sel.value;
          label.textContent = getNameIDLabel(nid) || '';
        }
        markRowDirty(row);
      }
    });
  });

  // Language custom value
  tbody.querySelectorAll('.name-select-lang').forEach(sel => {
    sel.addEventListener('change', () => {
      const row = sel.closest('tr');
      if (sel.value === '__custom') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fld name-input-lang';
        input.dataset.idx = sel.dataset.idx;
        input.dataset.field = 'langID';
        input.style.width = '90px';
        input.placeholder = '0x0409';
        sel.replaceWith(input);
        input.focus();
        markRowDirty(row);
      } else {
        markRowDirty(row);
      }
    });
  });

  // Value input — mark dirty on change
  tbody.querySelectorAll('.name-input-value').forEach(inp => {
    inp.addEventListener('input', () => markRowDirty(inp.closest('tr')));
    // Ctrl+Enter to save
    inp.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') {
        saveRow(+inp.dataset.idx);
      }
    });
  });

  // Save button
  tbody.querySelectorAll('.name-save-btn').forEach(btn => {
    btn.addEventListener('click', () => saveRow(+btn.dataset.idx));
  });

  // Delete button
  tbody.querySelectorAll('.name-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRow(+btn.dataset.idx));
  });
}

function markRowDirty(row) {
  row.classList.add('row-dirty');
  const btn = row.querySelector('.name-save-btn');
  if (btn) btn.classList.add('btn-dirty');
}

function clearRowDirty(row) {
  row.classList.remove('row-dirty');
  const btn = row.querySelector('.name-save-btn');
  if (btn) btn.classList.remove('btn-dirty');
}

// ─── Save Row ────────────────────────────────────────────────────

async function saveRow(idx) {
  const row = document.querySelector(`tr[data-idx="${idx}"]`);
  if (!row) return;
  const r = state.nameRecords[idx];
  if (!r) return;

  // Read values from the DOM
  const nameIDEl = row.querySelector('.name-select-nid') || row.querySelector('.name-input-nid');
  const platEl = row.querySelector('.name-select-plat');
  const encEl = row.querySelector('.name-select-enc');
  const langEl = row.querySelector('.name-select-lang') || row.querySelector('.name-input-lang');
  const valEl = row.querySelector('.name-input-value');

  let nameID, platformID, encodingID, langID, value;

  nameID = nameIDEl ? (nameIDEl.tagName === 'SELECT' ? +nameIDEl.value : +nameIDEl.value) : r.nameID;
  platformID = platEl ? +platEl.value : r.platformID;
  encodingID = encEl ? +encEl.value : r.encodingID;

  if (langEl && langEl.tagName === 'SELECT') {
    langID = langEl.value === '__custom' ? r.langID : +langEl.value;
  } else if (langEl && langEl.tagName === 'INPUT') {
    // Support "0x0409" or "1033" format
    langID = langEl.value.trim();
    if (langID.startsWith('0x') || langID.startsWith('0X')) {
      langID = parseInt(langID, 16);
    } else {
      langID = +langID;
    }
  } else {
    langID = r.langID;
  }

  value = valEl ? valEl.value : r.value;

  if (isNaN(nameID) || isNaN(platformID) || isNaN(encodingID) || isNaN(langID)) {
    toast('nameID、平台、编码、语言必须是有效数字', 'err');
    return;
  }

  showStatus(`正在保存 nameID ${nameID}...`);
  const saveBtn = row.querySelector('.name-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

  try {
    await api(`/name/${state.SID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameID, platformID, encodingID, langID, value })
    });

    // Update local state
    r.nameID = nameID;
    r.platformID = platformID;
    r.encodingID = encodingID;
    r.langID = langID;
    r.value = value;

    clearRowDirty(row);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓'; }
    showStatus(`nameID ${nameID} 已保存`, 'ok');

    // Re-render to update label display
    renderNameTable($('#nameSearch')?.value || '');
  } catch (e) {
    showStatus('保存失败: ' + e.message, 'err');
    toast(e.message, 'err');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓'; }
  }
}

// ─── Delete Row ──────────────────────────────────────────────────

async function deleteRow(idx) {
  const row = document.querySelector(`tr[data-idx="${idx}"]`);
  if (!row) return;
  const r = state.nameRecords[idx];
  if (!r) return;

  showStatus(`正在删除 nameID ${r.nameID}...`);

  try {
    await api(`/name/${state.SID}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameID: r.nameID, platformID: r.platformID, langID: r.langID })
    });
    state.nameRecords.splice(idx, 1);
    renderNameTable($('#nameSearch')?.value || '');
    showStatus(`nameID ${r.nameID} 已删除`, 'ok');
  } catch (e) {
    showStatus('删除失败: ' + e.message, 'err');
    toast(e.message, 'err');
  }
}

// ─── Add Row (inline, no modal) ─────────────────────────────────

function onAddRow() {
  // Insert a new empty record at the beginning of local state
  const newRecord = {
    nameID: 256,
    platformID: 3,
    encodingID: 1,
    langID: 0x0409,
    value: ''
  };
  state.nameRecords.unshift(newRecord);
  renderNameTable($('#nameSearch')?.value || '');

  // Focus the nameID select of the new row
  const firstRow = $('#nameTable tbody tr:first-child');
  if (firstRow) {
    firstRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const nameSelect = firstRow.querySelector('.name-select-nid');
    if (nameSelect) nameSelect.focus();
    markRowDirty(firstRow);
  }
  showStatus('新行已添加 — 编辑后点击 ✓ 保存', 'loading');
}

// ─── Quick Edit Panel (unchanged logic, just works with new table) ─

function toggleQuickEdit() {
  const panel = $('#nameQuickEdit');
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const common = { 1: '字体族名', 2: '子族名', 3: '唯一标识', 4: '全名', 5: '版本', 6: 'PostScript名', 7: '商标', 8: '厂商', 9: '设计师', 10: '描述', 11: '厂商URL', 12: '设计者URL', 13: '许可证说明', 14: '许可证URL', 16: '字体族名(Typo)', 17: '子族名(Typo)', 19: '样本文本' };
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">';
  for (const [nid, label] of Object.entries(common)) {
    const rec = state.nameRecords.find(r => r.nameID == nid && r.platformID == 3);
    const val = rec ? rec.value : '';
    html += `<div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:11px;color:var(--tx-2);min-width:80px">${nid}: ${label}</span>
      <input class="fld quick-name" data-nid="${nid}" value="${escHtml(val)}" style="flex:1">
    </div>`;
  }
  html += '</div><button class="btn btn-sm" id="quickNameSave" style="margin-top:8px">保存全部</button>';
  panel.innerHTML = html;

  $('#quickNameSave')?.addEventListener('click', async () => {
    showStatus('正在批量保存快捷名称...');
    const fields = panel.querySelectorAll('.quick-name');
    let saved = 0;
    for (const f of fields) {
      const nid = +f.dataset.nid;
      const value = f.value;
      if (value === '') continue;
      try {
        await api(`/name/${state.SID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nameID: nid, value })
        });
        f.classList.add('mod');
        saved++;
      } catch (e) { }
    }
    await loadNames();
    showStatus(`已保存 ${saved} 项快捷名称`, 'ok');
    toast(`快捷名称已更新 (${saved} 项)`);
  });
}

// ─── Batch Replace (no modal — use inline inputs) ────────────────

async function onBatchReplace() {
  // Create inline replace UI
  const panel = $('#nameQuickEdit');
  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <span style="font-size:12px;font-weight:600">批量替换</span>
      <input class="fld" id="batchFind" placeholder="查找..." style="max-width:200px">
      <input class="fld" id="batchReplace" placeholder="替换为..." style="max-width:200px">
      <button class="btn btn-sm" id="batchReplaceRun">替换</button>
      <button class="btn-ghost btn-sm" id="batchReplaceClose">关闭</button>
    </div>
    <div id="batchReplaceResult" style="font-size:12px;color:var(--tx-2)"></div>
  `;

  document.getElementById('batchReplaceClose')?.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  document.getElementById('batchReplaceRun')?.addEventListener('click', async () => {
    const find = document.getElementById('batchFind')?.value || '';
    const replace = document.getElementById('batchReplace')?.value || '';
    if (!find) { toast('请输入查找内容', 'err'); return; }

    showStatus('正在批量替换...');
    try {
      const res = await api(`/name/${state.SID}/batch-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ find, replace })
      });
      const data = await res.json();
      await loadNames();
      const resultEl = document.getElementById('batchReplaceResult');
      if (resultEl) resultEl.textContent = `替换了 ${data.replaced} 处`;
      showStatus(`批量替换完成，${data.replaced} 处`, 'ok');
      toast(`已替换 ${data.replaced} 处`);
    } catch (e) {
      showStatus('批量替换失败: ' + e.message, 'err');
      toast(e.message, 'err');
    }
  });
}

// ─── PostScript Name Generator (Adobe TN #5902) ──────────────────

async function togglePSPanel() {
  const panel = $('#namePSPanel');
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  panel.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tx-2)">加载中...</div>';
  showStatus('正在生成 PostScript 名称...');
  await renderPSPanel();
}

async function renderPSPanel() {
  const panel = $('#namePSPanel');
  try {
    const res = await api(`/ps-name/${state.SID}`);
    const data = await res.json();
    if (data.error) {
      panel.innerHTML = `<div style="color:var(--err)">错误: ${escHtml(data.error)}</div>`;
      showStatus('PS 名称生成失败', 'err');
      return;
    }
    hideStatus();

    let html = '';

    // Header
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:16px">🔤</span>
      <span style="font-weight:600">PostScript 名称生成器</span>
      <span style="font-size:11px;color:var(--tx-3)">Adobe TN #5902</span>
      ${data.isVariable
        ? '<span style="font-size:10px;background:var(--ac);color:#fff;padding:2px 6px;border-radius:4px">可变字体</span>'
        : '<span style="font-size:10px;background:var(--tx-3);color:#fff;padding:2px 6px;border-radius:4px">静态字体</span>'}
    </div>`;

    // Warnings
    if (data.warnings && data.warnings.length > 0) {
      html += '<div style="margin-bottom:12px">';
      for (const w of data.warnings) {
        html += `<div style="font-size:12px;color:var(--warn);margin-bottom:4px">⚠ ${escHtml(w)}</div>`;
      }
      html += '</div>';
    }

    // Current PS name
    if (data.currentPSName) {
      html += `<div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--tx-2);margin-bottom:4px">当前 PostScript 名称 (nameID 6)</div>
        <div style="display:flex;align-items:center;gap:8px">
          <code style="font-size:13px;background:var(--bg-2);padding:4px 10px;border-radius:4px;flex:1;word-break:break-all">${escHtml(data.currentPSName)}</code>
          <span style="font-size:10px;color:var(--tx-3)">${data.currentPSName.length}/127</span>
        </div>
      </div>`;
    }

    // Family prefix section
    html += `<div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--tx-2);margin-bottom:4px">
        族名前缀 ${data.hasName25 ? '(来自 nameID 25)' : '(来自 nameID 16/1)'}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <code style="font-size:13px;background:var(--bg-2);padding:4px 10px;border-radius:4px;flex:1;word-break:break-all">${escHtml(data.familyPrefix || '(空)')}</code>
        <input class="fld ps-prefix-input" value="${escHtml(data.familyPrefix || '')}" placeholder="自定义前缀..." style="width:180px">
        <button class="btn btn-sm ps-prefix-btn" style="white-space:nowrap">设置前缀</button>
      </div>
    </div>`;

    // Variable font sections
    if (data.isVariable && data.namedInstances) {
      html += `<div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">命名实例</div>
        <table style="width:100%;font-size:12px">
          <thead><tr style="color:var(--tx-2)">
            <th style="text-align:left;padding:4px 6px">实例名</th>
            <th style="text-align:left;padding:4px 6px">生成的 PS 名称</th>
            <th style="text-align:left;padding:4px 6px">算法</th>
            <th style="text-align:center;padding:4px 6px">长度</th>
            <th style="padding:4px 6px"></th>
          </tr></thead><tbody>`;

      for (const inst of data.namedInstances) {
        const validColor = inst.valid ? 'var(--ok)' : 'var(--err)';
        const algoLabels = { named_instance: '命名', arbitrary: '任意坐标', last_resort: '最后手段' };
        const coordsStr = Object.entries(inst.coordinates)
          .map(([k, v]) => `${k}=${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`)
          .join(', ');

        html += `<tr>
          <td style="padding:4px 6px" title="${escHtml(coordsStr)}">${escHtml(inst.name)}</td>
          <td style="padding:4px 6px"><code style="font-size:11px">${escHtml(inst.psName)}</code></td>
          <td style="padding:4px 6px;color:var(--tx-3)">${algoLabels[inst.algorithm] || inst.algorithm}</td>
          <td style="padding:4px 6px;text-align:center;color:${validColor}">${inst.length}</td>
          <td style="padding:4px 6px">
            <button class="btn-ghost btn-sm ps-apply-btn" data-name="${escHtml(inst.psName)}" title="应用到 nameID 6">✓</button>
          </td>
        </tr>`;
      }
      html += '</tbody></table></div>';

      // Arbitrary instance examples
      if (data.arbitraryExamples && data.arbitraryExamples.length > 0) {
        html += `<div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px">任意坐标示例</div>
          <table style="width:100%;font-size:12px">
            <thead><tr style="color:var(--tx-2)">
              <th style="text-align:left;padding:4px 6px">坐标</th>
              <th style="text-align:left;padding:4px 6px">生成的 PS 名称</th>
              <th style="text-align:center;padding:4px 6px">长度</th>
              <th style="padding:4px 6px"></th>
            </tr></thead><tbody>`;

        for (const ex of data.arbitraryExamples) {
          const validColor = ex.valid ? 'var(--ok)' : 'var(--err)';
          const coordsStr = Object.entries(ex.coordinates)
            .map(([k, v]) => `${k}=${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`)
            .join(', ');

          html += `<tr>
            <td style="padding:4px 6px;font-size:11px;color:var(--tx-2)">${coordsStr}</td>
            <td style="padding:4px 6px"><code style="font-size:11px">${escHtml(ex.psName)}</code></td>
            <td style="padding:4px 6px;text-align:center;color:${validColor}">${ex.length}</td>
            <td style="padding:4px 6px">
              <button class="btn-ghost btn-sm ps-apply-btn" data-name="${escHtml(ex.psName)}" title="应用到 nameID 6">✓</button>
            </td>
          </tr>`;
        }
        html += '</tbody></table></div>';

        // Axes info
        if (data.axes && data.axes.length > 0) {
          html += `<div style="font-size:11px;color:var(--tx-3);margin-bottom:8px">
            变体轴: ${data.axes.map(a => `${a.tag} (${a.min}–${a.max}, 默认 ${a.default})`).join(' · ')}
          </div>`;
        }
      }
    }

    // Static font info
    if (!data.isVariable) {
      html += `<div style="font-size:12px;color:var(--tx-2);margin-bottom:8px">
        静态字体：族名前缀可作为 PostScript 名称基础。建议将 nameID 6 设置为合规的 ASCII 字母数字名称。
      </div>`;
      if (data.generated) {
        html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <code style="font-size:13px;background:var(--bg-2);padding:4px 10px;border-radius:4px">${escHtml(data.generated)}</code>
          <button class="btn btn-sm ps-apply-btn" data-name="${escHtml(data.generated)}">应用到 nameID 6</button>
        </div>`;
      }
    }

    // Algorithm reference
    html += `<details style="margin-top:12px">
      <summary style="font-size:11px;color:var(--tx-3);cursor:pointer">算法参考 (Adobe TN #5902)</summary>
      <div style="font-size:11px;color:var(--tx-3);margin-top:8px;line-height:1.6">
        <b>1. 前缀</b>: nameID 25 (Variations PS Name Prefix) → nameID 16 (Typo Family) → nameID 1 (Family)<br>
        <b>2. 命名实例</b>: 前缀 + "-" + 净化子族名（去非ASCII字母数字）<br>
        <b>3. 任意实例</b>: 前缀 + "_值轴tag"（默认值坐标可省略，16.16定点精度）<br>
        <b>4. 最后手段</b>: 超过127字符时，前缀 + "-" + 标识符 + "..."<br>
        <b>限制</b>: PS 名称最长 127 字符，仅允许 ASCII 字母数字 + "-_."
      </div>
    </details>`;

    panel.innerHTML = html;

    // Bind apply buttons
    panel.querySelectorAll('.ps-apply-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (!name) return;
        showStatus('正在应用 PS 名称...');
        btn.disabled = true;
        btn.textContent = '…';
        try {
          await api(`/ps-name/${state.SID}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ psName: name })
          });
          btn.style.color = 'var(--ok)';
          btn.disabled = false;
          btn.textContent = '✓';
          showStatus(`PS 名称已设为: ${name}`, 'ok');
          toast(`PS 名称已设为: ${name}`);
          await loadNames();
        } catch (e) {
          toast(e.message, 'err');
          showStatus('应用失败: ' + e.message, 'err');
          btn.disabled = false;
          btn.textContent = '✓';
        }
      });
    });

    // Bind prefix set button
    panel.querySelector('.ps-prefix-btn')?.addEventListener('click', async () => {
      const input = panel.querySelector('.ps-prefix-input');
      const prefix = input?.value || '';
      showStatus('正在设置前缀...');
      try {
        await api(`/ps-name/${state.SID}/prefix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix })
        });
        showStatus('nameID 25 前缀已设置', 'ok');
        toast('nameID 25 前缀已设置');
        await renderPSPanel();
        await loadNames();
      } catch (e) {
        toast(e.message, 'err');
        showStatus('设置前缀失败: ' + e.message, 'err');
      }
    });

  } catch (e) {
    panel.innerHTML = `<div style="color:var(--err)">加载失败: ${escHtml(e.message)}</div>`;
    showStatus('PS 名称加载失败', 'err');
  }
}
