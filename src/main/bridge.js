// The file bridge: how other programs talk to the pet without a socket.
//
// Two files in the OS temp folder. A coding agent's hook writes one word to the
// agent file ('thinking', 'editing', 'done' ...) and the pet reacts. Any tool can
// append JSON lines to the notify file (scripts/notify.js) and the pet shows a
// bubble and a toast. Both files are written by code we do not control, so
// everything read from them is treated as untrusted.
const fs = require('fs');
const os = require('os');
const path = require('path');

// The two bridge filenames keep the old pixelcat name on purpose. They are a
// published contract, not branding: users have already pasted these paths into
// agent hooks and CI scripts, and `scripts/install-hook.js` printed them into
// config files we cannot reach in to edit. Renaming either one would break every
// installation that exists, silently, because the writer would still succeed
// against a file nobody reads. Each name is spelled out again in the writer
// (agent-hook.js, notify.js); tests/bridge-paths.test.js fails if the two sides
// ever drift apart.
//
// Agent status file: hooks write 'thinking' | 'done' here and the pet reacts.
// See README "AI agent reactions".
const AGENT_FILE = path.join(os.tmpdir(), 'pixelcat-agent.state');
// Generic message bridge: any external tool appends JSON lines here (see
// scripts/notify.js) and the pet shows a bubble + toast. README "Notify the cat".
const NOTIFY_FILE = path.join(os.tmpdir(), 'pixelcat-notify.jsonl');

const LEVELS = ['info', 'success', 'warn', 'alert'];
const MAX_PARTIAL_LINE = 65536;   // a writer that never sends a newline cannot grow memory without bound
const SEEN_MAX = 500, SEEN_KEEP = 250;
const POLL_MS = 500;

/**
 * Turn one parsed JSON line into notify() arguments, or null to drop it.
 * Every field is clamped before it reaches a Notification or the overlay.
 */
function sanitizeRecord(o) {
  if (!o || typeof o !== 'object' || !o.message) return null;
  const id = String(o.id || (o.ts || '') + ':' + o.message);
  return {
    id,
    message: String(o.message).slice(0, 300),
    opts: {
      source: 'bridge',
      dedupeKey: 'bridge:' + id,
      title: String(o.title || 'pixelpets').slice(0, 80),
      level: LEVELS.includes(o.level) ? o.level : 'info',
      ttl: Math.max(500, Math.min(30000, Math.round(Number(o.ttl)) || 5000)),
      sound: o.sound !== false,
    },
  };
}

/**
 * Splits appended text into whole JSON lines, keeps a trailing partial line for
 * the next read, and drops records it has already delivered. Pure.
 */
function makeLineReader() {
  let tail = '';
  const seen = new Set();
  return {
    reset() { tail = ''; },
    feed(chunk) {
      tail += chunk;
      const lines = tail.split('\n');
      tail = lines.pop();
      if (tail.length > MAX_PARTIAL_LINE) tail = '';
      const out = [];
      for (const line of lines) {
        const t = line.trim(); if (!t) continue;
        let o; try { o = JSON.parse(t); } catch (e) { continue; }
        const rec = sanitizeRecord(o);
        if (!rec || seen.has(rec.id)) continue;
        seen.add(rec.id);
        if (seen.size > SEEN_MAX) { for (const k of seen) { seen.delete(k); if (seen.size <= SEEN_KEEP) break; } }
        out.push(rec);
      }
      return out;
    },
  };
}

/**
 * Watch both files and forward what changes.
 * @param {object} deps
 * @param {() => boolean} deps.isAlive      false while there is no overlay to tell
 * @param {(state: string) => void} deps.onAgent
 * @param {(message: string, opts: object) => void} deps.onMessage
 * @returns {{ stop(): void }}
 */
function watchBridge({ isAlive, onAgent, onMessage, agentFile = AGENT_FILE, notifyFile = NOTIFY_FILE }) {
  let lastAgent = '';
  const pushAgent = () => {
    if (!isAlive()) return;
    let s;
    try { s = (fs.readFileSync(agentFile, 'utf8').trim() || 'idle'); } catch (e) { s = 'idle'; }
    if (s !== lastAgent) { lastAgent = s; onAgent(s); }
  };

  // Baseline the offset to the current size so a backlog from before launch is
  // not replayed; then forward only freshly appended lines.
  const reader = makeLineReader();
  let offset = 0;
  try { offset = fs.statSync(notifyFile).size; } catch (e) { offset = 0; }
  const pushNotify = () => {
    if (!isAlive()) return;
    let size;
    try { size = fs.statSync(notifyFile).size; } catch (e) { return; }
    if (size < offset) { offset = 0; reader.reset(); }   // truncated/rotated
    if (size === offset) return;
    let chunk;
    try {
      const fd = fs.openSync(notifyFile, 'r');
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch (e) { return; }
    offset = size;
    for (const rec of reader.feed(chunk)) onMessage(rec.message, rec.opts);
  };

  try { lastAgent = fs.readFileSync(agentFile, 'utf8').trim(); } catch (e) { /* none yet */ }
  // Event-driven via fs.watch on the folder (the filename filter skips unrelated
  // temp churn); a slow poll if watching the folder is not available.
  let watcher = null, timer = null;
  try {
    watcher = fs.watch(path.dirname(agentFile), (_ev, fname) => {
      if (!fname || fname === path.basename(agentFile)) pushAgent();
      if (!fname || fname === path.basename(notifyFile)) pushNotify();
    });
  } catch (e) {
    timer = setInterval(() => { pushAgent(); pushNotify(); }, POLL_MS);
  }

  return {
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (watcher) { try { watcher.close(); } catch (e) { /* ignore */ } watcher = null; }
    },
  };
}

module.exports = { AGENT_FILE, NOTIFY_FILE, sanitizeRecord, makeLineReader, watchBridge };
