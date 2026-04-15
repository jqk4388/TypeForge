/**
 * TypeForge Pro — OTL Panel (Enhanced: glyph rendering in lookups, collapsible tree)
 */
import { $, $$, state, api, toast, getFeatureName, getScriptName, loadPlatformInfo } from './state.js';

export async function initOtl() {
  await loadPlatformInfo();

  $$('.otl-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.otl-tab').forEach(b => b.classList.remove('act'));
      btn.classList.add('act');
      state.currentOtlTab = btn.dataset.otab;
      loadOtl();
    });
  });
}

export async function loadOtl() {
  if (state.currentOtlTab === 'GDEF') {
    try {
      const res = await api(`/gdef/${state.SID}`);
      const data = await res.json();
      renderGdef(data);
    } catch (e) { $('#otlContent').innerHTML = `<p style="color:var(--tx-2)">GDEF 表不存在</p>`; }
    return;
  }
  if (state.currentOtlTab === 'fvar') {
    try {
      const res = await api(`/fvar/${state.SID}`);
      const data = await res.json();
      renderFvar(data);
    } catch (e) { $('#otlContent').innerHTML = `<p style="color:var(--tx-2)">fvar 表不存在 (非变量字体)</p>`; }
    return;
  }
  try {
    const res = await api(`/otl/${state.SID}/${state.currentOtlTab}`);
    const data = await res.json();
    renderOtlTree(data);
  } catch (e) {
    $('#otlContent').innerHTML = `<p style="color:var(--tx-2)">${state.currentOtlTab} 表不存在</p>`;
  }
}

/** Collapsible tree node helper */
function treeNode(label, content, collapsed = true) {
  const id = 'tn-' + Math.random().toString(36).slice(2, 8);
  return `<div class="otl-tree-node">
    <div class="otl-tree-header" data-target="${id}">
      <span class="otl-tree-arrow ${collapsed ? '' : 'open'}">▶</span>
      <span>${label}</span>
    </div>
    <div class="otl-tree-content" id="${id}" style="display:${collapsed ? 'none' : 'block'}">
      ${content}
    </div>
  </div>`;
}

/** Generate mini SVG for a glyph name */
function glyphMiniSvg(glyphName, svgData) {
  if (!svgData || !svgData.path) return `<span class="tag">${glyphName}</span>`;
  const bounds = svgData.bounds || [0, -200, 500, 800];
  const w = (bounds[2] - bounds[0]) || 1000;
  const h = (bounds[3] - bounds[1]) || 1000;
  const pad = 8;
  return `<span class="glyph-mini" title="${glyphName}">
    <svg viewBox="${bounds[0] - pad} ${-bounds[3] - pad} ${w + pad * 2} ${h + pad * 2}" width="24" height="24">
      <path d="${svgData.path}" fill="var(--ac)" fill-opacity="0.3" stroke="var(--ac)" stroke-width="4" transform="scale(1,-1)"/>
    </svg>
  </span>`;
}

/** Render OTL as collapsible tree */
function renderOtlTree(data) {
  let html = '';

  // ─── Scripts tree ───
  html += `<div class="card" style="margin-bottom:12px">
    <h3 style="font-size:14px;font-weight:600;margin-bottom:8px">📂 脚本与语言系统</h3>`;
  if (data.scripts && data.scripts.length) {
    for (const s of data.scripts) {
      const scriptName = getScriptName(s.tag);
      let langContent = '';
      if (s.defaultLangSys) {
        langContent += `<div style="margin:4px 0;padding:4px 8px;background:var(--bg-2);border-radius:4px;font-size:12px">
          <strong>默认语言系统</strong><br>
          必需特性: ${s.defaultLangSys.reqFeatureIndex}<br>
          特性索引: [${s.defaultLangSys.featureIndices.join(', ')}]
        </div>`;
      }
      if (s.langSys && s.langSys.length) {
        for (const l of s.langSys) {
          langContent += `<div style="margin:4px 0;padding:4px 8px;background:var(--bg-2);border-radius:4px;font-size:12px">
            <span class="tag tag-warn">${l.tag}</span> — 必需: ${l.reqFeatureIndex}, 特性: [${l.featureIndices.join(', ')}]
          </div>`;
        }
      }
      html += treeNode(
        `<span class="tag tag-ac">${s.tag}</span> ${scriptName}`,
        langContent || '<span style="color:var(--tx-3);font-size:12px">无语言系统</span>'
      );
    }
  } else {
    html += '<p style="color:var(--tx-2);font-size:12px">无脚本记录</p>';
  }
  html += '</div>';

  // ─── Features tree ───
  html += `<div class="card" style="margin-bottom:12px">
    <h3 style="font-size:14px;font-weight:600;margin-bottom:8px">🏷️ 特性 <span class="badge">${(data.features || []).length}</span></h3>`;
  if (data.features && data.features.length) {
    for (const f of data.features) {
      const featureDesc = getFeatureName(f.tag);
      const lookupContent = f.lookups.map(l => {
        const lk = (data.lookups || []).find(x => x.index === l);
        const typeLabel = lk ? getOtlTypeLabelZh(state.currentOtlTab, lk.type) : '';
        return `<div style="margin:4px 0;padding:4px 8px;background:var(--bg-2);border-radius:4px;font-size:12px">
          <span class="tag tag-warn">Lookup ${l}</span> ${typeLabel}
          <button class="btn-ghost btn-sm otl-edit-lookup" data-idx="${l}" style="float:right">编辑</button>
        </div>`;
      }).join('');

      html += treeNode(
        `<span class="tag tag-ac">${f.tag}</span> ${featureDesc} <span style="font-size:10px;color:var(--tx-3)">(${f.lookups.length} Lookup)</span>`,
        lookupContent
      );
    }
  }
  html += '</div>';

  // ─── Lookups (with glyph rendering) ───
  html += `<div class="card" style="margin-bottom:12px">
    <h3 style="font-size:14px;font-weight:600;margin-bottom:8px">🔍 查找表 <span class="badge">${(data.lookups || []).length}</span></h3>`;
  if (data.lookups && data.lookups.length) {
    for (const lk of data.lookups) {
      const typeLabelZh = getOtlTypeLabelZh(state.currentOtlTab, lk.type);
      let subtableContent = '';
      for (const st of lk.subtables) {
        let detail = `<div style="font-size:11px;color:var(--tx-3);margin-bottom:4px">Subtable ${st.index} — ${st.type}</div>`;

        if (st.mapping) {
          detail += '<div class="otl-glyph-list">';
          for (const [k, v] of Object.entries(st.mapping)) {
            const isArr = Array.isArray(v);
            detail += `<div class="otl-glyph-row">
              <span class="otl-glyph-item" data-glyph="${k}">${k}</span>
              <span style="color:var(--tx-3);margin:0 4px">→</span>
              <span class="otl-glyph-item" data-glyph="${isArr ? v.join(', ') : v}">${isArr ? v.join(' ') : v}</span>
            </div>`;
          }
          detail += '</div>';
        }

        if (st.ligatures) {
          detail += '<div class="otl-glyph-list">';
          for (const [first, ligs] of Object.entries(st.ligatures)) {
            for (const lig of ligs) {
              const inputGlyphs = [first, ...lig.components].join(' + ');
              detail += `<div class="otl-glyph-row">
                <span class="otl-glyph-item" data-glyph="${first}">${first}</span>
                <span style="color:var(--tx-3);margin:0 2px">+</span>
                ${lig.components.map(c => `<span class="otl-glyph-item" data-glyph="${c}">${c}</span><span style="color:var(--tx-3);margin:0 2px">+</span>`).join('')}
                <span style="color:var(--tx-3);margin:0 4px">→</span>
                <span class="otl-glyph-item" data-glyph="${lig.glyph}">${lig.glyph}</span>
              </div>`;
            }
          }
          detail += '</div>';
        }

        if (st.alternates) {
          detail += '<div class="otl-glyph-list">';
          for (const [k, alts] of Object.entries(st.alternates)) {
            detail += `<div class="otl-glyph-row">
              <span class="otl-glyph-item" data-glyph="${k}">${k}</span>
              <span style="color:var(--tx-3);margin:0 4px">↔</span>
              ${alts.map(a => `<span class="otl-glyph-item" data-glyph="${a}">${a}</span>`).join(' ')}
            </div>`;
          }
          detail += '</div>';
        }

        if (st.raw) {
          detail += `<div style="font-size:11px;color:var(--tx-3);padding:4px">${st.raw}</div>`;
        }

        subtableContent += detail;
      }

      html += treeNode(
        `<span style="font-weight:600">Lookup ${lk.index}</span> <span class="tag tag-ac">Type ${lk.type}</span> <span style="font-size:11px;color:var(--tx-2)">${typeLabelZh}</span>`,
        subtableContent,
        false  // Lookups expanded by default
      );
    }
  }
  html += '</div>';

  // Add buttons
  html += `<div style="margin-top:12px;display:flex;gap:8px">
    <button class="btn btn-sm" id="addFeatureBtn">+ 添加特性</button>
    <button class="btn btn-sm" id="addLookupBtn">+ 添加 Lookup</button>
  </div>`;

  $('#otlContent').innerHTML = html;

  // Bind tree toggle
  $$('.otl-tree-header').forEach(header => {
    header.addEventListener('click', () => {
      const target = document.getElementById(header.dataset.target);
      const arrow = header.querySelector('.otl-tree-arrow');
      if (target) {
        const isOpen = target.style.display !== 'none';
        target.style.display = isOpen ? 'none' : 'block';
        arrow?.classList.toggle('open', !isOpen);
      }
    });
  });

  // Load SVG thumbnails for all referenced glyphs
  loadOtlGlyphSvgs();

  // Add feature button
  $('#addFeatureBtn')?.addEventListener('click', async () => {
    const tag = prompt('特性标签 (如 liga, kern, calt, vrt2):');
    if (!tag) return;
    const lkIdx = prompt('关联的 Lookup 索引:');
    if (lkIdx === null) return;
    try {
      await api(`/otl/${state.SID}/${state.currentOtlTab}/feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureTag: tag, lookupIndices: [+lkIdx] })
      });
      await loadOtl();
      toast('特性已添加');
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#addLookupBtn')?.addEventListener('click', async () => {
    const lt = prompt('Lookup 类型 (1=Single, 2=Multiple, 3=Alternate, 4=Ligature):');
    if (!lt) return;
    try {
      await api(`/otl/${state.SID}/${state.currentOtlTab}/add-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookupType: +lt })
      });
      await loadOtl();
      toast('Lookup 已添加');
    } catch (e) { toast(e.message, 'err'); }
  });

  // Edit lookup buttons
  $$('.otl-edit-lookup').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = +btn.dataset.idx;
      try {
        const res = await api(`/otl-lookup-detail/${state.SID}/${state.currentOtlTab}/${idx}`);
        const data = await res.json();
        showLookupEditModal(data);
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

/** Load SVG thumbnails for all glyph items in OTL panel */
async function loadOtlGlyphSvgs() {
  const items = document.querySelectorAll('.otl-glyph-item[data-glyph]');
  if (!items.length) return;

  // Collect unique glyph names
  const names = new Set();
  items.forEach(el => {
    const gname = el.dataset.glyph;
    if (gname) {
      // Split by comma for multi-glyph entries
      gname.split(/,\s*/).forEach(n => names.add(n.trim()));
    }
  });

  if (!names.size) return;

  // Batch load
  try {
    const res = await api(`/glyphs-batch-svg/${state.SID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [...names].slice(0, 100) })
    });
    const data = await res.json();
    const svgs = data.glyphs || {};

    // Replace text with mini SVGs
    items.forEach(el => {
      const gname = el.dataset.glyph;
      if (gname && svgs[gname]) {
        const miniSvg = glyphMiniSvg(gname, svgs[gname]);
        el.innerHTML = miniSvg + `<span style="font-size:11px;margin-left:2px">${gname}</span>`;
        el.classList.add('otl-glyph-rendered');
      }
    });
  } catch (e) {
    console.warn('OTL glyph SVG batch load failed:', e);
  }
}

function getOtlTypeLabelZh(table, type) {
  if (table === 'GSUB') {
    return { 1: '单一替换', 2: '多重替换', 3: '备选替换', 4: '连字替换', 5: '上下文替换', 6: '链式上下文替换', 7: '扩展替换', 8: '反向链式替换' }[type] || `类型${type}`;
  } else if (table === 'GPOS') {
    return { 1: '单点定位', 2: '成对定位', 3: '连写定位', 4: '标记-基线定位', 5: '标记-连字定位', 6: '标记-标记定位', 7: '上下文定位', 8: '链式上下文定位', 9: '扩展定位' }[type] || `类型${type}`;
  }
  return `类型${type}`;
}

function showLookupEditModal(lookup) {
  const typeLabelZh = getOtlTypeLabelZh(state.currentOtlTab, lookup.type);
  const glyphSvgs = lookup.glyphSvgs || {};
  let html = `<h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Lookup ${lookup.index} 编辑</h3>
    <div style="margin-bottom:8px"><span class="tag tag-ac">Type ${lookup.type}</span> ${typeLabelZh}</div>`;

  for (const st of lookup.subtables) {
    html += `<div class="card" style="margin-bottom:8px;padding:10px">
      <div class="lbl">Subtable ${st.index}</div>`;

    // Show mapping with glyph previews
    for (const [key, val] of Object.entries(st)) {
      if (key === 'index' || key === 'type') continue;
      if (typeof val === 'object') continue;

      // Check if this key is a glyph name — show preview
      const svgPreview = glyphSvgs[key]
        ? glyphMiniSvg(key, glyphSvgs[key])
        : '';

      html += `<div style="display:flex;gap:8px;align-items:center;margin-top:4px">
        <span style="font-size:12px;color:var(--tx-2);min-width:120px">${key} ${svgPreview}</span>
        <input class="fld otl-field" data-st="${st.index}" data-key="${key}" value="${val}" style="width:120px">
      </div>`;
    }
    html += '</div>';
  }

  html += `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
    <button class="btn-ghost btn-sm" id="lookupEditClose">关闭</button>
    <button class="btn btn-sm" id="lookupEditSave">保存</button>
  </div>`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#lookupEditClose').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#lookupEditSave').addEventListener('click', async () => {
    const changes = {};
    overlay.querySelectorAll('.otl-field').forEach(inp => {
      const stIdx = +inp.dataset.st;
      const key = inp.dataset.key;
      if (!changes[stIdx]) changes[stIdx] = {};
      changes[stIdx][key] = +inp.value || inp.value;
    });
    for (const [stIdx, data] of Object.entries(changes)) {
      try {
        await api(`/otl/${state.SID}/${state.currentOtlTab}/lookup/${lookup.index}/subtable/${stIdx}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (e) { toast(e.message, 'err'); }
    }
    toast('Lookup 已更新');
    overlay.remove();
    loadOtl();
  });
}

function renderGdef(data) {
  let html = '<h3 style="font-size:14px;font-weight:600;margin-bottom:8px">GDEF — 字形类别定义</h3>';
  const classes = { 1: '基础字形', 2: '连字字形', 3: '标记字形', 4: '组合字形' };
  html += '<table><thead><tr><th>字形名</th><th>类别</th></tr></thead><tbody>';
  for (const [name, cls] of Object.entries(data.glyphClasses || {})) {
    html += `<tr><td>${name}</td><td><span class="tag tag-ac">${classes[cls] || cls}</span></td></tr>`;
  }
  html += '</tbody></table>';
  $('#otlContent').innerHTML = html;
}

function renderFvar(data) {
  let html = '<h3 style="font-size:14px;font-weight:600;margin-bottom:8px">fvar — 变量字体轴</h3>';
  if (data.axes && data.axes.length) {
    html += '<table><thead><tr><th>轴标签</th><th>最小值</th><th>默认值</th><th>最大值</th></tr></thead><tbody>';
    for (const a of data.axes) {
      const desc = getFeatureName(a.tag);
      html += `<tr><td><span class="tag tag-ac">${a.tag}</span> ${desc !== a.tag ? desc : ''}</td><td>${a.min}</td><td>${a.default}</td><td>${a.max}</td></tr>`;
    }
    html += '</tbody></table>';
  }
  if (data.instances && data.instances.length) {
    html += '<h4 style="margin-top:12px">命名实例</h4><table><thead><tr><th>名称</th><th>坐标</th></tr></thead><tbody>';
    for (const inst of data.instances) {
      html += `<tr><td>${inst.name}</td><td>${JSON.stringify(inst.coordinates)}</td></tr>`;
    }
    html += '</tbody></table>';
  }
  $('#otlContent').innerHTML = html;
}
