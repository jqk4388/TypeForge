/**
 * TypeForge Pro — Config Panel
 * Scheme A | Round 1
 */
import { $, $$, state, api, toast } from './state.js';
import { loadNames } from './names.js';
import { loadMetrics } from './metrics.js';
import { loadCmap } from './cmap.js';
import { loadGlyphs } from './glyphs.js';
import { loadOtl } from './otl.js';
import { loadPreviewFont } from './preview.js';

async function loadAllPanels() {
  if (!state.SID) return;
  try { await loadNames(); } catch (e) { }
  try { await loadMetrics(); } catch (e) { }
  try { await loadCmap(); } catch (e) { }
  try { await loadGlyphs(); } catch (e) { }
  try { await loadOtl(); } catch (e) { }
  try { await loadPreviewFont(); } catch (e) { }
  try { await loadTableList(); } catch (e) { }
}

export function initConfig() {
  $('#cfgSaveBtn')?.addEventListener('click', onSaveConfig);
  $('#cfgLoadInput')?.addEventListener('change', onLoadConfig);
  $('#cfgDiffBtn')?.addEventListener('click', onDiffConfig);
  $('#cfgBatchBtn')?.addEventListener('click', () => {
    $('#batchModal').style.display = 'flex';
  });
  $('#batchCloseBtn')?.addEventListener('click', () => {
    $('#batchModal').style.display = 'none';
  });
  $('#batchRunBtn')?.addEventListener('click', onBatchApply);
  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => onPreset(btn.dataset.preset));
  });
}

async function onSaveConfig() {
  if (!state.SID) return;
  try {
    const res = await api(`/config/${state.SID}`);
    const config = await res.json();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.fontInfo.filename.replace(/\.\w+$/, '') + '.config.json';
    a.click();
    toast('配置已保存');
  } catch (e) { toast(e.message, 'err'); }
}

async function onLoadConfig(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  state.loadedConfig = JSON.parse(text);
  $('#cfgContent').innerHTML = `<div class="card"><p style="color:var(--ok)">配置已加载: ${Object.keys(state.loadedConfig.name || {}).length} 名称记录, ${Object.keys(state.loadedConfig.metrics || {}).length} 度量表</p>
    <button class="btn btn-sm" id="cfgApplyBtn" style="margin-top:8px">应用到当前字体</button></div>`;
  $('#cfgApplyBtn')?.addEventListener('click', async () => {
    try {
      await api(`/config/${state.SID}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.loadedConfig)
      });
      await loadAllPanels();
      toast('配置已应用');
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function onDiffConfig() {
  if (!state.SID || !state.loadedConfig) { toast('请先加载配置文件', 'err'); return; }
  try {
    const res = await api(`/config/${state.SID}/diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.loadedConfig)
    });
    const data = await res.json();
    if (!data.diffs.length) {
      $('#cfgContent').innerHTML = '<div class="card"><p style="color:var(--ok)">无差异 ✓</p></div>';
    } else {
      let html = '<div class="card"><table><thead><tr><th>表</th><th>字段</th><th>当前值</th><th>配置值</th></tr></thead><tbody>';
      for (const d of data.diffs) {
        html += `<tr><td>${d.table}</td><td>${d.field || d.nameID}</td><td>${d.current}</td><td style="color:var(--ac)">${d.config}</td></tr>`;
      }
      html += '</tbody></table></div>';
      $('#cfgContent').innerHTML = html;
    }
  } catch (e) { toast(e.message, 'err'); }
}

async function onPreset(preset) {
  let config = {};
  if (preset === 'cjk-vert') {
    config = {
      metrics: {
        vhea: { vertTypoAscender: 880, vertTypoDescender: -120, vertTypoLineGap: 0 },
        'OS/2': { sTypoAscender: 880, sTypoDescender: -120, winAscent: 960, winDescent: 240 }
      }
    };
  } else if (preset === 'mono-fix') {
    config = { metrics: { post: { isFixedPitch: 1 } } };
  } else if (preset === 'web-optimize') {
    config = { metrics: { 'OS/2': { fsSelection: 64 } } };
  }
  try {
    await api(`/config/${state.SID}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    await loadAllPanels();
    toast('模板已应用');
  } catch (e) { toast(e.message, 'err'); }
}

async function onBatchApply() {
  if (!state.loadedConfig) { toast('请先保存或加载配置', 'err'); return; }
  const files = $('#batchFiles')?.files;
  if (!files?.length) { toast('请选择字体文件', 'err'); return; }
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  fd.append('config', JSON.stringify(state.loadedConfig));
  try {
    const res = await fetch(`/api/batch-apply`, { method: 'POST', body: fd });
    const data = await res.json();
    let html = '';
    for (const r of data.results) {
      html += `<div style="padding:4px 0;color:${r.status === 'ok' ? 'var(--ok)' : 'var(--err)'}">${r.filename}: ${r.status === 'ok' ? '✓ 成功' : '✗ ' + r.error}</div>`;
    }
    $('#batchResults').innerHTML = html;
    toast('批量应用完成');
  } catch (e) { toast(e.message, 'err'); }
}

async function loadTableList() {
  if (!state.SID) return;
  try {
    const res = await api(`/tables/${state.SID}`);
    const data = await res.json();
    const sel = $('#ttxTable');
    if (sel) {
      sel.innerHTML = '<option value="">全部表</option>';
      for (const t of data.tables) {
        sel.innerHTML += `<option value="${t.tag}">${t.tag}</option>`;
      }
    }
    let listHtml = '';
    for (const t of data.tables) {
      listHtml += `<span class="tag tag-ac" style="margin:2px">${t.tag}</span>`;
    }
    const tableList = $('#tableList');
    if (tableList) tableList.innerHTML = listHtml;
  } catch (e) { }
}

export { loadAllPanels };
