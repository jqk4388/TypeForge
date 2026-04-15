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
  if (!state.SID) { toast('请先加载字体', 'warn'); return; }
  const table = $('#ttxTable')?.value || '';
  const btn = $('#ttxExportBtn');
  if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }
  try {
    const url = `/api/ttx/${state.SID}` + (table ? `?table=${encodeURIComponent(table)}` : '');
    const res = await api(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const ttxOutput = $('#ttxOutput');
    if (ttxOutput) ttxOutput.style.display = 'block';
    const ttxContent = $('#ttxContent');
    if (ttxContent) ttxContent.textContent = data.ttx || '(空)';
    toast('TTX 导出成功');
  } catch (e) {
    toast('TTX 导出失败: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '导出 TTX'; }
  }
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
