const { getState, setState } = require('../db');

const MAX = {
  bands: 90,
  albums: 90,
  curiosities: 60,
  songs: 60,
  reco: 150,
  onthisday: 50,
  quiz: 80,
};

const KEYS = {
  bands: 'content_hist_bands',
  albums: 'content_hist_albums',
  curiosities: 'content_hist_curiosities',
  songs: 'content_hist_songs',
  reco: 'content_hist_reco',
  onthisday: 'content_hist_onthisday',
  quiz: 'content_hist_quiz',
};

function loadList(key) {
  try {
    const raw = getState(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveList(key, arr, max) {
  setState(key, JSON.stringify(arr.slice(-max)));
}

/** Registra ítem usado; evita duplicados recientes en la cola. */
function remember(key, value, max = 80) {
  const v = String(value || '').trim();
  if (!v) return;
  const lower = v.toLowerCase();
  const list = loadList(key).filter((x) => String(x).toLowerCase() !== lower);
  list.push(v);
  saveList(key, list, max);
}

function exclusionBlock(key, label, limit = 45) {
  const list = loadList(key).slice(-limit);
  if (!list.length) return '';
  return `\n${label} (NO repetir): ${list.join(' · ')}.`;
}

function getPeruDateKey() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayCache(type) {
  const cacheKey = `day_${type}_${getPeruDateKey()}`;
  try {
    const raw = getState(cacheKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setDayCache(type, data) {
  setState(`day_${type}_${getPeruDateKey()}`, JSON.stringify(data));
}

function clearDayCache(type) {
  setState(`day_${type}_${getPeruDateKey()}`, '');
}

module.exports = {
  KEYS,
  MAX,
  loadList,
  remember,
  exclusionBlock,
  getPeruDateKey,
  getDayCache,
  setDayCache,
  clearDayCache,
};
