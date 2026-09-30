// Quick Tools: the launcher (Ctrl/Cmd+Shift+Space, or right-click the pet) and
// the small everyday tools behind it. This registry is the only part main.js
// talks to: init / onConfig / trayItems / stop / ownsSender, plus two channels it
// registers through main's trusted-sender wrappers.
//
// Launcher IPC is locked to the launcher window ALONE (launcherOnly below), and
// main.js refuses the launcher on every other channel, so the one window that
// takes free typing cannot reach settings:save, email or calendar handlers.
const { ipcMain, clipboard, powerMonitor, dialog, app } = require('electron');
const path = require('path');

const commands = require('./commands');
const timersLib = require('./timers');
const todosLib = require('./todos');
const clipLib = require('./clipboard');
const { batteryEdge } = require('./battery');
const { eyeRestDue } = require('./eyerest');
const { validateTarget } = require('./shortcuts');
const system = require('./system');
const hotkey = require('./hotkey');
const { runAction } = require('./actions');
const { makeLauncher } = require('./launcher-window');
const { wireMacEditKeys } = require('../mac-edit-keys');

const TICK_MS = 30000;
const CLIP_POLL_MS = 1000;
const IDLE_AWAY_S = 120;           // this long without input counts as "away" for eye rest
const MAX_TIMER_WAIT = 2 ** 31 - 1;

let d = null;                      // deps handed over by main.js
let launcher = null;
let tickTimer = null, timerTimer = null, clipTimer = null;
let timers = [];                   // running quick timers (not persisted: they end with the app)
let clips = [];                    // clipboard history (memory only)
let lastClip = null;               // last clipboard text seen, so the poller only reacts to changes
let cache = { q: null, list: [] }; // the list the launcher is showing, so a run is an index into OUR data
let batteryArmed = true;
let lastBatteryAt = 0;
let eyeLastAt = Date.now();
let lastHotkey = null;
let hotkeyWarned = false;

const cfg = () => d.getCfg();
const notesFile = () => path.join(app.getPath('userData'), 'notes.md');

// Launcher feedback: a short bubble that stays out of the tray history, the OS
// toast, and Focus Guard's hold queue (you just asked for it, so it is not news).
function say(text, opts = {}) {
  d.notify(text, { source: 'tools', recap: true, os: false, sound: false, dedupeMs: 0, ttl: 3500, ...opts });
}

function persistTools(patch) { const c = cfg(); d.persist({ ...c, tools: { ...c.tools, ...patch } }); }
function persistTodos(todos) { d.persist({ ...cfg(), todos }); }

// Today's list, rolled over to today first. A new day clears finished items.
function today() {
  const c = cfg();
  const next = todosLib.rollover(c.todos, todosLib.todayKey(new Date()));
  if (next !== c.todos) persistTodos(next);
  return next;
}

function ctx() {
  const c = cfg();
  return {
    platform: process.platform, search: c.tools.search, shortcuts: c.tools.shortcuts,
    todos: today(), timers, clips, clipboardOn: c.tools.clipboard,
    keepAwake: system.isKeepAwake(), now: Date.now(),
  };
}

// The real OS icon for a pinned file, folder or app, as a data: URL. Cached per
// path; a lookup that fails is cached too, so a missing file is asked about once.
// The lookup races a short deadline: one pinned file on a slow or sleeping drive
// must not hold the whole list back. A late answer still lands in the cache for
// next time; this open just shows the line icon.
const fileIcons = new Map();
const ICON_DEADLINE_MS = 400;
async function fileIcon(target) {
  if (fileIcons.has(target)) return fileIcons.get(target);
  const lookup = app.getFileIcon(target, { size: 'normal' })
    .then((img) => (img && !img.isEmpty() ? img.toDataURL() : null))
    .catch(() => null)
    .then((data) => { fileIcons.set(target, data); return data; });
  const late = new Promise((resolve) => setTimeout(() => resolve(null), ICON_DEADLINE_MS));
  return Promise.race([lookup, late]);
}

// What the launcher window is allowed to see: text and pictures to draw, nothing
// to execute. Actions stay in `cache`.
async function display(list) {
  return Promise.all(list.map(async (r) => ({
    kind: r.kind, title: r.title, subtitle: r.subtitle || '', checked: !!r.checked, enabled: !!r.action,
    icon: r.icon, hint: r.hint || '', section: r.section || '', toggle: !!r.toggle,
    iconData: r.kind === 'shortcut' && ['app', 'folder', 'file'].includes(r.icon) ? await fileIcon(r.subtitle) : null,
  })));
}

function suggest(q) {
  const query = String(q == null ? '' : q).slice(0, 500);
  cache = { q: query, list: commands.suggest(query, ctx()) };
  return display(cache.list);
}

// What the launcher needs to dress itself: the pet's current coat and whether to
// hold still. Custom cat coats travel as their palette.
function launcherState() {
  const c = cfg();
  const dog = c.species === 'dog';
  const coat = dog ? c.dogPattern : c.pattern;
  const themes = d.getThemes ? d.getThemes() : [];
  const builtins = d.builtinCoatCount ? d.builtinCoatCount() : Infinity;
  return {
    pet: { species: dog ? 'dog' : 'cat', coat, theme: !dog && coat >= builtins ? themes[coat - builtins] || null : null },
    still: !!c.reducedMotion,
  };
}

// ---- timers -------------------------------------------------------------------
function setTimers(list) {
  timers = list;
  armTimers();
  d.rebuildTray();
}
function armTimers() {
  clearTimeout(timerTimer);
  timerTimer = null;
  if (!timers.length) return;
  const next = Math.min(...timers.map((t) => t.endsAt));
  timerTimer = setTimeout(fireTimers, Math.max(0, Math.min(MAX_TIMER_WAIT, next - Date.now())));
}
function fireTimers() {
  const { fired, remaining } = timersLib.due(timers, Date.now());
  for (const t of fired) {
    d.notify(`Time's up${t.label ? `: ${t.label}` : ''}!`, { source: 'timer', dedupeMs: 0, ttl: 10000, level: 'alert' });
    d.sendAction('companion');
  }
  setTimers(remaining);
}

// ---- clipboard history ---------------------------------------------------------
function pollClip() {
  let text;
  try { text = clipboard.readText(); } catch (e) { return; }
  if (text === lastClip) return;
  lastClip = text;
  // Settings is where the mail app password and the secret calendar URL get pasted.
  if (d.isSettingsFocused()) return;
  clips = clipLib.pushEntry(clips, text);
}
function syncClipboard(on) {
  if (on && !clipTimer) {
    try { lastClip = clipboard.readText(); } catch (e) { lastClip = null; }   // start from now, not from whatever was already copied
    clipTimer = setInterval(pollClip, CLIP_POLL_MS);
  } else if (!on && clipTimer) {
    clearInterval(clipTimer);
    clipTimer = null;
    clips = [];
    lastClip = null;
  }
}

// ---- tick: todo nudge + eye rest -------------------------------------------------
function tick() {
  const c = cfg();
  if (!c) return;
  const now = new Date();
  const todos = today();
  if (c.tools.todoNudge && todosLib.needsMiddayNudge(todos, now, c.tools.todoNudge)) {
    persistTodos({ ...todos, nudged: todosLib.todayKey(now) });
    const { left } = todosLib.counts(todos);
    d.notify(left === 1 ? 'One to-do still open today. Want to knock it out?' : '{count} to-dos still open today. Pick one?', { source: 'reminder', count: left });
  }
  if (c.tools.eyeRest) {
    let idle;
    try { idle = powerMonitor.getSystemIdleTime() >= IDLE_AWAY_S; } catch (e) { idle = false; }
    if (idle) eyeLastAt = now.getTime();   // you were away: the 20 minutes start again when you are back
    else if (eyeRestDue({ lastAt: eyeLastAt, now: now.getTime(), busy: d.isBusy() || d.inQuiet() })) {
      eyeLastAt = now.getTime();
      d.notify('Eye break: look at something 20 feet away for 20 seconds.', { source: 'eyerest', os: false, dedupeMs: 0 });
    }
  }
}

// ---- battery (reported by the overlay) ---------------------------------------------
function onBattery(reading) {
  const now = Date.now();
  if (now - lastBatteryAt < 2000) return;   // the overlay can fire level + charging changes together
  lastBatteryAt = now;
  const r = batteryEdge(batteryArmed, reading);
  batteryArmed = r.armed;
  if (r.alert && cfg().tools.batteryAlert) {
    d.notify(`Battery at ${Math.round(reading.level * 100)}%. Time to plug me in!`, { source: 'battery', level: 'warn', dedupeMs: 0 });
  }
}

// ---- hotkey + opening -----------------------------------------------------------
function open(anchor) {
  launcher.show(anchor, launcherState());
}
function toggle() {
  if (launcher.isVisible()) launcher.hide(); else open(null);
}
function applyHotkey(accel) {
  lastHotkey = accel;
  const ok = hotkey.apply(accel, toggle);
  if (!ok && !hotkeyWarned) {
    hotkeyWarned = true;
    d.notify(`I couldn't grab ${hotkey.label(accel)} (another app has it). Right-click me instead, or pick another key in Settings > Tools.`,
      { source: 'tips', os: false, ttl: 9000, dedupeMs: 0 });
  }
  d.rebuildTray();
}

// ---- IPC ------------------------------------------------------------------------
const launcherOnly = (fn) => (e, ...args) => (launcher && launcher.owns(e.sender) ? fn(...args) : undefined);

function registerIpc() {
  ipcMain.handle('launcher:suggest', launcherOnly((q) => suggest(q)));
  ipcMain.handle('launcher:run', launcherOnly(async (req) => {
    const q = req && typeof req.q === 'string' ? req.q.slice(0, 500) : null;
    const i = req && req.i;
    if (q === null || !Number.isInteger(i) || i < 0) return { close: false };
    if (cache.q !== q) suggest(q);
    const item = cache.list[i];
    if (!item || !item.action) return { close: false };
    if (!item.stay) launcher.hide();
    await runAction(api, item.action);
    return item.stay ? { close: false, list: await suggest(q) } : { close: true };
  }));
  ipcMain.on('launcher:resize', launcherOnly((h) => { if (Number.isFinite(h)) launcher.resize(h); }));
  ipcMain.on('launcher:hide', launcherOnly(() => launcher.hide()));

  // From the overlay (the pet) and Settings, via main's trusted-sender wrappers.
  d.onSecure('launcher:open', () => open(d.getPetAnchor()));
  d.onSecure('battery', (_e, b) => { if (b && typeof b === 'object') onBattery({ level: Number(b.level), charging: !!b.charging }); });
  d.onSecure('tools:openNotes', () => runAction(api, { type: 'openNotes' }));
  d.handleSecure('tools:pickShortcut', async (_e, kind) => {
    // Parented to Settings, which is always-on-top: an ownerless dialog can open
    // behind it and look like the button did nothing.
    const opts = {
      title: kind === 'folder' ? 'Pin a folder' : 'Pin a file or app',
      properties: [kind === 'folder' ? 'openDirectory' : 'openFile'],
    };
    const parent = d.getSettingsWin();
    const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return null;
    const v = validateTarget(r.filePaths[0]);
    return v && v.kind === 'path' ? v.value : null;
  });
}

const api = {
  cfg, say, notify: (...a) => d.notify(...a), persistTools, persistTodos, today,
  timers: () => timers, setTimers, clips: () => clips, rememberClip: (t) => { lastClip = t; },
  notesFile, sendAction: (id) => d.sendAction(id), triggerBreak: () => d.triggerBreak(),
  openSettings: () => d.openSettings(), rebuildTray: () => d.rebuildTray(),
  get log() { return d && d.log; },
};

// ---- lifecycle --------------------------------------------------------------------
function init(deps) {
  d = deps;
  launcher = makeLauncher({ hardenNav: d.hardenNav, wireMacEditKeys });
  registerIpc();
  try { powerMonitor.on('lock-screen', () => { clips = []; }); } catch (e) { /* not available */ }
  tickTimer = setInterval(tick, TICK_MS);
  onConfig(cfg());
}

function onConfig(c) {
  if (!d || !c) return;
  if (c.tools.hotkey !== lastHotkey) applyHotkey(c.tools.hotkey);
  syncClipboard(c.tools.clipboard);
}

function trayItems() {
  if (!d) return [];
  const c = cfg();
  const key = hotkey.registered();
  const items = [
    { label: 'Quick tools…', click: () => open(null), ...(key ? { accelerator: key, registerAccelerator: false } : {}) },
    { label: 'Keep screen awake', type: 'checkbox', checked: system.isKeepAwake(), click: () => runAction(api, { type: 'system', what: 'keepAwake' }) },
    { label: process.platform === 'darwin' ? 'Sleep display' : 'Lock screen', click: () => runAction(api, { type: 'system', what: 'lock' }) },
  ];
  if (timers.length) {
    items.push({ label: 'Timers', submenu: timers.map((t) => ({
      label: `Cancel ${t.label || 'timer'} (${timersLib.formatRemaining(t.endsAt - Date.now())} left)`,
      click: () => runAction(api, { type: 'timerCancel', id: t.id }),
    })) });
  }
  items.push(
    { label: 'Clipboard history', type: 'checkbox', checked: !!c.tools.clipboard, click: () => persistTools({ clipboard: !c.tools.clipboard }) },
    { label: 'Eye-rest nudges', type: 'checkbox', checked: !!c.tools.eyeRest, click: () => { eyeLastAt = Date.now(); persistTools({ eyeRest: !c.tools.eyeRest }); } },
  );
  return items;
}

function ownsSender(wc) {
  return !!(launcher && launcher.owns(wc));
}

function stop() {
  clearInterval(tickTimer);
  clearTimeout(timerTimer);
  syncClipboard(false);
  hotkey.stop();
  try { system.setKeepAwake(false); } catch (e) { /* ignore */ }
  if (launcher) launcher.destroy();
}

module.exports = { init, onConfig, trayItems, ownsSender, stop };
