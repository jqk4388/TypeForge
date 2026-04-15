/**
 * TypeForge Pro — Names Panel (Human-readable platform/language)
 * Scheme A | Round 1
 * Change: language encoding shown as human-readable names
 */
import { $, state, api, toast, getPlatformName, getLanguageName, loadPlatformInfo } from './state.js';

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
    if (lf && !`${r.nameID} ${r.value}`.toLowerCase().includes(lf)) return;
    const tr = document.createElement('tr');

    // Human-readable platform & language
    const platName = getPlatformName(r.platformID);
    const langName = getLanguageName(r.platformID, r.langID);

    tr.innerHTML = `<td>${r.nameID}</td>
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
  const common = { 1: '字体族名', 2: '子族名', 4: '全名', 5: '版本', 6: 'PostScript名', 7: '商标', 8: '厂商', 9: '设计师', 11: '许可证URL', 12: '许可证URL', 13: '许可证', 14: '许可证' };
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
