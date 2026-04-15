/**
 * TypeForge Pro — Preview Panel v2
 *
 * 改进：
 * 1. 防抖：输入变化 300ms 后才更新 iframe，避免卡顿
 * 2. 横排修复：iframe min-height 改为 auto + 充足 padding，内容不被截断
 * 3. OpenType 特性开关增强：分组显示、全开/全关、常用特性置顶
 * 4. 丰富控件：预设文本、字间距、字重/字宽滑块、OpenType 语言
 * 5. 变量字体轴控制（如果有 fvar）
 */
import { $, $$, state, api, toast, getFeatureName, loadPlatformInfo } from './state.js';

let previewFontUrl = null;
let otfFeatures = [];
let enabledFeatures = new Set();
let fvarAxes = [];
let updateTimer = null;
let lastSrcdocH = '';
let lastSrcdocV = '';

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

  // 所有输入变化都走防抖更新
  const debouncedUpdate = () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePreview, 300);
  };

  textInput?.addEventListener('input', debouncedUpdate);
  sizeInput?.addEventListener('input', debouncedUpdate);
  lineHInput?.addEventListener('input', debouncedUpdate);
  bgSelect?.addEventListener('change', debouncedUpdate);
  letterSpacing?.addEventListener('input', debouncedUpdate);
  wordSpacing?.addEventListener('input', debouncedUpdate);
  openTypeLang?.addEventListener('change', debouncedUpdate);

  // 预设文本按钮
  $$('.preset-text-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (PRESET_TEXTS[key]) {
        textInput.value = PRESET_TEXTS[key];
        debouncedUpdate();
      }
    });
  });

  // 字号实时显示
  sizeInput?.addEventListener('input', () => {
    const val = $('#previewSizeVal');
    if (val) val.textContent = sizeInput.value + 'px';
  });
}

export async function loadPreviewFont() {
  if (!state.SID) return;
  // Force a fresh URL each time to bust browser font cache
  previewFontUrl = `${location.origin}/api/preview/${state.SID}?t=${Date.now()}`;
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
  updatePreview();
}

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
      clearTimeout(updateTimer);
      updateTimer = setTimeout(updatePreview, 200);
    });
  }
}

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
      const featureDesc = getFeatureName(f.tag);
      const isOn = enabledFeatures.has(f.tag);
      html += `<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;padding:2px 6px;border:1px solid ${isOn ? 'var(--ac)' : 'var(--bd)'};border-radius:4px;background:${isOn ? 'var(--ac-bg)' : 'transparent'}" class="feat-toggle" data-tag="${f.tag}" title="${featureDesc !== f.tag ? featureDesc : ''} (${f.table})">
        <input type="checkbox" ${isOn ? 'checked' : ''} style="accent-color:var(--ac);width:12px;height:12px">
        <span style="color:${isOn ? 'var(--ac)' : 'var(--tx-2)'};font-weight:500">${f.tag}</span>
      </label>`;
    }
    html += '</div></div>';
  }

  // 未分组的
  if (ungrouped.length) {
    html += `<div style="margin-bottom:6px"><span style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px">其他</span><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">`;
    for (const f of ungrouped) {
      const featureDesc = getFeatureName(f.tag);
      const isOn = enabledFeatures.has(f.tag);
      html += `<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;padding:2px 6px;border:1px solid ${isOn ? 'var(--ac)' : 'var(--bd)'};border-radius:4px;background:${isOn ? 'var(--ac-bg)' : 'transparent'}" class="feat-toggle" data-tag="${f.tag}" title="${featureDesc !== f.tag ? featureDesc : ''} (${f.table})">
        <input type="checkbox" ${isOn ? 'checked' : ''} style="accent-color:var(--ac);width:12px;height:12px">
        <span style="color:${isOn ? 'var(--ac)' : 'var(--tx-2)'};font-weight:500">${f.tag}</span>
      </label>`;
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
      // 更新样式
      label.style.borderColor = cb.checked ? 'var(--ac)' : 'var(--bd)';
      label.style.background = cb.checked ? 'var(--ac-bg)' : 'transparent';
      label.querySelector('span').style.color = cb.checked ? 'var(--ac)' : 'var(--tx-2)';
      updateFeatCount();
      clearTimeout(updateTimer);
      updateTimer = setTimeout(updatePreview, 150);
    });
  });

  $('#featAllOn')?.addEventListener('click', () => {
    otfFeatures.forEach(f => enabledFeatures.add(f.tag));
    refreshToggleStyles();
    updateFeatCount();
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePreview, 150);
  });

  $('#featAllOff')?.addEventListener('click', () => {
    enabledFeatures.clear();
    refreshToggleStyles();
    updateFeatCount();
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePreview, 150);
  });

  function refreshToggleStyles() {
    container.querySelectorAll('.feat-toggle').forEach(label => {
      const tag = label.dataset.tag;
      const isOn = enabledFeatures.has(tag);
      const cb = label.querySelector('input');
      cb.checked = isOn;
      label.style.borderColor = isOn ? 'var(--ac)' : 'var(--bd)';
      label.style.background = isOn ? 'var(--ac-bg)' : 'transparent';
      label.querySelector('span').style.color = isOn ? 'var(--ac)' : 'var(--tx-2)';
    });
  }

  function updateFeatCount() {
    const el = $('#featCount');
    if (el) el.textContent = `${enabledFeatures.size}/${otfFeatures.length}`;
  }
}

function getFvarCSS() {
  if (!fvarAxes.length) return '';
  const container = $('#fvarControls');
  if (!container) return '';
  const sliders = container.querySelectorAll('input[type=range][data-axis]');
  if (!sliders.length) return '';
  const parts = [];
  for (const slider of sliders) {
    const tag = slider.dataset.axis;
    const val = parseFloat(slider.value);
    const axis = fvarAxes.find(a => a.tag === tag);
    if (axis && val !== axis.default) {
      parts.push(`"${tag}" ${val}`);
    }
  }
  return parts.length ? `font-variation-settings: ${parts.join(', ')};` : '';
}

/**
 * Build an iframe srcdoc so the @font-face is isolated and always loads.
 * Using absolute URL so the iframe can fetch from the same origin.
 */
function buildIframeSrcdoc(text, size, lineH, bg, writingMode) {
  if (!previewFontUrl) return `<html><body style="margin:16px;color:#888">请先加载字体</body></html>`;

  let featureCSS = '';
  if (enabledFeatures.size > 0) {
    featureCSS = 'font-feature-settings:' +
      Array.from(enabledFeatures).map(f => `"${f}" 1`).join(', ') + ';';
  }

  const fvarCSS = getFvarCSS();
  const letterSpacing = $('#previewLetterSpacing')?.value || '0';
  const wordSpacing = $('#previewWordSpacing')?.value || '0';
  const otLang = $('#previewOTLang')?.value || '';
  const textColor = (bg === '#000' || bg === '#333') ? '#fff' : '#000';

  // 横排用 auto height + 充足 padding，确保内容不被截断
  const bodyHeight = writingMode === 'vertical-rl' ? 'min-height: 100vh;' : 'min-height: 100%;';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
@font-face {
  font-family: 'PreviewFont';
  src: url('${previewFontUrl}') format('opentype'),
       url('${previewFontUrl}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { height: 100%; }
body {
  font-family: 'PreviewFont', serif;
  font-size: ${size}px;
  line-height: ${lineH};
  background: ${bg};
  color: ${textColor};
  padding: 20px;
  writing-mode: ${writingMode};
  word-break: break-all;
  overflow-wrap: break-word;
  ${bodyHeight}
  ${featureCSS}
  ${fvarCSS}
  letter-spacing: ${letterSpacing}em;
  word-spacing: ${wordSpacing}em;
  ${otLang ? `font-language-override: "${otLang}";` : ''}
}
</style>
</head><body>${escHtml(text)}</body></html>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setIframeContent(iframeId, srcdoc) {
  let el = document.getElementById(iframeId);
  if (!el) return;
  // 避免重复设置相同内容（减少 iframe 重绘）
  if (iframeId === 'previewIframeH' && srcdoc === lastSrcdocH) return;
  if (iframeId === 'previewIframeV' && srcdoc === lastSrcdocV) return;
  if (iframeId === 'previewIframeH') lastSrcdocH = srcdoc;
  else lastSrcdocV = srcdoc;
  el.srcdoc = srcdoc;
}

function updatePreview() {
  if (!previewFontUrl) return;
  const text = $('#previewText')?.value || '';
  const size = $('#previewSize')?.value || '36';
  const lineH = $('#previewLineH')?.value || '1.4';
  const bg = $('#previewBg')?.value || '#fff';

  const sizeVal = $('#previewSizeVal');
  if (sizeVal) sizeVal.textContent = size + 'px';

  lastSrcdocH = '';
  lastSrcdocV = '';
  setIframeContent('previewIframeH', buildIframeSrcdoc(text, size, lineH, bg, 'horizontal-tb'));
  setIframeContent('previewIframeV', buildIframeSrcdoc(text, size, lineH, bg, 'vertical-rl'));
}
