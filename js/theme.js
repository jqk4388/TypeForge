/**
 * TypeForge Pro — Theme Toggle
 * Scheme A | Round 1
 */
import { $ } from './state.js';

export function initTheme() {
  $('#themeBtn')?.addEventListener('click', () => {
    const t = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = t;
  });
}
