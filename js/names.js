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
  20: 'PostScript CID查找名（PostScript CID Findfont Name）',
  21: 'WWS 族名 (WWS Family)',
  22: 'WWS 子族名 (WWS Subfamily)',
  23: '浅色背景调色板名称（Light Background Palette Name）',
  24: '深色背景调色板名称（Dark Background Palette Name）',
  25: '可变字体PostScript前缀（Variations PostScript Name Prefix）',
  255: '预留（Reserved）',
  256: '内部版本号',
  257: '字符覆盖统计',
  258: '客户定制',
  259: '内部测试信息',
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
  $('#namePSBtn')?.addEventListener('click', togglePSPanel);
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

// ─── PostScript Name Generator (Adobe TN #5902) ──────────────────

async function togglePSPanel() {
  const panel = $('#namePSPanel');
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  panel.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tx-2)">加载中...</div>';
  await renderPSPanel();
}

async function renderPSPanel() {
  const panel = $('#namePSPanel');
  try {
    const res = await api(`/ps-name/${state.SID}`);
    const data = await res.json();
    if (data.error) {
      panel.innerHTML = `<div style="color:var(--err)">错误: ${data.error}</div>`;
      return;
    }

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
        html += `<div style="font-size:12px;color:var(--wrn);margin-bottom:4px">⚠ ${w}</div>`;
      }
      html += '</div>';
    }

    // Current PS name
    if (data.currentPSName) {
      html += `<div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--tx-2);margin-bottom:4px">当前 PostScript 名称 (nameID 6)</div>
        <div style="display:flex;align-items:center;gap:8px">
          <code style="font-size:13px;background:var(--bg-2);padding:4px 10px;border-radius:4px;flex:1;word-break:break-all">${data.currentPSName}</code>
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
        <code style="font-size:13px;background:var(--bg-2);padding:4px 10px;border-radius:4px;flex:1;word-break:break-all">${data.familyPrefix || '(空)'}</code>
        <input class="fld ps-prefix-input" value="${data.familyPrefix || ''}" placeholder="自定义前缀..." style="width:180px">
        <button class="btn btn-sm ps-prefix-btn" style="white-space:nowrap">设置前缀</button>
      </div>
    </div>`;

    // Variable font sections
    if (data.isVariable && data.namedInstances) {
      // Named instances table
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
          <td style="padding:4px 6px" title="${coordsStr}">${inst.name}</td>
          <td style="padding:4px 6px"><code style="font-size:11px">${inst.psName}</code></td>
          <td style="padding:4px 6px;color:var(--tx-3)">${algoLabels[inst.algorithm] || inst.algorithm}</td>
          <td style="padding:4px 6px;text-align:center;color:${validColor}">${inst.length}</td>
          <td style="padding:4px 6px">
            <button class="btn-ghost btn-sm ps-apply-btn" data-name="${inst.psName.replace(/"/g, '&quot;')}" title="应用到 nameID 6">✓</button>
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
            <td style="padding:4px 6px"><code style="font-size:11px">${ex.psName}</code></td>
            <td style="padding:4px 6px;text-align:center;color:${validColor}">${ex.length}</td>
            <td style="padding:4px 6px">
              <button class="btn-ghost btn-sm ps-apply-btn" data-name="${ex.psName.replace(/"/g, '&quot;')}" title="应用到 nameID 6">✓</button>
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
          <code style="font-size:13px;background:var(--bg-2);padding:4px 10px;border-radius:4px">${data.generated}</code>
          <button class="btn btn-sm ps-apply-btn" data-name="${data.generated.replace(/"/g, '&quot;')}">应用到 nameID 6</button>
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
        try {
          await api(`/ps-name/${state.SID}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ psName: name })
          });
          btn.style.color = 'var(--ok)';
          toast(`PS 名称已设为: ${name}`);
          await loadNames();
        } catch (e) { toast(e.message, 'err'); }
      });
    });

    // Bind prefix set button
    panel.querySelector('.ps-prefix-btn')?.addEventListener('click', async () => {
      const input = panel.querySelector('.ps-prefix-input');
      const prefix = input?.value || '';
      try {
        await api(`/ps-name/${state.SID}/prefix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix })
        });
        toast('nameID 25 前缀已设置');
        await renderPSPanel();
        await loadNames();
      } catch (e) { toast(e.message, 'err'); }
    });

  } catch (e) {
    panel.innerHTML = `<div style="color:var(--err)">加载失败: ${e.message}</div>`;
  }
}
