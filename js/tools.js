/**
 * TypeForge Pro — Tools Panel
 * Scheme A | Round 1
 */
import { $, state, api, toast } from './state.js';

export function initTools() {
  $('#ttxExportBtn')?.addEventListener('click', onTtxExport);
  $('#ttxCopyBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText($('#ttxContent')?.textContent || '');
    toast('已复制');
  });
  $('#subsetBtn')?.addEventListener('click', onSubset);
}

async function onTtxExport() {
  if (!state.SID) return;
  const table = $('#ttxTable')?.value || '';
  try {
    const res = await api(`/ttx/${state.SID}?table=${table}`);
    const data = await res.json();
    const ttxOutput = $('#ttxOutput');
    if (ttxOutput) ttxOutput.style.display = 'block';
    const ttxContent = $('#ttxContent');
    if (ttxContent) ttxContent.textContent = data.ttx;
  } catch (e) { toast(e.message, 'err'); }
}

async function onSubset() {
  if (!state.SID) return;
  const chars = $('#subsetChars')?.value;
  if (!chars) { toast('请输入字符', 'err'); return; }
  try {
    const res = await api(`/subset/${state.SID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chars })
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.fontInfo.filename.replace(/\.\w+$/, '-subset.ttf');
    a.click();
    toast('子集化完成');
  } catch (e) { toast(e.message, 'err'); }
}
