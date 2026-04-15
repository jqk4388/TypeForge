/**
 * TypeForge Pro — Metrics Panel (with ❓ tooltips)
 * Scheme A | Round 1
 * Change: each metric field has ❓ icon with Chinese description tooltip
 */
import { $, $$, state, api, toast, loadPlatformInfo, getMetricDescription } from './state.js';

export async function initMetrics() {
  await loadPlatformInfo();

  $$('.metric-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.metric-tab').forEach(b => b.classList.remove('act'));
      btn.classList.add('act');
      state.currentMetricTab = btn.dataset.mtab;
      loadMetrics();
    });
  });

  $('#scaleBtn')?.addEventListener('click', onScale);
}

export async function loadMetrics() {
  const res = await api(`/metrics/${state.SID}`);
  const data = await res.json();
  renderMetrics(data);
}

function renderMetrics(data) {
  const tag = state.currentMetricTab;
  const tagMap = { hhea: 'hhea', vhea: 'vhea', OS2: 'OS/2', head: 'head', post: 'post' };
  const tbl = data[tagMap[tag]] || data[tag] || {};
  if (!Object.keys(tbl).length) {
    $('#metricsContent').innerHTML = `<p style="color:var(--tx-2)">表 ${tag} 不存在</p>`;
    return;
  }

  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">';
  const skip = new Set(['__dict__', 'decompiled', 'compile', 'toXML', 'fromXML', 'ensureDecompiled', 'mergeMap']);
  for (const [key, val] of Object.entries(tbl)) {
    if (skip.has(key) || typeof val === 'object') continue;
    const editable = tag !== 'head' || key !== 'unitsPerEm';
    const desc = getMetricDescription(key);
    const tooltipHtml = desc
      ? `<span class="metric-help" title="${desc}">❓</span>`
      : '';

    html += `<div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:11px;color:var(--tx-2);min-width:140px;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px" title="${key}">${key} ${tooltipHtml}</span>
      ${editable
        ? `<input class="fld" data-key="${key}" value="${val}" style="width:100px" type="number">`
        : `<span style="font-size:13px;color:var(--tx-0);font-weight:600">${val}</span><span style="font-size:10px;color:var(--tx-3)">(只读)</span>`}
    </div>`;
  }
  html += '</div>';
  $('#metricsContent').innerHTML = html;

  // Bind save
  $('#metricsContent').querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', async () => {
      inp.classList.add('mod');
      try {
        await api(`/metrics/${state.SID}/${tagMap[tag]}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [inp.dataset.key]: +inp.value })
        });
        toast('已更新');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

async function onScale() {
  if (!state.SID) return;
  try {
    await api(`/metrics/${state.SID}/scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scale: +$('#scaleInput').value })
    });
    await loadMetrics();
    toast('度量值已缩放');
  } catch (e) { toast(e.message, 'err'); }
}
