/**
 * TypeForge Pro — Overview Panel
 * Scheme A | Round 1
 */
import { $, state } from './state.js';

export function showOverview(data) {
  const stats = data.stats || {};
  const tables = data.tables || [];
  let html = `<div class="card" style="margin-bottom:12px">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
      <div><div class="lbl">文件名</div><div style="font-size:14px">${data.filename}</div></div>
      <div><div class="lbl">字形数</div><div style="font-size:20px;font-weight:700">${stats.numGlyphs || 0}</div></div>
      <div><div class="lbl">cmap 映射</div><div style="font-size:20px;font-weight:700">${stats.numCmapEntries || 0}</div></div>
      <div><div class="lbl">GPOS</div>${stats.hasGPOS ? '<span class="tag tag-ok">✓ 有</span>' : '<span class="tag tag-warn">✗ 无</span>'}</div>
      <div><div class="lbl">GSUB</div>${stats.hasGSUB ? '<span class="tag tag-ok">✓ 有</span>' : '<span class="tag tag-warn">✗ 无</span>'}</div>
      <div><div class="lbl">GDEF</div>${stats.hasGDEF ? '<span class="tag tag-ok">✓ 有</span>' : '<span class="tag tag-warn">✗ 无</span>'}</div>
      <div><div class="lbl">fvar</div>${stats.hasFvar ? '<span class="tag tag-ok">✓ 变量字体</span>' : '<span style="color:var(--tx-3)">—</span>'}</div>
    </div>
  </div>
  <div class="card">
    <div class="lbl" style="margin-bottom:8px">字体表 (${tables.length})</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">`;
  tables.forEach(t => {
    html += `<span class="tag tag-ac">${t.tag}</span>`;
  });
  html += `</div></div>`;

  // Name summary
  const name = data.name || {};
  const common = { 1: '字体族名', 2: '子族名', 4: '全名', 5: '版本', 6: 'PS名' };
  html += `<div class="card" style="margin-top:12px"><div class="lbl" style="margin-bottom:8px">名称摘要</div><table><thead><tr><th>ID</th><th>说明</th><th>值</th></tr></thead><tbody>`;
  for (const [id, label] of Object.entries(common)) {
    const rec = Object.values(name).find(r => r.nameID == id && r.platformID == 3);
    if (rec) html += `<tr><td>${id}</td><td>${label}</td><td>${rec.value}</td></tr>`;
  }
  html += `</tbody></table></div>`;
  $('#overviewContent').innerHTML = html;
}
