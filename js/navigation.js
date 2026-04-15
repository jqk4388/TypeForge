/**
 * TypeForge Pro — Panel Navigation
 * - 切换面板时通知矢量编辑器重新初始化
 */
import { $$ } from './state.js';
import { onVectorPanelVisible } from './vector.js';

export function initNavigation() {
  $$('.rbtn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.rbtn[data-panel]').forEach(b => b.classList.remove('act'));
      btn.classList.add('act');
      $$('.panel').forEach(p => p.classList.remove('vis'));
      const panel = document.getElementById(`panel-${btn.dataset.panel}`);
      if (panel) panel.classList.add('vis');

      // 通知矢量编辑器面板已可见
      if (btn.dataset.panel === 'vector') {
        requestAnimationFrame(() => onVectorPanelVisible());
      }
    });
  });
}

/** Switch to a specific panel programmatically */
export function switchToPanel(name) {
  $$('.rbtn[data-panel]').forEach(b => b.classList.remove('act'));
  const btn = document.querySelector(`[data-panel="${name}"]`);
  if (btn) btn.classList.add('act');
  $$('.panel').forEach(p => p.classList.remove('vis'));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('vis');

  // 通知矢量编辑器面板已可见
  if (name === 'vector') {
    requestAnimationFrame(() => onVectorPanelVisible());
  }
}
