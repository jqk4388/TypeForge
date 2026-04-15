/**
 * TypeForge Pro — Global State & API Helper
 * Scheme A | Round 1
 * Change: extract global state and API helper from index.html inline script
 */

const API = '';  // Same origin

// ─── Global State ────────────────────────────────────────────
let SID = null;           // session id
let fontInfo = null;      // font metadata
let nameRecords = [];
let cmapData = [];
let glyphsList = [];
let currentMetricTab = 'hhea';
let currentOtlTab = 'GSUB';
let loadedConfig = null;

// Platform info (loaded once)
let platformInfo = null;  // { platforms, macLanguages, winLanguages, otFeatures, otlScripts, metricDescriptions }

// ─── Helpers ─────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function toast(msg, type = 'ok') {
  const d = document.createElement('div');
  d.className = `toast toast-${type}`;
  d.textContent = msg;
  document.getElementById('toastContainer').appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res;
}

// ─── Platform Info Loader ────────────────────────────────────
async function loadPlatformInfo() {
  if (platformInfo) return platformInfo;
  try {
    const res = await api('/platform-info');
    platformInfo = await res.json();
    return platformInfo;
  } catch (e) {
    console.warn('Failed to load platform info:', e);
    return null;
  }
}

function getPlatformName(pid) {
  if (!platformInfo) return `${pid}`;
  return platformInfo.platforms[pid] || `${pid}`;
}

function getLanguageName(pid, lid) {
  if (!platformInfo) return `0x${lid.toString(16).toUpperCase().padStart(4, '0')}`;
  if (pid === 3) {
    return platformInfo.winLanguages[lid] || `0x${lid.toString(16).toUpperCase().padStart(4, '0')}`;
  } else if (pid === 1) {
    return platformInfo.macLanguages[lid] || `0x${lid.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return `0x${lid.toString(16).toUpperCase().padStart(4, '0')}`;
}

function getFeatureName(tag) {
  if (!platformInfo) return tag;
  return platformInfo.otFeatures[tag] || tag;
}

function getScriptName(tag) {
  if (!platformInfo) return tag;
  return platformInfo.otlScripts[tag] || tag;
}

function getMetricDescription(key) {
  if (!platformInfo) return '';
  return platformInfo.metricDescriptions[key] || '';
}

// ─── Export ──────────────────────────────────────────────────
export {
  API, SID, fontInfo, nameRecords, cmapData, glyphsList,
  currentMetricTab, currentOtlTab, loadedConfig, platformInfo,
  $, $$, toast, api, loadPlatformInfo,
  getPlatformName, getLanguageName, getFeatureName, getScriptName, getMetricDescription
};

// Mutable state setters (exported as let-alike via object)
export const state = {
  get SID() { return SID; },
  set SID(v) { SID = v; },
  get fontInfo() { return fontInfo; },
  set fontInfo(v) { fontInfo = v; },
  get nameRecords() { return nameRecords; },
  set nameRecords(v) { nameRecords = v; },
  get cmapData() { return cmapData; },
  set cmapData(v) { cmapData = v; },
  get glyphsList() { return glyphsList; },
  set glyphsList(v) { glyphsList = v; },
  get currentMetricTab() { return currentMetricTab; },
  set currentMetricTab(v) { currentMetricTab = v; },
  get currentOtlTab() { return currentOtlTab; },
  set currentOtlTab(v) { currentOtlTab = v; },
  get loadedConfig() { return loadedConfig; },
  set loadedConfig(v) { loadedConfig = v; },
};

/** Clear all cached panel data when switching fonts */
export function resetState() {
  nameRecords = [];
  cmapData = [];
  glyphsList = [];
  currentMetricTab = 'hhea';
  currentOtlTab = 'GSUB';
  loadedConfig = null;
}
