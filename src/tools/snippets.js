// Text snippets: a short name and a piece of text you saved ("sig", "addr"),
// copied back by typing ";name" in the launcher. Pure list rules, no Electron.
//
// Unlike clipboard history, snippets are written to settings.json as plain text,
// so a key or token is refused at the door. The check is the list of known
// formats only: the stricter clipboard-history guess ("looks like a password")
// would turn away a mixed-case email address or a meeting link, which are
// exactly what people save.

const { SECRET_PATTERNS } = require('./clipboard');

const MAX_SNIPPETS = 30;
const MAX_NAME = 24;
const MAX_TEXT = 2000;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

// One word, lower-cased, or null.
function cleanName(name) {
  const n = String(name == null ? '' : name).trim().toLowerCase();
  return n.length >= 1 && n.length <= MAX_NAME && NAME.test(n) ? n : null;
}

const looksSecret = (text) => SECRET_PATTERNS.some((re) => re.test(text.trim()));

function find(list, name) {
  const n = cleanName(name);
  return (n && (list || []).find((s) => s.name === n)) || null;
}

// { ok: true, list, replaced } with a new list, or
// { ok: false, reason: 'name' | 'none' | 'big' | 'secret' | 'full' }.
function add(list, name, text) {
  const n = cleanName(name);
  const t = String(text == null ? '' : text);
  if (!n) return { ok: false, reason: 'name' };
  if (!t.trim()) return { ok: false, reason: 'none' };
  if (t.length > MAX_TEXT) return { ok: false, reason: 'big' };
  if (looksSecret(t)) return { ok: false, reason: 'secret' };
  const current = list || [];
  const replaced = current.some((s) => s.name === n);
  if (!replaced && current.length >= MAX_SNIPPETS) return { ok: false, reason: 'full' };
  const entry = { name: n, text: t };
  return { ok: true, replaced, list: replaced ? current.map((s) => (s.name === n ? entry : s)) : [...current, entry] };
}

function remove(list, name) {
  const n = cleanName(name);
  return (list || []).filter((s) => s.name !== n);
}

// What config.normalize keeps from settings.json: the first of each name, and
// nothing that add() would have refused.
function normalizeSnippets(list) {
  return (Array.isArray(list) ? list : []).reduce((out, row) => {
    if (!row || typeof row !== 'object' || typeof row.text !== 'string') return out;
    const r = add(out, row.name, row.text);
    return r.ok && !r.replaced ? r.list : out;
  }, []);
}

module.exports = { cleanName, find, add, remove, normalizeSnippets, MAX_SNIPPETS, MAX_NAME, MAX_TEXT };
