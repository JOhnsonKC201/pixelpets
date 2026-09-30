// Pinned shortcuts: the user's own list of sites, folders and apps the launcher
// opens in one keystroke. This is the allowlist that decides what may be opened.
// It runs twice: when settings are saved (normalize) and again right before
// opening (tools/system.js), so a hand-edited settings.json cannot skip it.

const path = require('path');

const MAX_SHORTCUTS = 30;
const MAX_LABEL = 40;
const MAX_TARGET = 1000;
const URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const INDIRECT_FILES = /\.(url|website|scf|webloc|inetloc)$/i;

// Returns { kind: 'url' | 'path', value } or null.
function validateTarget(target, pathApi = path) {
  const t = String(target == null ? '' : target).trim();
  if (!t || t.length > MAX_TARGET || t.includes('\u0000')) return null;

  // Any "scheme:" prefix of 2+ letters is treated as a URL, so "javascript:" or
  // "ms-settings:" can never slip through as a path. One letter is a drive (C:).
  if (/^[a-z][a-z0-9+.-]+:/i.test(t)) {
    let url;
    try { url = new URL(t); } catch (e) { return null; }
    return URL_PROTOCOLS.has(url.protocol) ? { kind: 'url', value: url.href } : null;
  }
  // UNC paths (\\host\share or //host/share) make Windows authenticate to a
  // remote machine the moment they are opened, so they are refused outright.
  if (/^[\\/]{2}/.test(t)) return null;
  // Internet-shortcut and shell-command files point somewhere this check never
  // sees (a .url can hold a file:// or UNC link). Pin the link itself instead.
  // .lnk is allowed because it is how Windows pins apps; system.js resolves it
  // and re-validates the real target before opening.
  if (INDIRECT_FILES.test(t)) return null;
  if (pathApi.isAbsolute(t) && (pathApi === path.posix || /^[a-z]:[\\/]/i.test(t))) {
    return { kind: 'path', value: t };
  }
  // A bare domain like "github.com/me" reads as a website.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return validateTarget(`https://${t}`, pathApi);
  return null;
}

function defaultLabel(v) {
  if (v.kind === 'url') {
    try {
      const u = new URL(v.value);
      return u.protocol === 'mailto:' ? u.pathname : u.hostname.replace(/^www\./, '');
    } catch (e) { return v.value; }
  }
  const parts = v.value.split(/[\\/]/).filter(Boolean);
  return (parts[parts.length - 1] || v.value).replace(/\.(app|lnk|exe)$/i, '');
}

let seq = 0;
const makeId = () => { seq += 1; return `s${Date.now().toString(36)}${seq.toString(36)}`; };

function normalizeShortcuts(list, pathApi = path) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).reduce((out, row) => {
    if (out.length >= MAX_SHORTCUTS || !row || typeof row !== 'object') return out;
    const v = validateTarget(row.target, pathApi);
    if (!v) return out;
    let id = /^s[a-z0-9]{1,20}$/.test(String(row.id || '')) ? String(row.id) : '';
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);
    // The label is always derived from the target, never read from the file. A
    // stored label could dress "evil.bat" up as "Notepad", and the Settings UI
    // never needed custom labels anyway.
    out.push({ id, label: defaultLabel(v).slice(0, MAX_LABEL), target: v.value });
    return out;
  }, []);
}

module.exports = { validateTarget, normalizeShortcuts, MAX_SHORTCUTS };
