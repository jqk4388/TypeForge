/**
 * TypeForge Pro — Preview Panel
 * Scheme A | Round 1
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
  previewFontUrl = `/api/preview/${state.SID}?t=${Date.now()}`;
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
    // Tooltip with Chinese name
    const featureDesc = getFeatureName(f.tag);
    label.title = featureDesc !== f.tag ? `${featureDesc} (${f.table} Lookup×${f.lookupCount})` : `${f.table} Lookup×${f.lookupCount}`;
    container.appendChild(label);
  }
}

function updatePreview() {
  if (!previewFontUrl) return;
  const text = $('#previewText')?.value || '';
  const size = $('#previewSize')?.value || '36';
  const lineH = $('#previewLineH')?.value || '1.4';
  const bg = $('#previewBg')?.value || '#fff';
  const fontFace = `@font-face { font-family: 'PreviewFont'; src: url('${previewFontUrl}') format('truetype'); }`;

  let featureStr = '';
  if (enabledFeatures.size > 0) {
    featureStr = Array.from(enabledFeatures).map(f => `"${f}" on`).join(', ');
  }

  const style = `font-family:'PreviewFont',sans-serif;font-size:${size}px;line-height:${lineH};background:${bg};color:${bg === '#000' || bg === '#333' ? '#fff' : '#000'}${featureStr ? ';font-feature-settings:' + featureStr : ''}`;

  const h = $('#previewH');
  const v = $('#previewV');
  if (h) h.innerHTML = `<style>${fontFace}</style><div style="${style}">${text}</div>`;
  if (v) v.innerHTML = `<style>${fontFace}</style><div style="${style}">${text}</div>`;

  const sizeVal = $('#previewSizeVal');
  if (sizeVal) sizeVal.textContent = size + 'px';
}
