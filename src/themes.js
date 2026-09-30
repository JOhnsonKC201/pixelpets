// Custom coat themes - user-defined colour palettes layered on top of the 12
// built-in coats. Stored in themes.json in the per-user app-data dir (next to
// settings.json). Tolerant load (missing/corrupt -> []), atomic save, strict
// validation: every colour role must be a #rrggbb hex or the theme is dropped.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const BUILD_NAMES = ['standard', 'slender', 'stocky', 'fluffy'];
const ROLES = ['coat', 'mark', 'white', 'patch', 'eye', 'nose', 'inner', 'outline'];
const HEX = /^#[0-9a-fA-F]{6}$/;
// Hard cap on custom coats. The overlay builds a full set of sit/type/loaf/rear
// sprites per coat and both pickers (tray submenu, settings dropdown) are flat
// lists, so an imported themes.json with thousands of entries would stall the
// overlay building coats nobody can scroll to. It also gives config.js a bounded
// ceiling for the coat index, which addresses built-ins and custom coats in one
// run of numbers (see MAX_PATTERN there).
const MAX_THEMES = 64;

function filePath() { return path.join(app.getPath('userData'), 'themes.json'); }

function validateOne(t) {
  if (!t || typeof t !== 'object') return null;
  const name = String(t.name == null ? '' : t.name).trim().slice(0, 24);
  if (!name) return null;
  const out = { name, build: BUILD_NAMES.includes(t.build) ? t.build : 'standard', tabby: !!t.tabby };
  for (const r of ROLES) {
    const v = String(t[r] || '').trim();
    if (!HEX.test(v)) return null;
    out[r] = v.toLowerCase();
  }
  return out;
}

function clean(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(validateOne)
    .filter((t) => t && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()))
    .slice(0, MAX_THEMES);
}

function load(file = filePath()) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
  catch (e) { return []; }
  try {
    const data = JSON.parse(raw);
    return clean(Array.isArray(data) ? data : (data && data.themes));
  } catch (e) {
    // Corrupt: start empty, but keep the file. The next add or delete writes a
    // new list over it, and every coat the user designed is in this one.
    try {
      const dest = `${file}.corrupt-${Date.now()}`;
      if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);
    } catch (e2) { /* best effort */ }
    return [];
  }
}
function save(list, file = filePath()) {
  const out = clean(list);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ themes: out }, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) { /* keep in-memory value even if disk write fails */ }
  return out;
}

module.exports = { load, save, validateOne, clean, BUILD_NAMES, ROLES, MAX_THEMES, filePath };
