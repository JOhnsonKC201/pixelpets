// A local, rotating log for the main process: userData/logs/pixelpets.log.
//
// Before this, everything went to console.log, which a packaged app throws away,
// so a crash on someone's machine left nothing behind to diagnose. The log never
// leaves the machine by itself. "Report a problem" (report.js) shows its tail to
// the person first, which is why every line is redacted on the way IN: an email
// address, a secret calendar URL or a token must not be on disk to paste later.
//
// Writes are batched in memory and flushed in order through one path, and a
// logger that cannot write simply goes quiet instead of throwing.
const fs = require('fs');
const path = require('path');

const { SECRET_PATTERNS } = require('./tools/clipboard');

const MAX_MESSAGE = 2000;
const FLUSH_MS = 300;

// Tokens first (a JWT or key can sit inside a URL), then links, emails, and the
// user's own name inside home-folder paths.
function redact(text) {
  let s = String(text == null ? '' : text);
  s = s.split(/(\s+)/).map((w) => (SECRET_PATTERNS.some((re) => re.test(w)) ? '<secret>' : w)).join('');
  s = s.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => {
    try {
      const u = new URL(url);
      return u.pathname === '/' && !u.search && !u.hash ? `${u.origin}/` : `${u.origin}/<path>`;
    } catch (e) { return '<url>'; }
  });
  s = s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>');
  // Any "Users" or "home" folder, whatever the separator: C:\Users\x, the
  // JSON-escaped C:\\Users\\x a logged object turns into, C:/Users/x, a UNC
  // \\server\Users\x, and /Users/x or /home/x.
  s = s.replace(/(\b(?:Users|home)(?:\\\\|\\|\/))[^\\/\s"]+/gi, '$1<user>');
  return s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE)}…` : s;
}

function describe(detail) {
  if (detail == null) return undefined;
  if (detail instanceof Error) return `${detail.name}: ${detail.message}\n${String(detail.stack || '').split('\n').slice(1, 6).join('\n')}`;
  if (typeof detail === 'string') return detail;
  try { return JSON.stringify(detail); } catch (e) { return String(detail); }
}

function makeLogger({ dir, maxBytes = 1024 * 1024, keep = 3, echo = true }) {
  const file = path.join(dir, 'pixelpets.log');
  const rotated = (i) => path.join(dir, `pixelpets.${i}.log`);
  let queue = [];
  let timer = null;
  let dead = false;

  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { dead = true; }

  function rotateIfNeeded(incoming) {
    let size;
    try { size = fs.statSync(file).size; } catch (e) { return; }
    if (size + incoming <= maxBytes) return;
    fs.rmSync(rotated(keep), { force: true });
    for (let i = keep - 1; i >= 1; i -= 1) {
      try { fs.renameSync(rotated(i), rotated(i + 1)); } catch (e) { /* that slot was empty */ }
    }
    fs.renameSync(file, rotated(1));
  }

  // ONE write path. Lines are batched (the timer below), but each batch is written
  // synchronously: rotate if needed, then append. An async writer beside a sync
  // one (for quit and the report preview) interleaved mid-rotation, which put the
  // newest crash line into the backup file and out of the report's tail. A batch
  // is a few hundred bytes every few hundred ms, so blocking for it is cheap.
  function writeQueued() {
    clearTimeout(timer);
    timer = null;
    const batch = queue;
    queue = [];
    if (dead || !batch.length) return;
    const chunk = batch.join('');
    try {
      rotateIfNeeded(Buffer.byteLength(chunk));
      fs.appendFileSync(file, chunk, 'utf8');
    } catch (e) { dead = true; }
  }
  const flush = async () => writeQueued();
  const flushSync = () => writeQueued();

  function write(level, message, detail) {
    const line = { t: new Date().toISOString(), l: level, m: redact(message) };
    const d = describe(detail);
    if (d !== undefined) line.d = redact(d);
    if (echo) (level === 'error' ? console.error : console.log)(`[${level}] ${line.m}${line.d ? ` ${line.d}` : ''}`);
    if (dead) return;
    queue.push(`${JSON.stringify(line)}\n`);
    if (!timer) timer = setTimeout(writeQueued, FLUSH_MS);
  }

  function tail(n) {
    if (dead) return [];
    const read = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); } catch (e) { return []; } };
    const current = read(file);
    const lines = current.length >= n ? current : read(rotated(1)).concat(current);
    return lines.slice(-n);
  }

  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
    flush, flushSync, tail, file,
  };
}

module.exports = { makeLogger, redact };
