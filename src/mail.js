// IMAP unread-mail watcher (main process). The actual IMAP connection runs in a
// short-lived forked worker (mail-worker.js) so a hung socket can never freeze the
// overlay. Main owns the app-password: it is stored encrypted-at-rest via Electron
// safeStorage (DPAPI on Windows) in userData/email.cred - never in settings.json -
// and decrypted only in-memory before being handed to the worker.
//
// The first poll after launch only establishes a baseline, so we never announce
// the inbox you already had; later polls announce when the unseen count rises.
const { runWorker } = require('./worker-host');
const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');

let timer = null;
let lastUnread = null;   // null = not yet baselined
let running = false;     // a poll worker is in flight
let notifyFn = null;
let getCfg = null;

function credPath() { return path.join(app.getPath('userData'), 'email.cred'); }

// Gmail hands out an app-password as four space-separated groups ("abcd efgh ijkl
// mnop") but the credential is the sixteen characters without the spaces, and that
// is how people paste it. Strip whitespace only for that exact shape, so a real
// passphrase that happens to contain a space survives untouched.
const GMAIL_APP_PASSWORD = /^[a-z0-9]{4}(?:\s+[a-z0-9]{4}){3}$/i;
function normalizePassword(plain) {
  const s = String(plain == null ? '' : plain).trim();
  return GMAIL_APP_PASSWORD.test(s) ? s.replace(/\s+/g, '') : s;
}

// Report on the stored credential rather than merely on the file's existence: a
// stale or undecryptable email.cred used to show a reassuring "saved" tick in
// Settings while every poll bailed out for want of a password. The length lets the
// UI call out a truncated app-password instead of pretending it is fine.
function passwordInfo() {
  const pw = readPassword();
  return { has: pw.length > 0, len: pw.length };
}
function hasPassword() { return passwordInfo().has; }
function setPassword(plain) {
  const pw = normalizePassword(plain);
  if (pw === '') {
    try { fs.unlinkSync(credPath()); } catch (e) { /* already gone */ }
    return { ok: true, len: 0 };
  }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Secure storage is unavailable on this system; cannot save the password.' };
  try {
    const enc = safeStorage.encryptString(pw);
    const fp = credPath();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = fp + '.tmp';
    fs.writeFileSync(tmp, enc);
    fs.renameSync(tmp, fp);
    return { ok: true, len: pw.length };
  } catch (e) { return { ok: false, error: 'Could not save the password.' }; }
}
function readPassword() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(fs.readFileSync(credPath()));
  } catch (e) { return ''; }
}

// Map an account to its IMAP server. Infer from the email domain when the host is
// blank or an obviously-wrong web address (e.g. www.gmail.com), and translate a
// bare provider domain to its real IMAP host. Never blanks a host the user typed,
// and leaves unknown/custom hosts untouched so self-hosted mail still works.
const IMAP_HOSTS = {
  'gmail.com': 'imap.gmail.com', 'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com', 'hotmail.com': 'outlook.office365.com',
  'live.com': 'outlook.office365.com', 'msn.com': 'outlook.office365.com',
  'yahoo.com': 'imap.mail.yahoo.com', 'ymail.com': 'imap.mail.yahoo.com',
  'icloud.com': 'imap.mail.me.com', 'me.com': 'imap.mail.me.com', 'mac.com': 'imap.mail.me.com',
  'aol.com': 'imap.aol.com',
};
const NON_IMAP_HOSTS = new Set(['www.gmail.com', 'www.googlemail.com', 'mail.google.com', 'www.google.com', 'google.com', 'www.outlook.com', 'www.yahoo.com']);
function imapHostFor(email, host) {
  const h = String(host == null ? '' : host).trim().toLowerCase();
  const domain = (String(email == null ? '' : email).split('@')[1] || '').trim().toLowerCase();
  const inferred = IMAP_HOSTS[domain] || '';
  if (!h) return inferred;                                   // blank -> infer from the email (may be '')
  if (IMAP_HOSTS[h]) return IMAP_HOSTS[h];                   // bare provider domain typed -> its IMAP host
  if (NON_IMAP_HOSTS.has(h) && inferred) return inferred;    // wrong web host AND we can infer -> correct it
  return h;                                                  // custom/unknown host: leave as-is
}

// Does this sender break through Focus Guard? Matched as a case-insensitive
// SUBSTRING of the From address, which is what makes "@acme.com" whitelist a whole
// company and "boss@acme.com" one person, with no pattern syntax to get wrong.
// An empty list never matches, so the feature costs nothing until it is used.
function isVip(address, vip) {
  const a = String(address == null ? '' : address).trim().toLowerCase();
  if (!a || !Array.isArray(vip)) return false;
  return vip.some((v) => { const n = String(v || '').trim().toLowerCase(); return n && a.includes(n); });
}

// What the pet actually says about new mail. A count on its own still makes you go
// and look; a name and a subject let you decide from the bubble. Falls back to the
// old count-only line whenever the server did not give us an envelope.
function describe(delta, latest) {
  const who = latest ? (latest.name || latest.address || '') : '';
  const subject = latest ? latest.subject : '';
  if (delta === 1 && who) return subject ? `${who}: ${subject}` : `New mail from ${who}`;
  if (delta > 1 && who) return `{count} new emails, latest from ${who}`;
  return delta === 1 ? 'You have {count} new email.' : 'You have {count} new emails.';
}

function credsFromCfg(cfg, plainOverride) {
  const e = (cfg && cfg.email) || {};
  return {
    host: imapHostFor(e.user, e.host), port: e.port, user: e.user, secure: e.secure !== false,
    // Normalize the override the same way setPassword does, so "Test" cannot pass a
    // spaced app-password that then differs from the one we stored.
    pass: plainOverride != null ? normalizePassword(plainOverride) : readPassword(),
  };
}

// Spawn the worker, feed it creds, resolve with its single result (or a timeout).
function spawnWorker(creds, timeoutMs, cb) {
  runWorker(path.join(__dirname, 'mail-worker.js'), creds,
    { timeoutMs: timeoutMs || 20000, name: 'mail', timeoutError: 'Timed out connecting.' }, cb);
}

function poll() {
  if (running) return;
  const cfg = getCfg && getCfg();
  if (!cfg || !cfg.email || !cfg.email.on) return;
  const creds = credsFromCfg(cfg);
  if (!creds.host || !creds.user || !creds.pass) return;   // not fully configured: stay quiet
  running = true;
  spawnWorker(creds, 25000, (res) => {
    running = false;
    if (!res || !res.ok) return;          // transient error: don't nag the user
    const count = res.unread | 0;
    if (lastUnread == null) { lastUnread = count; return; }   // first poll = baseline only
    if (count > lastUnread && notifyFn) {
      const delta = count - lastUnread;
      const latest = res.latest || null;
      const vip = !!(latest && isVip(latest.address, cfg.email.vip));
      notifyFn(describe(delta, latest),
        // vip rides past the Focus Guard hold in main.js: the whole point of naming
        // someone is that you want to hear from them even mid-meeting.
        { source: 'email', dedupeKey: 'mail', count: delta, title: 'New mail', vip });
    }
    lastUnread = count;
  });
}

// (Re)start or stop the poll loop whenever the email config changes.
function sync(cfg) {
  if (timer) { clearInterval(timer); timer = null; }
  lastUnread = null;   // re-baseline so a settings change never floods on first tick
  if (cfg && cfg.email && cfg.email.on) {
    const min = Math.max(1, Math.min(60, (cfg.email.intervalMin | 0) || 5));
    poll();                                   // immediate baseline
    timer = setInterval(poll, min * 60000);
  }
}

// One-shot connection test (Settings "Test"). plainOverride lets the user test a
// password they just typed without saving it first.
function test(cfg, plainOverride) {
  return new Promise((resolve) => {
    const creds = credsFromCfg(cfg, plainOverride);
    if (!creds.host || !creds.user || !creds.pass) { resolve({ ok: false, error: 'Fill in server, email, and password first.' }); return; }
    // return the effective host so the UI can show/save any auto-correction (e.g. www.gmail.com -> imap.gmail.com)
    spawnWorker(creds, 20000, (res) => resolve(res && res.ok ? { ok: true, unread: res.unread | 0, host: creds.host } : { ok: false, error: (res && res.error) || 'Connection failed.', host: creds.host }));
  });
}

function init(notify_, getCfg_) { notifyFn = notify_; getCfg = getCfg_; }
function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { init, sync, test, setPassword, hasPassword, passwordInfo, stop, imapHostFor, normalizePassword, isVip, describe };
