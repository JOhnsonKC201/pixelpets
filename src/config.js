// Settings store (main process). Owns settings.json in the per-user app data dir
// and is the single source of truth for name / coat / break-timer / sound / hunt /
// reminders. Reads are tolerant (missing or corrupt file -> DEFAULTS); writes are
// atomic (tmp + rename) so a crash mid-write can't leave a half-written file.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const { PATTERN_NAMES } = require('./patterns');
const { isSpecies, coatsFor, defaultCoatIndex } = require('./pets');
const { MAX_THEMES } = require('./themes');
const { normalizeShortcuts } = require('./tools/shortcuts');
const { normalizeTodos } = require('./tools/todos');
// A cat's coat index addresses ONE run of numbers: the built-in coats first, then
// the user's custom coats, which is the order both pickers build (tray submenu in
// main.js, dropdown in settings-renderer.js). Clamping at the last built-in coat
// meant every custom coat a user picked - from either surface - was silently
// rewritten to the last built-in one, so designing a coat, importing a coat pack
// and picking either appeared to do nothing at all. themes.clean() caps the stored
// list at MAX_THEMES, so the ceiling stays bounded against a junk config file.
// (Dogs have no custom coats: dogPattern still clamps to the built-in breeds.)
const MAX_PATTERN = PATTERN_NAMES.length - 1 + MAX_THEMES;
// Mackerel Tabby is the out-of-box coat. It ships painted climb art, so a brand
// new user gets the rope climb on their first scroll rather than the leaf swipe.
const DEFAULT_PATTERN = Math.max(0, PATTERN_NAMES.indexOf('Mackerel Tabby'));

const DEFAULTS = {
  name: '',
  species: 'cat',      // 'cat' | 'dog' - which pet lives on the desktop
  pattern: DEFAULT_PATTERN,
  dogPattern: defaultCoatIndex('dog'),  // the dog's breed, kept separately so switching
                                        // species back and forth never loses either choice
  breakMinutes: 0,     // 0 = break timer off
  soundOn: true,
  huntOn: true,        // Comnyang hunts the cursor by default; user-toggleable
  followCursor: true,  // eyes track the cursor; turn off to make the cat ignore it
  moodOn: true,        // energy/mood model (calm/playful/zoomies + startle)
  startleOn: true,     // flinch/bolt when the cursor lunges at it; off = ignore sudden cursor moves
  playArea: null,      // { x,y,w,h } fractions of the screen the cat stays in; null = whole screen
  onTop: true,         // keep the cat above all other windows
  roamOn: true,        // the cat autonomously wanders its play area
  restSide: 'right',   // which bottom corner is home (spawn + where roaming drifts back to): 'left' | 'right'
  floorLock: true,     // pin the cat to the taskbar/Dock line: it strolls left/right but never wanders up the screen
  butterflyOn: true,   // a butterfly occasionally flits in and the cat plays with it; off = no visits
  workMode: false,     // "I'm working": park in the rest corner on the taskbar + hide the butterfly, roaming, cursor-chase, startle-bolt, and leaf-play
  volume: 100,         // master sound volume 0-100
  reducedMotion: false,// calm mode: no roaming/bouncing/screen-glow
  lowPower: false,     // fewer idle frames + slower cursor polling to spare CPU/GPU
  lowPowerOnBattery: true, // auto-enter low power while running on battery
  pinnedNote: '',      // fixed message pinned above the cat's head ('' = off)
  notifyOn: true,      // also pop a Windows toast for reminders/messages
  tipsSeen: false,     // the one-time first-run hints have been shown (see showFirstRunTips)
  quietHours: { on: false, start: '22:00', end: '08:00' }, // daily do-not-disturb: no sound or toast inside this window
  // Focus Guard: hush automatically while you are actually busy, and deliver what
  // was held back as one summary afterwards (see focus.js).
  focus: { on: true, meetings: true, digest: true },
  pomodoro: { on: false, focusMin: 25, breakMin: 5 },  // focus/break loops + floating pixel timer
  lobbyJam: { on: false, mood: 'cozy' },  // synthesized lo-fi "study music" the cat plays (cozy/dreamy/upbeat/focus/rain)
  reminders: [],       // [{ id, hhmm: 'HH:MM', message, recur, days, lastFired }]
  email: { on: false, host: '', port: 993, user: '', secure: true, intervalMin: 5, vip: [] }, // IMAP unread alerts (app-password stored separately, encrypted); vip senders break through Focus Guard
  calendar: { on: false, icsUrl: '', leadMin: 10 }, // nudge before events from a secret .ics URL
  // Quick Tools launcher (src/tools/). Clipboard history and eye-rest are opt-in;
  // nothing the clipboard holds is ever written here.
  tools: {
    hotkey: 'CommandOrControl+Shift+Space',  // one of HOTKEYS, or 'off'
    rightClick: true,     // right-click the pet opens the launcher (Shift+right-click still cycles the coat)
    search: 'google',     // 'google' | 'duckduckgo' | 'bing'
    clipboard: false,     // in-memory clipboard history
    eyeRest: false,       // 20-20-20 nudge every 20 minutes
    batteryAlert: true,   // speak up once at 20% while unplugged
    todoNudge: '12:30',   // 'HH:MM' for the unfinished to-dos nudge, '' = off
    shortcuts: [],        // [{ id, label, target }] validated by tools/shortcuts.js
  },
  todos: { day: '', items: [], nudged: '' },  // today's list, see tools/todos.js
};

// The launcher hotkeys offered in Settings. A fixed list rather than free text, so
// a typo can never register something that swallows a key the user needs.
const HOTKEYS = ['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space', 'CommandOrControl+Shift+K', 'Alt+Space', 'off'];
const SEARCH_ENGINES = ['google', 'duckduckgo', 'bing'];

function filePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

let idSeq = 0;
function makeId() { idSeq += 1; return `r${idSeq.toString(36)}${(idSeq * 2654435761 % 0xffffff).toString(36)}`; }

function normArea(a) {
  if (!a || typeof a !== "object") return null;
  const f = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : null);
  const x = f(a.x), y = f(a.y), w = f(a.w), h = f(a.h);
  if (x == null || y == null || w == null || h == null || w < 0.05 || h < 0.05) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}
// Coerce arbitrary input into the strict schema. Bad reminders are dropped.
function normalize(cfg) {
  const c = (cfg && typeof cfg === 'object') ? cfg : {};
  const seen = new Set();
  const reminders = Array.isArray(c.reminders) ? c.reminders : [];
  return {
    name: String(c.name == null ? '' : c.name).trim().slice(0, 24),
    species: isSpecies(c.species) ? c.species : 'cat',
    pattern: clampInt(c.pattern, 0, MAX_PATTERN, DEFAULT_PATTERN),
    dogPattern: clampInt(c.dogPattern, 0, coatsFor('dog').length - 1, defaultCoatIndex('dog')),
    breakMinutes: clampInt(c.breakMinutes, 0, 240, 0),
    soundOn: c.soundOn === undefined ? true : !!c.soundOn,
    huntOn: c.huntOn === undefined ? true : !!c.huntOn,
    followCursor: c.followCursor === undefined ? true : !!c.followCursor,
    moodOn: c.moodOn === undefined ? true : !!c.moodOn,
    startleOn: c.startleOn === undefined ? true : !!c.startleOn,
    playArea: normArea(c.playArea),
    onTop: c.onTop === undefined ? true : !!c.onTop,
    roamOn: c.roamOn === undefined ? true : !!c.roamOn,
    restSide: c.restSide === 'left' ? 'left' : 'right',
    floorLock: c.floorLock === undefined ? true : !!c.floorLock,
    butterflyOn: c.butterflyOn === undefined ? true : !!c.butterflyOn,
    tipsSeen: !!c.tipsSeen,   // absent (an existing install, or a fresh one) reads as false
    workMode: !!c.workMode,
    volume: clampInt(c.volume, 0, 100, 100),
    reducedMotion: !!c.reducedMotion,
    lowPower: !!c.lowPower,
    lowPowerOnBattery: c.lowPowerOnBattery === undefined ? true : !!c.lowPowerOnBattery,
    pinnedNote: String(c.pinnedNote == null ? '' : c.pinnedNote).trim().slice(0, 80),
    notifyOn: c.notifyOn === undefined ? true : !!c.notifyOn,
    quietHours: (() => {
      const q = (c.quietHours && typeof c.quietHours === 'object') ? c.quietHours : {};
      const start = HHMM.test(String(q.start || '')) ? String(q.start) : '22:00';
      const end = HHMM.test(String(q.end || '')) ? String(q.end) : '08:00';
      return { on: !!q.on, start, end };
    })(),
    focus: (() => {
      const f = (c.focus && typeof c.focus === 'object') ? c.focus : {};
      // Default ON for all three: the guard is only ever *less* interrupting than
      // the old behaviour, and an absent key (every existing install) should get it.
      return { on: f.on === undefined ? true : !!f.on, meetings: f.meetings === undefined ? true : !!f.meetings, digest: f.digest === undefined ? true : !!f.digest };
    })(),
    pomodoro: (() => {
      const p = (c.pomodoro && typeof c.pomodoro === 'object') ? c.pomodoro : {};
      return { on: !!p.on, focusMin: clampInt(p.focusMin, 5, 120, 25), breakMin: clampInt(p.breakMin, 1, 60, 5) };
    })(),
    lobbyJam: (() => {
      const lj = (c.lobbyJam && typeof c.lobbyJam === 'object') ? c.lobbyJam : {};
      return { on: !!lj.on, mood: ['cozy', 'dreamy', 'upbeat', 'focus', 'rain', 'sleepy'].includes(lj.mood) ? lj.mood : 'cozy' };
    })(),
    email: (() => {
      const e = (c.email && typeof c.email === 'object') ? c.email : {};
      const port = clampInt(e.port, 1, 65535, 993);
      // Enforce implicit TLS except on the STARTTLS port (143). This blocks a
      // plaintext downgrade (secure:false on 993) from a malformed/forged config.
      const secure = port === 143 ? !!e.secure : true;
      return {
        on: !!e.on,
        host: String(e.host == null ? '' : e.host).trim().slice(0, 120),
        port,
        user: String(e.user == null ? '' : e.user).trim().slice(0, 160),
        secure,
        intervalMin: clampInt(e.intervalMin, 1, 60, 5),
        // Senders that interrupt you even while Focus Guard is holding mail back.
        // Matched case-insensitively against the From address, as a substring, so
        // "@acme.com" whitelists a whole company and "boss@acme.com" one person.
        // Bounded and de-duped: this list is written by hand and read on every poll.
        vip: Array.from(new Set(
          (Array.isArray(e.vip) ? e.vip : [])
            .map((v) => String(v == null ? '' : v).trim().toLowerCase().slice(0, 160))
            .filter(Boolean),
        )).slice(0, 25),
      };
    })(),
    calendar: (() => {
      const k = (c.calendar && typeof c.calendar === 'object') ? c.calendar : {};
      let url = String(k.icsUrl == null ? '' : k.icsUrl).trim().slice(0, 2000);
      if (/^webcal:\/\//i.test(url)) url = 'https://' + url.slice(9);
      if (url && !/^https?:\/\//i.test(url)) url = '';
      return { on: !!k.on, icsUrl: url, leadMin: clampInt(k.leadMin, 0, 1440, 10) };
    })(),
    tools: (() => {
      const t = (c.tools && typeof c.tools === 'object') ? c.tools : {};
      const nudge = String(t.todoNudge == null ? '12:30' : t.todoNudge);
      return {
        hotkey: HOTKEYS.includes(t.hotkey) ? t.hotkey : HOTKEYS[0],
        rightClick: t.rightClick === undefined ? true : !!t.rightClick,
        search: SEARCH_ENGINES.includes(t.search) ? t.search : 'google',
        clipboard: !!t.clipboard,
        eyeRest: !!t.eyeRest,
        batteryAlert: t.batteryAlert === undefined ? true : !!t.batteryAlert,
        todoNudge: nudge === '' || HHMM.test(nudge) ? nudge : '12:30',
        shortcuts: normalizeShortcuts(t.shortcuts),
      };
    })(),
    todos: normalizeTodos(c.todos),
    reminders: reminders.reduce((out, r) => {
      if (!r || typeof r !== 'object') return out;
      const hhmm = String(r.hhmm || '');
      const message = String(r.message == null ? '' : r.message).trim().slice(0, 80);
      if (!HHMM.test(hhmm) || !message) return out;
      let id = String(r.id || '');
      if (!id || seen.has(id)) id = makeId();
      seen.add(id);
      const recur = ['once', 'daily', 'weekdays', 'weekly'].includes(r.recur) ? r.recur : 'daily';
      const days = Array.isArray(r.days)
        ? Array.from(new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b)
        : [];
      const lastFired = /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(r.lastFired || '')) ? String(r.lastFired) : '';
      out.push({ id, hhmm, message, recur, days: recur === 'weekly' ? days : [], lastFired: recur === 'once' ? lastFired : '' });
      return out;
    }, []),
  };
}

// Where a cat's coat index lands after the custom coat at `removedThemeIndex` (an
// index into the theme list, not the coat list) is deleted. Custom coats are
// addressed by POSITION, so removing one shifts every coat after it down a slot:
// without this, deleting the first of two custom coats leaves the config pointing
// at a coat that is now somebody else, and deleting the coat the pet is WEARING
// leaves it pointing past the end of the list - which the settings dropdown shows
// as a blank selection. Built-in coats are never affected.
function coatAfterThemeRemoval(pattern, removedThemeIndex, builtinCount = PATTERN_NAMES.length) {
  const at = builtinCount + removedThemeIndex;
  if (!Number.isInteger(pattern) || !Number.isInteger(removedThemeIndex) || removedThemeIndex < 0 || pattern < at) return pattern;
  return pattern === at ? DEFAULT_PATTERN : pattern - 1;
}

// Fill any missing top-level key from DEFAULTS (forward-compatible loads).
function migrate(cfg) {
  return { ...DEFAULTS, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
}

function load() {
  let raw;
  try {
    raw = fs.readFileSync(filePath(), 'utf8').replace(/^﻿/, ''); // tolerate editor BOM
  } catch (e) {
    // Missing file -> first run, write defaults. Any OTHER read error (EBUSY/EACCES
    // from an AV scanner or editor lock) is transient: return defaults but DON'T
    // overwrite the on-disk file, so real settings are never destroyed.
    const fresh = normalize(DEFAULTS);
    if (e && e.code === 'ENOENT') { try { save(fresh); } catch (e2) { /* best effort */ } }
    return fresh;
  }
  try {
    return normalize(migrate(JSON.parse(raw)));
  } catch (e) {
    // The file exists but is corrupt JSON -> safe to replace with defaults.
    const fresh = normalize(DEFAULTS);
    try { save(fresh); } catch (e2) { /* best effort */ }
    return fresh;
  }
}

function save(cfg) {
  const clean = normalize(cfg);
  const fp = filePath();
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2));
    fs.renameSync(tmp, fp);
  } catch (e) { /* keep the in-memory value even if disk write fails */ }
  return clean;
}

module.exports = { DEFAULTS, HOTKEYS, SEARCH_ENGINES, load, save, normalize, migrate, makeId, coatAfterThemeRemoval, filePath };
