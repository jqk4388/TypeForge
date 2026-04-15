/**
 * TypeForge Pro — Cmap Panel
 * Fix: added glyph SVG preview column
 */
import { $, state, api, toast } from './state.js';

let _cmapAbort = null;  // 请求取消锁

export function initCmap() {
  $('#cmapSearch')?.addEventListener('input', e => renderCmapTable(e.target.value));
  $('#cmapAddBtn')?.addEventListener('click', onAddCmap);
}

export async function loadCmap() {
  // 取消之前未完成的 SVG 加载
  if (_cmapAbort) _cmapAbort.abort();
  _cmapAbort = new AbortController();
  const signal = _cmapAbort.signal;

  const res = await api(`/cmap/${state.SID}`);
  const data = await res.json();
  state.cmapData = data.mappings || [];

  // 空数据时显示提示，隐藏表格
  const tableWrap = document.querySelector('#panel-cmap .card, #panel-cmap table#schemetable');
  const hint = document.getElementById('cmapEmptyHint');
  if (!state.cmapData.length) {
    if (!hint) {
      const p = document.createElement('div');
      p.id = 'cmapEmptyHint';
      p.style.cssText = 'color:var(--tx-2);text-align:center;padding:60px 0';
      p.innerHTML = '<p style="font-size:48px;margin-bottom:12px">🔤</p><p>该字体没有字符映射 (cmap) 数据</p>';
      const parent = document.querySelector('#panel-cmap');
      const tableEl = document.querySelector('#panel-cmap > div:last-child');
      if (parent && tableEl) tableEl.style.display = 'none';
      parent.appendChild(p);
    }
    return;
  }
  if (hint) hint.remove();
  const tableEl = document.querySelector('#panel-cmap > div:last-child');
  if (tableEl) tableEl.style.display = '';

  renderCmapTable($('#cmapSearch')?.value || '', signal);
}

async function renderCmapTable(filter = '', signal = null) {
  const lf = filter.toLowerCase();
  const tbody = $('#cmapTable tbody');
  tbody.innerHTML = '';
  let shown = 0;
  const visibleRows = [];

  for (const m of state.cmapData) {
    // 过滤掉字符为空的映射
    if (!m.char) continue;
    if (lf && !`${m.unicode.toString(16)} ${m.name} ${m.char}`.toLowerCase().includes(lf)) continue;
    if (shown > 500) break;
    const tr = document.createElement('tr');
    tr.dataset.name = m.name;
    tr.innerHTML = `
      <td class="cmap-preview-cell" data-gname="${m.name}">
        <span class="cmap-glyph-mini">
          <svg class="cmap-svg-placeholder" width="32" height="32" viewBox="0 0 32 32">
            <rect width="32" height="32" fill="none" stroke="var(--bd)" stroke-width="1" rx="2"/>
            <text x="16" y="22" font-size="16" text-anchor="middle" fill="var(--tx-2)">${m.char || ''}</text>
          </svg>
        </span>
      </td>
      <td style="font-family:monospace">U+${m.unicode.toString(16).toUpperCase().padStart(4, '0')}</td>
      <td style="font-size:18px">${m.char || ''}</td>
      <td><input class="fld" value="${m.name}" data-uni="${m.unicode}" style="width:150px"></td>
      <td><button class="btn-ghost btn-sm" data-del-uni="${m.unicode}">✕</button></td>`;
    tbody.appendChild(tr);
    shown++;
    visibleRows.push({ name: m.name, tr });
  }

  // Bind edit
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', async () => {
      inp.classList.add('mod');
      try {
        await api(`/cmap/${state.SID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unicode: +inp.dataset.uni, glyph: inp.value })
        });
        toast('映射已更新');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
  tbody.querySelectorAll('[data-del-uni]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/cmap/${state.SID}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unicode: +btn.dataset.delUni })
        });
        toast('已删除');
        await loadCmap();
      } catch (e) { toast(e.message, 'err'); }
    });
  });

  // Lazy load SVG previews in batches
  const names = visibleRows.map(r => r.name).filter(Boolean);
  if (!names.length || !state.SID) return;
  // Load in batches of 50
  for (let i = 0; i < names.length; i += 50) {
    if (signal && signal.aborted) return;  // 已取消则停止
    const batch = names.slice(i, i + 50);
    try {
      const res = await api(`/glyphs-batch-svg/${state.SID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: batch })
      });
      const data = await res.json();
      const svgs = data.glyphs || {};
      for (const { name, tr } of visibleRows.slice(i, i + 50)) {
        const cell = tr.querySelector('.cmap-preview-cell');
        if (!cell) continue;
        const svgData = svgs[name];
        if (svgData && svgData.path) {
          cell.innerHTML = renderCmapGlyphSvg(svgData);
        }
      }
    } catch (e) {
      // ignore SVG load error, fallback to char text already shown
    }
  }
}

/**
 * Render glyph in its em-box (correct positional context).
 */
function renderCmapGlyphSvg(svgData) {
  const aw = svgData.advanceWidth || 1000;
  const emH = 1000;
  const asc = 800;   // typical ascender in font units
  const pad = 30;
  const vbX = -pad;
  const vbY = -asc - pad;
  const vbW = aw + pad * 2;
  const vbH = emH + pad * 2;
  return `<svg width="32" height="32" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
    <rect x="0" y="${-asc}" width="${aw}" height="${emH}" fill="none" stroke="var(--bd)" stroke-width="12" opacity="0.35"/>
    <line x1="0" y1="0" x2="${aw}" y2="0" stroke="var(--ok)" stroke-width="8" opacity="0.5"/>
    <path d="${svgData.path}" fill="var(--ac)" transform="scale(1,-1)"/>
  </svg>`;
}

async function onAddCmap() {
  const uni = prompt('Unicode 码位 (十进制或 0xXXXX):');
  if (!uni) return;
  const name = prompt('字形名:');
  if (!name) return;
  try {
    await api(`/cmap/${state.SID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unicode: parseInt(uni), glyph: name })
    });
    await loadCmap();
    toast('已添加');
  } catch (e) { toast(e.message, 'err'); }
}
