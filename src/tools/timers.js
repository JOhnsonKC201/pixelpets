// Quick timers for the launcher: "10m tea", "timer 1h30m laundry". Pure data and
// parsing only. main owns the clock and calls due() on its tick, so nothing here
// schedules anything, and a running timer is just { id, endsAt, label }.

const S = 1000;
const UNIT_MS = { s: S, m: 60 * S, h: 3600 * S };
const MIN_MS = S;
const MAX_MS = 24 * 3600 * S;
const MAX_TIMERS = 5;
const MAX_LABEL = 40;

// One "<number><unit>" part. Units are normalised to s / m / h.
const PART = /(\d+(?:\.\d+)?|\.\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)(?![a-z])/iy;
const unitKey = (u) => u[0].toLowerCase();

// Reads a duration that fills the whole string, or returns null.
function parseDuration(input) {
  const s = String(input == null ? '' : input).trim().toLowerCase();
  if (!s) return null;
  let pos = 0;
  let total = 0;
  const seen = new Set();
  while (pos < s.length) {
    while (s[pos] === ' ') pos += 1;
    if (pos >= s.length) break;
    PART.lastIndex = pos;
    const m = PART.exec(s);
    if (!m) return null;
    const key = unitKey(m[2]);
    if (seen.has(key)) return null;   // "1h1h" is a typo, not two hours
    seen.add(key);
    total += Number(m[1]) * UNIT_MS[key];
    pos = PART.lastIndex;
  }
  const ms = Math.round(total);
  return ms >= MIN_MS && ms <= MAX_MS ? ms : null;
}

// "10m tea" / "timer 1h30m laundry" -> { ms, label }. The duration has to come
// first: the longest leading run of words that parses as one wins, so
// "1h 30m tea" keeps both parts and "tea 10m" is not a timer.
function parseTimerQuery(input) {
  const words = String(input == null ? '' : input).trim().replace(/^timer\s+/i, '').split(/\s+/).filter(Boolean);
  for (let n = Math.min(words.length, 4); n >= 1; n -= 1) {
    const ms = parseDuration(words.slice(0, n).join(' '));
    if (ms != null) return { ms, label: words.slice(n).join(' ').slice(0, MAX_LABEL).trim() };
  }
  return null;
}

let seq = 0;
const nextId = () => { seq += 1; return `tm${seq.toString(36)}`; };

// Returns { ok, list } without touching the input list.
function add(list, { now, ms, label }) {
  if (list.length >= MAX_TIMERS) return { ok: false, list };
  const timer = Object.freeze({ id: nextId(), endsAt: now + ms, label: String(label || '').slice(0, MAX_LABEL) });
  return { ok: true, list: [...list, timer] };
}

function cancel(list, id) {
  return list.filter((t) => t.id !== id);
}

function due(list, now) {
  return {
    fired: list.filter((t) => t.endsAt <= now),
    remaining: list.filter((t) => t.endsAt > now),
  };
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.round(ms / S));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (m) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

module.exports = { parseDuration, parseTimerQuery, add, cancel, due, formatRemaining, MAX_TIMERS };
