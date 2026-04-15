/**
 * TypeForge Pro — Names Panel (Human-readable platform/language)
 * Scheme A | Round 1
 * Change: language encoding shown as human-readable names
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
  6: 'PostScript名',
  7: '商标 (Trademark)',
  8: '厂商 (Manufacturer)',
  9: '设计师 (Designer)',
  10: '描述 (Description)',
  11: '厂商URL (Vendor URL)',
  12: '设计者URL (Designer URL)',
  13: '许可证说明',
  14: '许可证URL',
  15: '排版预留',
  16: '字体族名 (Typographic)',
  17: '子族名 (Typographic)',
  18: '兼容全名 (Compatible Full)',
  19: '样本文本 (Sample Text)',
  20: 'PostScript CID',
  21: 'WWS 族名 (WWS Family)',
  22: 'WWS 子族名 (WWS Subfamily)',
  23: '轻量背景色',
  24: '重色背景色',
  25: '字体变体',
  26: '年份 (Year)',
  27: '轴名 (Axis Name)',
  28: '轴值名 (Axis Value Name)',
  29: '轴值范围 (Axis Value Range)',
  30: '轴值椭圆 (Axis Value Ellipse)',
  31: '轴值名称 (Axis Value Name)',
  32: 'Axis Value Label',
  33: 'Axis Value Symbol',
  34: 'ELID Field (ELID)',
  35: 'ELID Value (ELID)',
  36: '燃油名称',
  37: '赛道名称',
  38: '竞速者名称',
  39: '阶段名称',
  40: '性能指标',
  255: 'Master UID',
  256: '草图族名',
  257: 'PostScript CID (FD)',
  258: 'PostScript Font Name',
};

function getNameIDLabel(nameID) {
  return NAME_ID_MAP[nameID] || '';
}

export async function initNames() {
  await loadPlatformInfo();

  $('#nameSearch')?.addEventListener('input', e => renderNameTable(e.target.value));
  $('#nameAddBtn')?.addEventListener('click', onAddName);
  $('#nameQuickBtn')?.addEventListener('click', toggleQuickEdit);
  $('#nameBatchBtn')?.addEventListener('click', onBatchReplace);
}

export async function loadNames() {
  const res = await api(`/name/${state.SID}`);
  const data = await res.json();
  state.nameRecords = data.records || [];
  renderNameTable($('#nameSearch')?.value || '');
}

function renderNameTable(filter = '') {
  const lf = filter.toLowerCase();
  const tbody = $('#nameTable tbody');
  tbody.innerHTML = '';

  state.nameRecords.forEach((r, i) => {
    const nidLabel = getNameIDLabel(r.nameID);
    if (lf && !`${r.nameID} ${nidLabel} ${r.value}`.toLowerCase().includes(lf)) return;
    const tr = document.createElement('tr');

    // Human-readable platform & language
    const platName = getPlatformName(r.platformID);
    const langName = getLanguageName(r.platformID, r.langID);

    // nameID 带定义标签（nidLabel 已在 filter 中声明）
    const nidHtml = nidLabel
      ? `${r.nameID} <span style="font-size:11px;color:var(--tx-2)">${nidLabel}</span>`
      : `${r.nameID}`;

    tr.innerHTML = `<td>${nidHtml}</td>
      <td><span style="color:var(--ac)">${platName}</span> <span style="font-size:10px;color:var(--tx-3)">(${r.platformID})</span></td>
      <td>${r.encodingID}</td>
      <td><span style="color:var(--ok)">${langName}</span> <span style="font-size:10px;color:var(--tx-3)">(0x${r.langID.toString(16).toUpperCase().padStart(4,'0')})</span></td>
      <td><input class="fld" value="${r.value.replace(/"/g, '&quot;')}" data-idx="${i}" style="min-width:200px"></td>
      <td><button class="btn-ghost btn-sm" data-del="${i}">✕</button></td>`;
    tbody.appendChild(tr);
  });

  // Bind edit events
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const idx = +inp.dataset.idx;
      const r = state.nameRecords[idx];
      inp.classList.add('mod');
      try {
        await api(`/name/${state.SID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nameID: r.nameID, platformID: r.platformID, encodingID: r.encodingID, langID: r.langID, value: inp.value })
        });
        r.value = inp.value;
        toast('名称已更新');
      } catch (e) { toast(e.message, 'err'); }
    });
  });

  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = +btn.dataset.del;
      const r = state.nameRecords[idx];
      try {
        await api(`/name/${state.SID}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nameID: r.nameID, platformID: r.platformID, langID: r.langID })
        });
        state.nameRecords.splice(idx, 1);
        renderNameTable($('#nameSearch')?.value || '');
        toast('已删除');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

async function onAddName() {
  const nameID = prompt('nameID:', '256');
  if (!nameID) return;
  const value = prompt('值:', '');
  if (value === null) return;
  try {
    await api(`/name/${state.SID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameID: +nameID, value })
    });
    await loadNames();
    toast('已添加');
  } catch (e) { toast(e.message, 'err'); }
}

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
      <input class="fld quick-name" data-nid="${nid}" value="${val.replace(/"/g, '&quot;')}" style="flex:1">
    </div>`;
  }
  html += '</div><button class="btn btn-sm" id="quickNameSave" style="margin-top:8px">保存全部</button>';
  panel.innerHTML = html;

  $('#quickNameSave')?.addEventListener('click', async () => {
    const fields = panel.querySelectorAll('.quick-name');
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
      } catch (e) { }
    }
    await loadNames();
    toast('快捷名称已更新');
  });
}

async function onBatchReplace() {
  const find = prompt('查找:', '');
  if (!find) return;
  const replace = prompt('替换为:', '');
  try {
    const res = await api(`/name/${state.SID}/batch-replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ find, replace })
    });
    const data = await res.json();
    await loadNames();
    toast(`已替换 ${data.replaced} 处`);
  } catch (e) { toast(e.message, 'err'); }
}
