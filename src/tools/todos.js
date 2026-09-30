// Today's to-dos. Five items at most: this is a short list for today, not a
// project tracker. State is { day, items: [{ id, text, done }], nudged } and
// every function returns a new state, so main can swap it into the config and
// persist it through the usual path.

const MAX_ITEMS = 5;
const MAX_TEXT = 80;
const DAY = /^\d{4}-\d{1,2}-\d{1,2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Same "YYYY-M-D" shape the reminder scheduler uses for lastFired.
const todayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

let seq = 0;
const makeId = () => { seq += 1; return `t${(Date.now() % 1e8).toString(36)}${seq.toString(36)}`.slice(0, 17); };

function add(state, text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!t) return { ok: false, reason: 'empty', state };
  if (state.items.length >= MAX_ITEMS) return { ok: false, reason: 'full', state };
  return { ok: true, state: { ...state, items: [...state.items, { id: makeId(), text: t, done: false }] } };
}

function toggle(state, id) {
  if (!state.items.some((t) => t.id === id)) return state;
  return { ...state, items: state.items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) };
}

function remove(state, id) {
  return { ...state, items: state.items.filter((t) => t.id !== id) };
}

const byIndex = (state, n) => (Number.isInteger(n) && n >= 1 && state.items[n - 1]) || null;

function counts(state) {
  const done = state.items.filter((t) => t.done).length;
  return { total: state.items.length, done, left: state.items.length - done };
}

// On a new day, finished items are cleared and unfinished ones carry over.
function rollover(state, key) {
  if (state.day === key) return state;
  return { day: key, items: state.items.filter((t) => !t.done), nudged: state.nudged };
}

// Should the pet remind you about unfinished to-dos right now? `nudgeAt` is an
// "HH:MM" string, or '' when the user turned the nudge off. `state.nudged` holds
// the day key of the last nudge.
function needsMiddayNudge(state, now, nudgeAt) {
  if (!HHMM.test(String(nudgeAt || ''))) return false;             // '' = the nudge is off
  if (state.nudged === todayKey(now)) return false;                 // once a day
  if (!state.items.some((t) => !t.done)) return false;              // nothing left to nudge about
  const [h, m] = nudgeAt.split(':').map(Number);
  // At or after the nudge time, so a laptop opened at 4pm still hears about the
  // list once, the same catch-up the reminder scheduler does after a sleep.
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

function normalizeTodos(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const seen = new Set();
  const items = (Array.isArray(r.items) ? r.items : []).reduce((out, it) => {
    if (out.length >= MAX_ITEMS || !it || typeof it !== 'object') return out;
    const text = String(it.text == null ? '' : it.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text) return out;
    let id = /^t[a-z0-9]{1,16}$/.test(String(it.id || '')) ? String(it.id) : '';
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);
    out.push({ id, text, done: !!it.done });
    return out;
  }, []);
  return {
    day: DAY.test(String(r.day || '')) ? String(r.day) : '',
    items,
    nudged: DAY.test(String(r.nudged || '')) ? String(r.nudged) : '',
  };
}

module.exports = { todayKey, add, toggle, remove, byIndex, counts, rollover, needsMiddayNudge, normalizeTodos, MAX_ITEMS, HHMM };
