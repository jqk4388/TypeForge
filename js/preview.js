/**
 * TypeForge Pro — Preview Panel v3
 *
 * 核心优化：
 * 1. 【秒级 OT 特性】不再用 iframe srcdoc，直接在主文档注入 @font-face + 用 CSS 变量控制，
 *    OT 特性开关仅改一个 CSS 自定义属性 → 浏览器瞬间重绘，零网络请求
 * 2. 横排/竖排各一个 div（隐藏在 iframe 沙盒内的容器），内容变更走 CSS 变量
 * 3. 预设文本、字间距、字重/字宽滑块、OpenType 语言
 * 4. 变量字体轴控制（如果有 fvar）
 */
import { $, $$, state, api, toast, getFeatureName, loadPlatformInfo } from './state.js';

let previewFontUrl = null;
let otfFeatures = [];
let enabledFeatures = new Set();
let fvarAxes = [];
let _fontFaceLoaded = false;

// OpenType 特性分组
const FEATURE_GROUPS = {
  '常用': ['liga', 'dlig', 'calt', 'kern', 'clig', 'rlig', 'hlig', 'salt'],
  '数字/分数': ['lnum', 'onum', 'tnum', 'pnum', 'frac', 'afrc', 'ordn', 'zero'],
  '大小写': ['smcp', 'pcap', 'case', 'cpsp', 'unic'],
  '上下文/形式': ['init', 'medi', 'fina', 'isol', 'medi', 'rand', 'swsh', 'titl'],
  'CJK': ['vert', 'vrt2', 'trad', 'jp04', 'nlck', 'hojo'],
  '字宽': ['fwid', 'hwid', 'pwid', 'twid', 'half', 'halt', 'valt'],
  '标记': ['mark', 'mkmk', 'abvm', 'blwm', 'cpsp'],
  '竖排': ['vert', 'vrt2', 'vkrn', 'vpal', 'valt', 'vhal'],
  '连字': ['liga', 'clig', 'dlig', 'hlig', 'rlig'],
};

const PRESET_TEXTS = {
  '中英混排': '永字八法 龍鳳體 TypeForge 0123',
  '中文段落': '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。寒来暑往，秋收冬藏。',
  '英文': 'The quick brown fox jumps over the lazy dog. ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
  '数字标点': '0123456789 .,;:!?()[]{} @#$%&',
  '大小写': 'Hamburgefontsiv ABCDEF abcdef',
  '连字测试': 'fi fl ff fj ffi ffl st ct',
};

export async function initPreview() {
  await loadPlatformInfo();

  const textInput = $('#previewText');
  const sizeInput = $('#previewSize');
  const lineHInput = $('#previewLineH');
  const bgSelect = $('#previewBg');
  const letterSpacing = $('#previewLetterSpacing');
  const wordSpacing = $('#previewWordSpacing');
  const openTypeLang = $('#previewOTLang');

  // 文本、字号、行距等直接更新 CSS 变量，不走防抖
  textInput?.addEventListener('input', () => applyPreviewText(textInput.value));
  sizeInput?.addEventListener('input', () => {
    const val = $('#previewSizeVal');
    if (val) val.textContent = sizeInput.value + 'px';
    applyPreviewStyle();
  });
  lineHInput?.addEventListener('input', applyPreviewStyle);
  bgSelect?.addEventListener('change', () => applyPreviewBg(bgSelect.value));
  letterSpacing?.addEventListener('input', applyPreviewStyle);
  wordSpacing?.addEventListener('input', applyPreviewStyle);
  openTypeLang?.addEventListener('change', applyPreviewStyle);

  // 预设文本按钮
  $$('.preset-text-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (PRESET_TEXTS[key]) {
        textInput.value = PRESET_TEXTS[key];
        applyPreviewText(textInput.value);
      }
    });
  });
}

export async function loadPreviewFont() {
  if (!state.SID) return;
  previewFontUrl = `${location.origin}/api/preview/${state.SID}`;

  // 注入 @font-face 到主文档（只做一次）
  await injectFontFace(previewFontUrl);

  // 加载 OT 特性列表
  try {
    const res = await api(`/otl-features/${state.SID}`);
    const data = await res.json();
    otfFeatures = data.features || [];
    renderOtFeatureToggles();
  } catch (e) { }

  // 加载变量字体轴
  try {
    const res = await api(`/fvar/${state.SID}`);
    const data = await res.json();
    fvarAxes = data.axes || [];
    renderFvarControls();
  } catch (e) { fvarAxes = []; }

  // 首次渲染预览
  applyPreviewText($('#previewText')?.value || '永字八法 龍鳳體 TypeForge 0123');
  applyPreviewStyle();
}

/* ══════════════════════════════════════════════════════════════════
   @font-face 注入（一次性）
   ══════════════════════════════════════════════════════════════════ */
async function injectFontFace(url) {
  // 移除旧 font-face
  const old = document.getElementById('dynamic-font-face');
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = 'dynamic-font-face';
  style.textContent = `
    @font-face {
      font-family: 'PreviewFont';
      src: url('${url}') format('opentype'),
           url('${url}') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: block;
    }
  `;
  document.head.appendChild(style);

  // 等待字体加载就绪
  try {
    await document.fonts.load('48px "PreviewFont"');
  } catch (e) { /* fallback: 等一帧 */ }
  _fontFaceLoaded = true;
}

/* ══════════════════════════════════════════════════════════════════
   直接 DOM 操作：不走 iframe
   ══════════════════════════════════════════════════════════════════ */
function applyPreviewText(text) {
  const h = $('#previewContentH');
  const v = $('#previewContentV');
  if (h) h.textContent = text;
  if (v) v.textContent = text;
}

function applyPreviewStyle() {
  const size = $('#previewSize')?.value || '36';
  const lineH = $('#previewLineH')?.value || '1.4';
  const ls = $('#previewLetterSpacing')?.value || '0';
  const ws = $('#previewWordSpacing')?.value || '0';
  const otLang = $('#previewOTLang')?.value || '';

  // 构建 font-feature-settings
  let featureCSS = '';
  if (enabledFeatures.size > 0) {
    featureCSS = Array.from(enabledFeatures).map(f => `"${f}" 1`).join(', ');
  }

  // 构建 font-variation-settings
  let fvarCSS = '';
  const container = $('#fvarControls');
  if (container && fvarAxes.length) {
    const sliders = container.querySelectorAll('input[type=range][data-axis]');
    const parts = [];
    for (const slider of sliders) {
      const tag = slider.dataset.axis;
      const val = parseFloat(slider.value);
      const axis = fvarAxes.find(a => a.tag === tag);
      if (axis && val !== axis.default) {
        parts.push(`"${tag}" ${val}`);
      }
    }
    if (parts.length) fvarCSS = parts.join(', ');
  }

  // 通过 CSS 变量应用到预览容器
  const cssVars = {
    '--pf-size': size + 'px',
    '--pf-lineH': lineH,
    '--pf-ls': ls + 'em',
    '--pf-ws': ws + 'em',
    '--pf-features': featureCSS,
    '--pf-fvar': fvarCSS,
    '--pf-lang': otLang ? `"${otLang}"` : '',
  };

  for (const [k, v] of Object.entries(cssVars)) {
    document.documentElement.style.setProperty(k, v);
  }
}

function applyPreviewBg(bg) {
  const textColor = (bg === '#000' || bg === '#333') ? '#fff' : '#000';
  const h = $('#previewContentH');
  const v = $('#previewContentV');
  if (h) {
    h.parentElement.style.background = bg;
    h.style.color = textColor;
  }
  if (v) {
    v.parentElement.style.background = bg;
    v.style.color = textColor;
  }
}

/* ══════════════════════════════════════════════════════════════════
   变量字体轴控件
   ══════════════════════════════════════════════════════════════════ */
function renderFvarControls() {
  const container = $('#fvarControls');
  if (!container) return;
  if (!fvarAxes.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  container.innerHTML = '';
  for (const axis of fvarAxes) {
    const desc = getFeatureName(axis.tag);
    const label = `${axis.tag}${desc !== axis.tag ? ' ' + desc : ''}`;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
    div.innerHTML = `
      <span style="font-size:11px;color:var(--tx-2);min-width:60px" title="${label}">${axis.tag}</span>
      <input type="range" min="${axis.min}" max="${axis.max}" value="${axis.default}" step="${Math.max(1, (axis.max - axis.min) / 100)}" data-axis="${axis.tag}" style="width:120px">
      <span style="font-size:11px;color:var(--tx-2);min-width:40px" id="fvarVal_${axis.tag}">${axis.default}</span>
    `;
    container.appendChild(div);
    const slider = div.querySelector('input[type=range]');
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      document.getElementById(`fvarVal_${axis.tag}`).textContent = Math.round(val);
      applyPreviewStyle();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════
   OT 特性开关（核心：toggle 只改 Set + 调 applyPreviewStyle）
   ══════════════════════════════════════════════════════════════════ */
function renderOtFeatureToggles() {
  const container = $('#otFeatureToggles');
  if (!container) return;

  if (!otfFeatures.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--tx-2)">无 OpenType 特性</span>';
    return;
  }

  // 分组
  const grouped = {};
  const ungrouped = [];

  for (const f of otfFeatures) {
    let placed = false;
    for (const [group, tags] of Object.entries(FEATURE_GROUPS)) {
      if (tags.includes(f.tag)) {
        if (!grouped[group]) grouped[group] = [];
        grouped[group].push(f);
        placed = true;
        break;
      }
    }
    if (!placed) ungrouped.push(f);
  }

  let html = '';

  // 快捷操作
  html += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
    <button class="btn-ghost btn-sm" id="featAllOn" style="font-size:11px">全部开启</button>
    <button class="btn-ghost btn-sm" id="featAllOff" style="font-size:11px">全部关闭</button>
    <span style="font-size:11px;color:var(--tx-3)" id="featCount">${enabledFeatures.size}/${otfFeatures.length}</span>
  </div>`;

  // 按组渲染
  for (const [group, features] of Object.entries(grouped)) {
    html += `<div style="margin-bottom:6px"><span style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px">${group}</span><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">`;
    for (const f of features) {
      html += renderToggleChip(f);
    }
    html += '</div></div>';
  }

  // 未分组的
  if (ungrouped.length) {
    html += `<div style="margin-bottom:6px"><span style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px">其他</span><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">`;
    for (const f of ungrouped) {
      html += renderToggleChip(f);
    }
    html += '</div></div>';
  }

  container.innerHTML = html;

  // 事件绑定
  container.querySelectorAll('.feat-toggle').forEach(label => {
    const cb = label.querySelector('input');
    const tag = label.dataset.tag;
    label.addEventListener('click', (e) => {
      e.preventDefault();
      cb.checked = !cb.checked;
      if (cb.checked) enabledFeatures.add(tag); else enabledFeatures.delete(tag);
      refreshChipStyle(label, cb.checked);
      updateFeatCount();
      applyPreviewStyle(); // ← 秒级：只改 CSS 变量
    });
  });

  $('#featAllOn')?.addEventListener('click', () => {
    otfFeatures.forEach(f => enabledFeatures.add(f.tag));
    refreshAllChipStyles();
    updateFeatCount();
    applyPreviewStyle();
  });

  $('#featAllOff')?.addEventListener('click', () => {
    enabledFeatures.clear();
    refreshAllChipStyles();
    updateFeatCount();
    applyPreviewStyle();
  });
}

function renderToggleChip(f) {
  const featureDesc = getFeatureName(f.tag);
  const isOn = enabledFeatures.has(f.tag);
  return `<label class="feat-toggle${isOn ? ' is-on' : ''}" data-tag="${f.tag}" title="${featureDesc !== f.tag ? featureDesc : ''} (${f.table})">
    <input type="checkbox" ${isOn ? 'checked' : ''}>
    <span>${f.tag}</span>
  </label>`;
}

function refreshChipStyle(label, isOn) {
  label.classList.toggle('is-on', isOn);
  const cb = label.querySelector('input');
  cb.checked = isOn;
}

function refreshAllChipStyles() {
  const container = $('#otFeatureToggles');
  container?.querySelectorAll('.feat-toggle').forEach(label => {
    const tag = label.dataset.tag;
    const isOn = enabledFeatures.has(tag);
    refreshChipStyle(label, isOn);
  });
}

function updateFeatCount() {
  const el = $('#featCount');
  if (el) el.textContent = `${enabledFeatures.size}/${otfFeatures.length}`;
}
