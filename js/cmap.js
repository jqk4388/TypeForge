/**
 * TypeForge Pro — Cmap Panel
 * Scheme A | Round 1
 */
import { $, state, api, toast } from './state.js';

export function initCmap() {
  $('#cmapSearch')?.addEventListener('input', e => renderCmapTable(e.target.value));
  $('#cmapAddBtn')?.addEventListener('click', onAddCmap);
}

export async function loadCmap() {
  const res = await api(`/cmap/${state.SID}`);
  const data = await res.json();
  state.cmapData = data.mappings || [];
  renderCmapTable($('#cmapSearch')?.value || '');
}

function renderCmapTable(filter = '') {
  const lf = filter.toLowerCase();
  const tbody = $('#cmapTable tbody');
  tbody.innerHTML = '';
  let shown = 0;
  for (const m of state.cmapData) {
    if (lf && !`${m.unicode.toString(16)} ${m.name} ${m.char || ''}`.toLowerCase().includes(lf)) continue;
    if (shown > 500) break;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="font-family:monospace">U+${m.unicode.toString(16).toUpperCase().padStart(4, '0')}</td>
      <td style="font-size:18px">${m.char || ''}</td>
      <td><input class="fld" value="${m.name}" data-uni="${m.unicode}" style="width:150px"></td>
      <td><button class="btn-ghost btn-sm" data-del-uni="${m.unicode}">✕</button></td>`;
    tbody.appendChild(tr);
    shown++;
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
