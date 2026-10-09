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
// Marks are allowed after the first character: in Devanagari and other scripts
// the vowel signs are marks, and a name without them is not a word.
const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]*$/u;

// One word, lower-cased, or null. NFKC folds look-alikes (a full-width "ａ")
// onto the plain letter, so two names that read the same are the same name.
function cleanName(name) {
  const n = String(name == null ? '' : name).normalize('NFKC').trim().toLowerCase();
  return n.length >= 1 && n.length <= MAX_NAME && NAME.test(n) ? n : null;
}

// Credentials the token list above does not cover, in shapes specific enough
// that an address or a sign-off never matches: a connection string with a
// password in it, a "password: ..." line, and a few more vendors' key prefixes.
const MORE_SECRETS = [
  /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqps?):\/\/[^\s:@/]+:[^\s@]+@/i,
  /\b(secret|password|passwd|token|api[_-]?key)\s*[:=]\s*\S{6,}/i,
  /\b[sprk]k_(live|test)_[A-Za-z0-9]{8,}/,      // Stripe
  /\bglpat-[\w-]{16,}/,                          // GitLab
  /\bnpm_[A-Za-z0-9]{36}\b/,                     // npm
  /\bBearer\s+[\w.~+/-]{16,}/,
];

const looksSecret = (text) => {
  const t = text.trim();
  return SECRET_PATTERNS.some((re) => re.test(t)) || MORE_SECRETS.some((re) => re.test(t));
};

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
