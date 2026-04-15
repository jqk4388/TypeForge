/**
 * TypeForge Pro — Preview Panel
 * Fix: Use iframe srcdoc to guarantee @font-face loads correctly
 */
import { $, $$, state, api, toast, getFeatureName, loadPlatformInfo } from './state.js';

let previewFontUrl = null;
let otfFeatures = [];
let enabledFeatures = new Set();

export async function initPreview() {
  await loadPlatformInfo();

  $('#previewText')?.addEventListener('input', updatePreview);
  $('#previewSize')?.addEventListener('input', updatePreview);
  $('#previewLineH')?.addEventListener('input', updatePreview);
  $('#previewBg')?.addEventListener('change', updatePreview);
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
  updatePreview();
}

function renderOtFeatureToggles() {
  const container = $('#otFeatureToggles');
  if (!container) return;
  if (!otfFeatures.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--tx-2)">无 OpenType 特性</span>';
    return;
  }
  container.innerHTML = '';
  for (const f of otfFeatures) {
    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:2px 8px;border:1px solid var(--bd);border-radius:4px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = enabledFeatures.has(f.tag);
    cb.addEventListener('change', () => {
      if (cb.checked) enabledFeatures.add(f.tag);
      else enabledFeatures.delete(f.tag);
      updatePreview();
    });
    const span = document.createElement('span');
    span.style.color = 'var(--ac)';
    span.textContent = f.tag;
    label.appendChild(cb);
    label.appendChild(span);
    const featureDesc = getFeatureName(f.tag);
    label.title = featureDesc !== f.tag ? `${featureDesc} (${f.table} Lookup×${f.lookupCount})` : `${f.table} Lookup×${f.lookupCount}`;
    container.appendChild(label);
  }
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

  const textColor = (bg === '#000' || bg === '#333') ? '#fff' : '#000';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
@font-face {
  font-family: 'PreviewFont';
  src: url('${previewFontUrl}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'PreviewFont', serif;
  font-size: ${size}px;
  line-height: ${lineH};
  background: ${bg};
  color: ${textColor};
  padding: 20px;
  writing-mode: ${writingMode};
  word-break: break-all;
  min-height: 100vh;
  ${featureCSS}
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

  setIframeContent('previewIframeH', buildIframeSrcdoc(text, size, lineH, bg, 'horizontal-tb'));
  setIframeContent('previewIframeV', buildIframeSrcdoc(text, size, lineH, bg, 'vertical-rl'));
}
