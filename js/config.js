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
  // 并行加载所有面板（大字体时可提速 3-5x）
  await Promise.allSettled([
    loadNames(),
    loadMetrics(),
    loadCmap(),
    loadGlyphs(),
    loadOtl(),
    loadPreviewFont(),
    loadTableList(),
  ]);
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

// Preset definitions with descriptions
const PRESETS = {
  'cjk-vert': {
    label: 'CJK 竖排优化',
    desc: '为竖排排版设置推荐的度量值，适配 vhea / OS/2 表',
    details: [
      { table: 'vhea', field: 'vertTypoAscender', value: 880, note: '竖排上升线' },
      { table: 'vhea', field: 'vertTypoDescender', value: -120, note: '竖排下降线' },
      { table: 'vhea', field: 'vertTypoLineGap', value: 0, note: '竖排行距' },
      { table: 'OS/2', field: 'sTypoAscender', value: 880, note: '排版上升线' },
      { table: 'OS/2', field: 'sTypoDescender', value: -120, note: '排版下降线' },
      { table: 'OS/2', field: 'winAscent', value: 960, note: 'Windows 上升线' },
      { table: 'OS/2', field: 'winDescent', value: 240, note: 'Windows 下降线' },
    ],
    config: {
      metrics: {
        vhea: { vertTypoAscender: 880, vertTypoDescender: -120, vertTypoLineGap: 0 },
        'OS/2': { sTypoAscender: 880, sTypoDescender: -120, winAscent: 960, winDescent: 240 }
      }
    }
  },
  'mono-fix': {
    label: '等宽修正',
    desc: '将 post 表 isFixedPitch 标记为 1，声明为等宽字体',
    details: [
      { table: 'post', field: 'isFixedPitch', value: 1, note: '等宽标志位（0=否 1=是）' },
    ],
    config: { metrics: { post: { isFixedPitch: 1 } } }
  },
  'web-optimize': {
    label: 'Web 优化',
    desc: '设置 OS/2 fsSelection 第6位，标记 USE_TYPO_METRICS 让浏览器使用 sTypo 值',
    details: [
      { table: 'OS/2', field: 'fsSelection', value: 64, note: 'USE_TYPO_METRICS bit (bit 7 = 0x40 = 64)' },
    ],
    config: { metrics: { 'OS/2': { fsSelection: 64 } } }
  },
};

async function onPreset(preset) {
  const p = PRESETS[preset];
  if (!p) return;

  // Build detail panel
  let detailHtml = `
    <div style="background:var(--bg-2);border:1px solid var(--bd);border-radius:8px;padding:12px;margin-top:8px">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">📋 ${p.label}</div>
      <div style="font-size:12px;color:var(--tx-2);margin-bottom:10px">${p.desc}</div>
      <table style="font-size:12px;width:100%">
        <thead><tr>
          <th style="text-align:left;padding:3px 6px;color:var(--tx-3)">表</th>
          <th style="text-align:left;padding:3px 6px;color:var(--tx-3)">字段</th>
          <th style="text-align:right;padding:3px 6px;color:var(--tx-3)">值</th>
          <th style="text-align:left;padding:3px 6px;color:var(--tx-3)">说明</th>
        </tr></thead>
        <tbody>
          ${p.details.map(d => `<tr>
            <td style="padding:3px 6px"><span class="tag tag-ac" style="font-size:10px">${d.table}</span></td>
            <td style="padding:3px 6px;font-family:monospace">${d.field}</td>
            <td style="padding:3px 6px;text-align:right;font-weight:600;color:var(--ok)">${d.value}</td>
            <td style="padding:3px 6px;color:var(--tx-2)">${d.note}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button class="btn-ghost btn-sm" id="presetCancelBtn">取消</button>
        <button class="btn btn-sm btn-ok" id="presetApplyBtn">✓ 应用此模板</button>
      </div>
    </div>`;

  // Show inside cfgContent
  const cfgContent = $('#cfgContent');
  if (cfgContent) {
    cfgContent.innerHTML = detailHtml;
    cfgContent.querySelector('#presetCancelBtn').addEventListener('click', () => {
      cfgContent.innerHTML = '';
    });
    cfgContent.querySelector('#presetApplyBtn').addEventListener('click', async () => {
      try {
        await api(`/config/${state.SID}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p.config)
        });
        await loadAllPanels();
        toast(`模板「${p.label}」已应用`);
        cfgContent.innerHTML = `<div class="card"><p style="color:var(--ok)">✓ 模板「${p.label}」已应用</p></div>`;
      } catch (e) { toast(e.message, 'err'); }
    });
  }
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
