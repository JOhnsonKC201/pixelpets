// Clipboard history rules (the poller lives in tools/index.js). The feature is off
// by default and never touches disk; this file decides what is even allowed into
// the in-memory list. It errs toward refusing: losing a clip of a random-looking
// token is cheap, keeping someone's API key in a list on screen is not.

const MAX_ENTRIES = 20;
const MAX_ENTRY_LEN = 500;
const MAX_SOURCE_LEN = 4000;
const PREVIEW_LEN = 80;

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----/,
  /\beyJ[\w-]{5,}\.eyJ[\w-]{5,}\.[\w-]+/,            // JWT
  /\b(AKIA|ASIA)[A-Z0-9]{16}\b/,                      // AWS access key id
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,         // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,                          // OpenAI / Anthropic style keys
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,                   // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/,                         // Google API key
  /^[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}$/,            // Google app password
];

// A link that carries its own credential: a secret calendar feed
// (.../private-<32 hex>/basic.ics), a signed download, a webhook with ?token=.
// Errs toward refusing, so some long share links are skipped too.
const SECRET_URL_PARAM = /[?&#](token|access_token|key|api_key|apikey|secret|sig|signature|x-amz-signature|auth)=/i;
function looksLikeSecretUrl(s) {
  if (!/^https?:\/\//i.test(s)) return false;
  if (SECRET_URL_PARAM.test(s)) return true;
  return s.split(/[/?&=#._-]+/).some((part) => part.length >= 24 && /[a-z]/i.test(part) && /\d/.test(part));
}

// One unbroken token that mixes 3+ character classes looks like a password.
function looksLikePassword(s) {
  if (/\s/.test(s) || s.length < 12 || s.length > 128) return false;
  if (/^(https?:\/\/|[a-z]:\\|\/)/i.test(s)) return false;   // URLs and paths are fine
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(s)).length;
  return classes >= 3;
}

function isSecretLike(text) {
  const s = String(text == null ? '' : text);
  if (s.length > MAX_SOURCE_LEN) return true;
  const t = s.trim();
  return SECRET_PATTERNS.some((re) => re.test(t)) || looksLikeSecretUrl(t) || looksLikePassword(t);
}

// Returns a new list with `text` at the front (moved there if it was already in
// the list), or the same contents when the text is blank or refused.
function pushEntry(list, text) {
  const raw = String(text == null ? '' : text);
  if (!raw.trim() || isSecretLike(raw)) return [...list];
  const entry = raw.slice(0, MAX_ENTRY_LEN);
  return [entry, ...list.filter((s) => s !== entry)].slice(0, MAX_ENTRIES);
}

const preview = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LEN);

module.exports = { isSecretLike, pushEntry, preview, MAX_ENTRIES };
