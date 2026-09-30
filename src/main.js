const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, dialog, Notification, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('./config');
const datadir = require('./datadir');
const { fillPlaceholders } = require('./template');
const { inQuietHours } = require('./quiet-hours');
const focus = require('./focus');
const mail = require('./mail');
const cal = require('./cal');
const tools = require('./tools');
const { makeLogger } = require('./logger');
const { makeReportWindow } = require('./report-window');
const { enabledFeatures } = require('./report');
const { wireMacEditKeys } = require('./mac-edit-keys');
const themes = require('./themes');
const { PATTERN_NAMES } = require('./patterns');
const { SPECIES, SPECIES_IDS, speciesOf, coatsFor, defaultCoatIndex } = require('./pets');
const { parseCli, SHOT_CANVAS } = require('./main/cli');
const { hardenNav } = require('./main/harden-nav');
const { createReelWindow } = require('./main/reel-window');
const { buildTrayTemplate } = require('./main/tray-menu');
const { makeNotifyHistory, relTime } = require('./main/notify-history');
const { watchBridge } = require('./main/bridge');

// Let the overlay auto-resume the Lobby Jam music at launch without a click - Chromium
// otherwise blocks autoplay until a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win;                                               // the overlay (the cat)
let settingsWin = null;                                // settings window (when open)
let tray = null;
let cfg = null;                                        // current settings (main = source of truth)
let themesCache = [];                                  // user-defined custom coats (themes.json)
// Renderer crash-loop guard. Module scope so the count survives the reload it
// triggers; see the render-process-gone handler in createWindow().
let renderCrashes = 0, lastRenderCrashAt = 0;
const RELOAD_MAX = 5;                                  // consecutive reloads before giving up
const RELOAD_RESET_MS = 60000;                         // uptime that counts as "recovered"
let cursorTimer;
let tipTimers = [];                                    // one-time first-run hint timers
let topTimer;                                          // re-asserts always-on-top
let settingArea = false, areaTimer = null;             // "set play area (drag)" mode
let bridge = null;                                     // the agent/notify file watcher (src/main/bridge.js)
let scheduleTimer;                                     // break-timer + reminder clock
let breakAnchor = 0;                                   // ms timestamp the break countdown started
let lastMinuteKey = '';                                // 'YYYY-M-D-HH:MM' for reminder dedupe
let firedThisMinute = new Set();                       // reminder ids already fired this minute
let lastReminder = null;                                // last reminder fired (tray snooze)
let hookStarted = false;
let hookRetry = null;    // macOS: re-arm the input hook once Accessibility is granted (see startInputHook)
let ignoring = true;                                   // current click-through state
let onBattery = false;                                 // running unplugged (powerMonitor)
let lowPowerBroadcast = null;                          // last effective low-power state sent to the overlay
let origin = { x: 0, y: 0 };                           // overlay top-left in screen px
let hot = { x: 0, y: 0, w: 0, h: 0, dragging: false }; // cat's interactive region
let reportWin = null;                                  // "Report a problem" window (report-window.js)

// Local rotating log (logger.js). Until the app is ready and knows where its data
// folder is, errors still reach the console instead of disappearing.
let log = {
  info: () => {}, warn: (...a) => console.warn(...a), error: (...a) => console.error(...a),
  flush: async () => {}, flushSync: () => {}, tail: () => [],
};
const logDir = () => path.join(app.getPath('userData'), 'logs');

// Anything that escapes a handler is logged instead of taking the pet down, and
// the pet says so once, pointing at the one place a person can do something.
let tripped = false;
function trippedOnce() {
  if (tripped || SHOT || SHEET) return;
  tripped = true;
  try {
    notify("I tripped over something, but I'm okay. If it keeps happening, tray > Report a problem.",
      { source: 'system', os: false, dedupeMs: 0, ttl: 9000 });
  } catch (e) { /* the notifier itself may be what broke */ }
}

// Preview and capture flags (--shot, --sheet, --reel and their knobs). A normal
// launch passes none of them; see src/main/cli.js.
const cli = parseCli(process.argv);
const { stateArg, patternArg, dirArg, speciesArg, noteArg, SHOT, SHEET, REEL, shotAtMs } = cli;

// A reel run must not touch the pet the user is actually running. The overlay
// persists `pos` to localStorage (persistPos, the overlay), localStorage lives in
// userData, and a capture forces the pet to the preview position - so filming with
// the default userData quietly moves the real pet to the corner of the preview
// canvas. Give the capture its own throwaway profile. Must happen before ready.
if (REEL) { try { app.setPath('userData', path.join(os.tmpdir(), 'pixelpets-reel')); } catch (e) { /* fall through to default */ } }

// Single-instance: the pet is a singleton (login-launch + a manual start would
// otherwise spawn two overlays, two keyboard hooks, two cursor loops). Preview
// (--shot) runs are allowed to coexist with a running pet.
const isSecondary = !SHOT && !SHEET && !REEL && !app.requestSingleInstanceLock();
if (isSecondary) app.quit();

// macOS: a desktop pet belongs in the menu bar, not the Dock or the app switcher.
if (process.platform === 'darwin' && app.dock && !SHOT && !SHEET && !REEL) app.dock.hide();

// Launch-at-login (unpackaged): run `electron.exe <appDir>` on login.
const APP_DIR = path.resolve(__dirname, '..');
function setAutostart(enabled) {
  // `path` and `args` are documented win32-only and are silently dropped on macOS.
  // Worse, from source process.execPath is Electron's own binary, so macOS would
  // register Electron.app and the user would get a bare Electron window at login
  // instead of a pet. Only register a packaged bundle there.
  if (process.platform === 'darwin') {
    if (!app.isPackaged) return;
    try { app.setLoginItemSettings({ openAtLogin: enabled }); } catch (e) { /* not fatal */ }
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: enabled ? [APP_DIR] : [] });
}

// Whether we have ever enabled launch-at-login on this machine. Only consulted on
// macOS, where the login item is user-visible and user-togglable: after the first
// run the user owns that switch, not us. A missing/unreadable marker reads as "not
// yet asked", so the worst case is asking once more, never overriding repeatedly.
function autostartMarkerPath() { return path.join(app.getPath('userData'), '.autostart-set'); }
function autostartAsked() { try { return fs.existsSync(autostartMarkerPath()); } catch (e) { return false; } }
function markAutostartAsked() {
  try {
    const fp = autostartMarkerPath();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, new Date().toISOString());
  } catch (e) { /* best effort: at worst we offer again next launch */ }
}

// --- low-power state -------------------------------------------------------
// Effective low power = user toggled it on, OR (auto-on-battery is on AND we're
// unplugged). The overlay and the cursor poll both react to this derived flag.
function effectiveLowPower() {
  return !!(cfg && (cfg.lowPower || (cfg.lowPowerOnBattery && onBattery)));
}
// Push the derived flag to the overlay only when it actually changes, and retune
// the cursor poll to match (slower while sparing power).
function broadcastPower() {
  const low = effectiveLowPower();
  if (low !== lowPowerBroadcast) {
    lowPowerBroadcast = low;
    if (win && !win.isDestroyed()) win.webContents.send('power', { lowPower: low });
    if (cursorTickRef) startCursorTimer(cursorTickRef);
  }
}
let cursorTickRef = null;
function startCursorTimer(tick) {
  cursorTickRef = tick;
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = setInterval(tick, effectiveLowPower() ? 50 : 33);
}



function createWindow() {
  const b = screen.getPrimaryDisplay().bounds; // laptop / primary display only (no extended screen)
  origin = { x: b.x, y: b.y };

  const opts = {
    transparent: true, frame: false, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),   // window/alt-tab icon when run from source (dev)
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  };
  if (SHOT || SHEET) {
    // Small focusable window for previews (no overlay/click-through). The sheet
    // window stays hidden - it exports its canvas via IPC, not a screen capture.
    // The width MUST cover the preview canvas that the overlay's SHOT branch sizes
    // (SHOT_CANVAS, src/main/cli.js): it was 20px narrower for a long time, so a --shot capture
    // quietly cropped anything that reached the right-hand side of the canvas and
    // the loss looked like a rendering bug rather than a window that was too small.
    // tests/shot-window.test.js pins the two together.
    Object.assign(opts, { x: b.x + 80, y: b.y + 80, width: SHOT_CANVAS.w, height: SHOT_CANVAS.h + 40, focusable: true, show: !SHEET });
  } else {
    // Full-display, click-through overlay; non-focusable so it never steals keys.
    // fullscreenable:false matters on macOS: a fullscreenable window gets
    // NSWindowCollectionBehaviorFullScreenPrimary, which AppKit treats as mutually
    // exclusive with the FullScreenAuxiliary behaviour that setVisibleOnAllWorkspaces
    // asks for - and that conflict is the classic reason an always-on-top overlay
    // vanishes the moment another app goes fullscreen.
    Object.assign(opts, { x: b.x, y: b.y, width: b.width, height: b.height, focusable: false, enableLargerThanScreen: true, fullscreenable: false });
  }
  win = new BrowserWindow(opts);
  hardenNav(win);
  win.setAlwaysOnTop(true, 'screen-saver');
  // macOS: follow the user across Spaces and fullscreen apps (no-op elsewhere).
  if (process.platform === 'darwin' && !SHOT && !SHEET) {
    // skipTransformProcessType is not optional here. Without it every call flips the
    // process between UIElementApplication and ForegroundApplication, and Electron
    // documents that this "will hide the window and dock for a short time every time
    // it is called". app.dock.hide() above already made us a UIElement, so the
    // transform buys nothing and costs a visible flicker.
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); } catch (e) { /* ignore */ }
  }
  // Default: whole overlay passes clicks through; move events still forwarded so
  // the renderer can detect hover. Main re-derives this each cursor tick (below).
  if (!SHOT) win.setIgnoreMouseEvents(true, { forward: true });

  const params = [];
  if (stateArg) params.push(`state=${stateArg}`);
  if (patternArg) params.push(`pattern=${patternArg}`);
  if (dirArg) params.push(`dir=${dirArg}`);
  if (speciesArg) params.push(`species=${speciesArg}`);
  const { hasFlag } = cli;   // --treat and --treat=1 both count (see src/main/cli.js)
  if (hasFlag('bfly')) params.push('bfly=1');    // force the butterfly visitor (QA shots)
  if (hasFlag('treat')) params.push('treat=1');  // force a dropped treat (QA shots)
  if (hasFlag('ball')) params.push('ball=1');    // force a resting fetch ball (QA shots, dogs)
  if (hasFlag('joy')) params.push('joy=1');      // force the victory beat after a butterfly catch (QA shots)
  if (noteArg) params.push(`note=${encodeURIComponent(noteArg)}`);   // force a speech bubble (QA shots)
  if (SHOT) params.push('shot=1');
  if (SHEET) params.push('sheet=1');
  win.loadFile(path.join(__dirname, 'index.html'), { search: params.join('&') });

  // Log GPU/renderer crashes - and, for the live pet, auto-recover by reloading
  // so a transparent-overlay GPU crash never leaves a dead, invisible window.
  // Backed off and capped: a transparent always-on-top compositor meets every
  // consumer GPU driver in the wild, and a driver that crashes the renderer on
  // load would otherwise reload every 400ms forever - burning CPU, spamming the
  // log and flickering the overlay with no way for the user to see why. After
  // RELOAD_MAX consecutive crashes it stops and says so, rather than retrying
  // into the same wall in silence.
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('overlay renderer gone', details);
    if (SHOT || !win || win.isDestroyed() || details.reason === 'clean-exit') return;
    // A renderer that has stayed up a while is a fresh fault, not a crash loop.
    if (Date.now() - lastRenderCrashAt > RELOAD_RESET_MS) renderCrashes = 0;
    lastRenderCrashAt = Date.now();
    renderCrashes += 1;
    if (renderCrashes > RELOAD_MAX) {
      log.error(`overlay crashed ${renderCrashes} times in a row; giving up on reload`);
      notify('{name} kept crashing, so I stopped reloading. Restarting the app may help.',
        { dedupeKey: 'render-crash-loop', dedupeMs: 60000, source: 'system' });
      return;
    }
    const wait = Math.min(400 * 2 ** (renderCrashes - 1), 15000);   // 400ms, 800, 1.6s ... capped
    setTimeout(() => { if (win && !win.isDestroyed()) win.reload(); }, wait);
  });
  win.webContents.on('console-message', (_e, _l, message) => console.log('[r]', message));

  // Push current settings to the overlay as soon as (and every time) it loads,
  // so first paint already has the name / coat / sound+hunt flags.
  win.webContents.on('did-finish-load', () => { sendThemes(); if (!SHOT && !SHEET) { applyConfigToOverlay(); sendPomo(); sendGeom(); showFirstRunTips(); } });

  // System-wide keyboard hook so the cat reacts to typing in ANY app.
  // (Skipped for --shot previews - a screenshot has no need for a global hook,
  // which also avoids a macOS Accessibility prompt for the preview process.)
  if (!SHOT && !SHEET) startInputHook();

  if (SHOT) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(__dirname, '..', '_render.png'), img.toPNG());
        console.log('[captured _render.png]');
        app.quit();
      }, shotAtMs);
    });
    return;
  }

  if (SHEET) return;   // sheet mode: no cursor loop / hooks / scheduler

  // Cursor loop: feed local cursor to the renderer AND drive the click-through
  // toggle from here (main's own loop) so a renderer stall can never leave the
  // screen stuck capturing clicks - we default back to pass-through whenever the
  // cursor isn't over the cat (and isn't mid-drag).
  let lastCurX = null, lastCurY = null;
  const cursorTick = () => {
    if (!win || win.isDestroyed()) return;
    const pt = screen.getCursorScreenPoint();
    const lx = pt.x - origin.x, ly = pt.y - origin.y;
    // Only forward the cursor when it actually moved - a still cursor carries no
    // new info, so an idle desktop costs zero cursor IPC.
    if (lx !== lastCurX || ly !== lastCurY) {
      win.webContents.send('cursor', { x: lx, y: ly });
      lastCurX = lx; lastCurY = ly;
    }
    if (settingArea) return;   // stay interactive while the user drags the play area
    const over = hot.dragging ||
      (lx >= hot.x && lx <= hot.x + hot.w && ly >= hot.y && ly <= hot.y + hot.h);
    const wantIgnore = !over;
    if (wantIgnore !== ignoring) {
      ignoring = wantIgnore;
      win.setIgnoreMouseEvents(wantIgnore, { forward: true });
    }
  };
  // Adaptive poll: ~30 Hz normally, ~20 Hz in low power. The renderer eases the
  // cursor->eyes, so a coarser sample still tracks smoothly while sparing the CPU.
  startCursorTimer(cursorTick);

  // Other programs talk to the pet through two temp files (src/main/bridge.js).
  bridge = watchBridge({
    isAlive: () => !!(win && !win.isDestroyed()),
    onAgent: (state) => win.webContents.send('agent', state),
    onMessage: (message, opts) => notify(message, opts),
  });

  // Keep the overlay matched to the primary (laptop) display on resolution/DPI changes,
  // so the cat never ends up clipped or with a broken cursor→canvas mapping.
  const refit = () => {
    if (!win || win.isDestroyed()) return;
    const d = screen.getPrimaryDisplay().bounds;
    origin = { x: d.x, y: d.y };
    win.setBounds({ x: d.x, y: d.y, width: d.width, height: d.height });
    sendGeom();   // resolution/DPI change -> re-send the true floor inset so the cat re-pins
  };
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);

  // Keep the cat above EVERYTHING. alwaysOnTop at the highest level can still be
  // stolen by fullscreen apps / other topmost windows, so re-assert it on a timer
  // (and reclaim the very top with moveTop).
  const reassertTop = () => {
    if (!win || win.isDestroyed()) return;
    if (cfg && cfg.onTop === false) return;       // user turned "always on top" off
    try {
      // The off->on toggle and moveTop() are a WINDOWS re-raise trick. On macOS they
      // drop the window from NSScreenSaverWindowLevel to normal and back on every
      // tick - 1.4 times a second, forever - which is window-server thrash the user
      // sees as flicker and the battery sees as work.
      if (process.platform !== 'darwin') {
        win.setAlwaysOnTop(false);                // toggle off->on forces a real re-raise on Windows
        win.setAlwaysOnTop(true, 'screen-saver');
        win.moveTop();
      } else {
        win.setAlwaysOnTop(true, 'screen-saver');
      }
      // Collection behaviour is sticky, so this does not belong on the timer at all
      // on macOS; it is set once at window creation. Re-assert only off-timer events
      // (a display change can drop it).
    } catch (e) { /* ignore */ }
  };
  // Re-assert the Spaces/fullscreen behaviour only on the events that can actually
  // drop it, never on the 700ms tick (see skipTransformProcessType above).
  const reassertSpaces = () => {
    if (process.platform !== 'darwin' || !win || win.isDestroyed()) return;
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); } catch (e) { /* ignore */ }
  };
  reassertTop();                                  // claim the top immediately
  topTimer = setInterval(reassertTop, 700);       // and hold it (toggle re-raise each tick)
  win.webContents.on('did-finish-load', () => { reassertTop(); reassertSpaces(); });
  screen.on('display-metrics-changed', () => { reassertTop(); reassertSpaces(); });
  screen.on('display-added', () => { reassertTop(); reassertSpaces(); });
}

// ---- settings: load, broadcast, persist ------------------------------------
function applyConfigToOverlay() {
  if (win && !win.isDestroyed() && win.webContents) {
    try { win.setAlwaysOnTop(!cfg || cfg.onTop !== false, 'screen-saver'); } catch (e) { /* ignore */ }
    win.webContents.send('config', cfg);
    broadcastPower();   // keep the derived low-power flag + cursor cadence in sync with config
  }
}
// Send the authoritative bottom work-area inset (taskbar height) from Electron's screen
// API. The overlay's DOM window.screen is unreliable at non-100% DPI (it mixes physical
// and logical pixels), which lands the cat mid-screen; this is in DIP, matching the
// window's innerHeight, so the cat finds the true taskbar line.
function sendGeom() {
  if (!win || win.isDestroyed() || !win.webContents) return;
  const d = screen.getPrimaryDisplay(), b = d.bounds, wa = d.workArea;
  const bottomInset = Math.max(0, (b.y + b.height) - (wa.y + wa.height));   // 0 = no bottom taskbar (top/side/auto-hide) -> renderer rests at the true bottom
  const topInset = Math.max(0, wa.y - b.y), leftInset = Math.max(0, wa.x - b.x), rightInset = Math.max(0, (b.x + b.width) - (wa.x + wa.width));
  // The floor line = the work-area bottom (top edge of the taskbar/Dock) measured from
  // the window's TOP edge (the overlay is pinned to the display's top-left). This is the
  // authoritative floor whether or not the OS lets the overlay cover the taskbar region:
  // on Windows the overlay is clamped to the work area, so its own innerHeight already
  // excludes the taskbar - subtracting bottomInset again would float the cat. Sending an
  // absolute floor line avoids that double-count.
  const bottomWorkY = (wa.y + wa.height) - b.y;
  win.webContents.send('geom', { bottomInset, topInset, leftInset, rightInset, bottomWorkY });
}
function sendThemes() {
  if (win && !win.isDestroyed() && win.webContents) win.webContents.send('themes', themesCache);
}
function broadcastThemes() {
  sendThemes();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('themes', themesCache);
}
function sendMood(cmd) {
  if (win && !win.isDestroyed() && win.webContents) win.webContents.send('mood', cmd);
}
// Single choke-point for every config change: persist, then push the new state to
// the overlay + the settings window + the tray menu so all surfaces stay in sync.
function persistAndBroadcast(next) {
  const prevBreak = cfg ? cfg.breakMinutes : 0;
  const prevPomo = cfg ? JSON.stringify(cfg.pomodoro) : '';
  const prevEmail = cfg ? JSON.stringify(cfg.email) : '';
  const prevCal = cfg ? JSON.stringify(cfg.calendar) : '';
  cfg = config.save(next);
  if (cfg.breakMinutes !== prevBreak) breakAnchor = Date.now();  // editing the interval restarts it
  if (JSON.stringify(cfg.pomodoro) !== prevPomo) syncPomodoro(); // toggling/retuning restarts the loop
  if (JSON.stringify(cfg.email) !== prevEmail) mail.sync(cfg);   // re-poll when email settings change
  if (JSON.stringify(cfg.calendar) !== prevCal) cal.sync(cfg);   // re-fetch when calendar settings change
  tools.onConfig(cfg);   // hotkey + clipboard history follow their settings
  applyConfigToOverlay();
  applyFocus();   // work mode / quiet hours / focus toggles all change whether we are "busy"
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('config', cfg);
  rebuildTrayMenu();
}

// ---- tray ------------------------------------------------------------------
function trayImage() {
  // macOS wants a TEMPLATE image in the menu bar: pure black plus alpha, which the
  // system paints itself so it inverts on a dark menu bar and turns white while the
  // menu is open. The Windows tray wants the opposite - the mascot is dark, so it
  // rides on a warm tile to stay visible on a dark system tray. Shipping the tile to
  // macOS puts an opaque sticker in the menu bar that never inverts.
  const isMac = process.platform === 'darwin';
  const p = path.join(APP_DIR, 'assets', isMac ? 'trayTemplate.png' : 'tray.png');
  let img = nativeImage.createFromPath(p);
  if (img.isEmpty() && isMac) img = nativeImage.createFromPath(path.join(APP_DIR, 'assets', 'tray.png'));   // fall back rather than show nothing
  if (img.isEmpty()) return nativeImage.createEmpty();
  if (isMac) img.setTemplateImage(true);
  return img;
}
function createTray() {
  try {
    tray = new Tray(trayImage());
    tray.setToolTip('pixelpets');
    // macOS routes a left-click straight to the context menu once setContextMenu is
    // used, so double-click never fires there. Settings is the first menu item.
    if (process.platform !== 'darwin') tray.on('double-click', openSettings);
    rebuildTrayMenu();
  } catch (e) { log.error('tray failed to start', e); }
}
function rebuildTrayMenu() {
  if (!tray) return;
  // The tray follows the active species: a dog owner picks a BREED, not a coat,
  // and each species remembers its own choice in its own config field.
  const sp = speciesOf(cfg && cfg.species);
  const coatNames = sp.id === 'dog' ? coatsFor('dog') : PATTERN_NAMES.concat(themesCache.map((t) => t.name));
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate({
    cfg, getCfg: () => cfg, species: sp, coatNames,
    speciesList: SPECIES_IDS.map((id) => ({ id, emoji: SPECIES[id].emoji, label: SPECIES[id].label })),
    recent: notifyHistory.recent(10), relTime,
    onBattery, lowPowerOn: effectiveLowPower(), toolItems: tools.trayItems(),
  }, {
    persist: persistAndBroadcast, openSettings, triggerBreak, giveTreat, snooze: snoozeLast, sendMood, startSetArea, sendAction,
    renotify: (n) => notify(n.message, { source: 'recap', recap: true, dedupeMs: 0, os: false }),
    clearRecent: () => notifyHistory.clear(),
    openReport: () => reportWin && reportWin.open(),
    quit: () => app.quit(),
  })));
}

// ---- settings window -------------------------------------------------------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    // Width is pinned (the layout is designed for one column at 400), but height is
    // now draggable: the tallest section still overflows 640px on a short screen and
    // a fixed window left no way out of that but scrolling.
    width: 400, height: 640, minWidth: 400, maxWidth: 400, minHeight: 420,
    resizable: true, fullscreenable: false, maximizable: false,
    title: 'pixelpets settings', skipTaskbar: false, alwaysOnTop: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),   // taskbar icon for the settings window
    show: false, backgroundColor: '#191b22',   // dark from the first paint - no white flash
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  hardenNav(settingsWin);
  settingsWin.setMenuBarVisibility(false);
  wireMacEditKeys(settingsWin, () => settingsWin.close());   // no menu bar, so Cmd+V has to be wired by hand (see mac-edit-keys.js)
  settingsWin.once('ready-to-show', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.show(); });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// Start the system-wide input hook, and keep trying on macOS until it works.
//
// On macOS the very first start() call raises the Accessibility prompt and then
// FAILS, because the prompt is asynchronous - the permission the user is about to
// grant does not exist yet at the moment we ask. Starting once therefore leaves the
// typing reaction and scroll-to-climb permanently dead: the user grants the
// permission, nothing happens, and the only clue is a console line nobody can see
// in a packaged .app. So we say what we need, and re-arm the moment it is granted.
function startInputHook() {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', () => { if (win && !win.isDestroyed()) win.webContents.send('keydown'); });
    // sign of rotation = scroll direction (-1 up / +1 down) so the cat can climb the right way
    uIOhook.on('wheel', (e) => { if (win && !win.isDestroyed()) win.webContents.send('scroll', Math.sign(e && e.rotation) || -1); });
    uIOhook.start();
    hookStarted = true;
    if (hookRetry) { clearInterval(hookRetry); hookRetry = null; }
  } catch (e) {
    log.warn('keyboard hook failed to start', e);
    if (process.platform === 'darwin' && !hookRetry) {
      notify('Turn on Accessibility for pixelpets in System Settings > Privacy & Security so I can react to your typing.',
        { source: 'system', dedupeKey: 'axapi', dedupeMs: 3600000, ttl: 12000, ignoreQuiet: true });
      hookRetry = setInterval(startInputHook, 5000);   // picks the grant up without a restart
    }
  }
}

// ---- break timer + reminder scheduler (lives in MAIN; renderer may be paused) --
function snoozeLast(min) {
  if (!lastReminder) return;
  const lr = lastReminder;
  setTimeout(() => notify(lr.message, { source: 'reminder', dedupeKey: 'snz:' + lr.id + ':' + min }), min * 60000);
}
function triggerBreak() {
  // The bubble comes from this raw IPC, not from notify() - the notify() call below
  // passes bubble:false and exists only for the tray recap. That meant every gate
  // inside notify() (quiet hours, Focus Guard) was guarding a send that never
  // happened, so the pet meowed its way through meetings and through the night with
  // only the master Sound switch able to stop it. Decide the sound HERE instead.
  const st = focusState();
  const hush = st.busy || (cfg && inQuietHours(cfg.quietHours, new Date()));
  if (win && !win.isDestroyed()) win.webContents.send('break', { sound: !hush });
  notify('Break time! Stretch with me~', { source: 'break', bubble: false, sound: false });
  breakAnchor = Date.now();
}
function giveTreat() {
  if (!win || win.isDestroyed()) return;
  // Same tray slot, species-appropriate payload: a cat is handed a fish, a dog
  // gets a tennis ball thrown for it to chase down and bring back. The channel
  // comes from the same registry entry as the menu label, so the two cannot drift.
  win.webContents.send(speciesOf(cfg && cfg.species).giveChannel);
}

// ---- Pomodoro: focus/break loops. Main owns the phase clock (the renderer may
// throttle/pause); the renderer just draws a countdown from { phase, endsAt }.
// Phase flips ride the existing reactions: focus->break = the stretch break,
// break->focus = a "back to focus" reminder bubble.
let pomoPhase = 'focus', pomoEndsAt = 0, pomoTimer = null;
function sendPomo() {
  const on = !!(cfg && cfg.pomodoro && cfg.pomodoro.on);
  if (win && !win.isDestroyed()) win.webContents.send('pomo', { on, phase: pomoPhase, endsAt: pomoEndsAt });
}
function pomoFlip() {
  if (!cfg || !cfg.pomodoro || !cfg.pomodoro.on) return;
  if (pomoPhase === 'focus') {
    pomoPhase = 'break'; pomoEndsAt = Date.now() + cfg.pomodoro.breakMin * 60000;
    triggerBreak();                                              // big stretch + meow
  } else {
    pomoPhase = 'focus'; pomoEndsAt = Date.now() + cfg.pomodoro.focusMin * 60000;
    notify('Back to focus, {name}!', { source: 'pomo' });
  }
  sendPomo(); armPomoTimer();
}
function armPomoTimer() {
  if (pomoTimer) { clearTimeout(pomoTimer); pomoTimer = null; }
  if (!cfg || !cfg.pomodoro || !cfg.pomodoro.on) return;
  pomoTimer = setTimeout(pomoFlip, Math.max(250, pomoEndsAt - Date.now()));
}
// (Re)start or stop the loop whenever the pomodoro config changes.
function syncPomodoro() {
  if (cfg && cfg.pomodoro && cfg.pomodoro.on) { pomoPhase = 'focus'; pomoEndsAt = Date.now() + cfg.pomodoro.focusMin * 60000; }
  else { pomoEndsAt = 0; }
  sendPomo(); armPomoTimer();
}
// Single choke-point for every user-facing message: an in-overlay speech bubble
// (the renderer plays the meow) plus an optional Windows toast. Every producer -
// reminders, pomodoro, break, email, calendar, the external bridge - routes here.
const notifyRecent = new Map();   // dedupeKey -> last fire ms (drops rapid repeats)
// notifyRecent is per-MESSAGE, so it only ever stops the same thing repeating. A
// burst of DIFFERENT messages - eight reminders catching up after a laptop wakes,
// or a script appending to the bridge file in a loop - sails straight through it
// and meows once each. This is the floor on the pet's VOICE per source: every
// bubble still appears and every message still reaches the tray recap, but the
// pet says something at most this often about any one topic.
const soundRecent = new Map();    // 'snd:'+source -> last audible ms
const SOUND_FLOOR_MS = 15000;

// What the pet said recently, for the tray recap (src/main/notify-history.js).
const notifyHistory = makeNotifyHistory({
  filePath: () => path.join(app.getPath('userData'), 'notify-history.json'),
  onChange: () => rebuildTrayMenu(),
});
// One-time first-run hints.
//
// Nothing in the running app tells a new user that double-clicking opens Settings,
// right-clicking cycles the coat, or that scrolling makes the pet climb. All of it
// was discoverable only by having read the README first, which most people will
// not have done. Two short bubbles, once ever.
//
// Marks itself seen BEFORE showing anything: did-finish-load fires again on every
// reload, including the automatic one after a renderer crash, and a hint that
// replays itself is worse than no hint at all.
//
// Bubble only, never an OS toast: a desktop toast on first launch reads as an app
// demanding attention, which is the opposite of what this one is for.
function showFirstRunTips() {
  if (SHOT || SHEET || !cfg || cfg.tipsSeen) return;
  persistAndBroadcast({ ...cfg, tipsSeen: true });
  const say = (delay, text) => tipTimers.push(setTimeout(() => {
    if (win && !win.isDestroyed()) notify(text, { source: 'tips', os: false, ttl: 9000, dedupeMs: 0 });
  }, delay));
  const key = process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space';
  say(6000, `Double-click me for settings. Right-click me, or press ${key}, for quick tools.`);
  say(18000, 'Scroll any page and watch me climb.');
}

// ---- Focus Guard ------------------------------------------------------------
// Whether the human is busy, what we held back while they were, and the one-shot
// timer that delivers the summary the moment they are free. See focus.js for the
// policy; everything here is the plumbing around it.
const heldBack = focus.makeQueue(50);
let focusBusy = false;            // last broadcast state, so we only act on CHANGES
let focusReleaseTimer = null;

function focusState() {
  return focus.busyState({ cfg, events: cal.events(), now: Date.now() });
}

// Re-evaluate whether we are busy, tell the overlay (so the pet parks itself and
// stops chasing things), and on the busy -> free edge deliver whatever waited.
//
// Called from tick() (every 20s) and whenever the config changes, plus armed
// precisely at a meeting's end so the digest lands on the hour rather than up to
// 20 seconds late.
function applyFocus() {
  if (!cfg) return;
  const st = focusState();
  if (focusReleaseTimer) { clearTimeout(focusReleaseTimer); focusReleaseTimer = null; }

  if (st.busy !== focusBusy) {
    focusBusy = st.busy;
    // The overlay treats this exactly like work mode - park, no butterfly, no
    // cursor chase - without touching the user's own workMode setting, so
    // turning it on for a meeting cannot silently rewrite their preference.
    if (win && !win.isDestroyed()) win.webContents.send('focus', { busy: st.busy, reason: st.reason || '' });
    if (!st.busy) deliverHeld();
  }

  // Wake up exactly when this meeting ends. Bounded so a far-future or malformed
  // end can never schedule a timer beyond what setTimeout represents safely.
  if (st.busy && Number.isFinite(st.until)) {
    const ms = st.until - Date.now();
    if (ms > 0 && ms < 6 * 3600 * 1000) focusReleaseTimer = setTimeout(applyFocus, ms + 250);
  }
}

// Hand over what was held back, as one line. Bubble + toast, and deliberately
// NOT recorded again: every held message already went into the history when it
// arrived, so the tray recap has the detail and this is only the nudge to look.
function deliverHeld() {
  const items = heldBack.drain();
  if (!items.length) return;
  if (!(cfg && cfg.focus && cfg.focus.digest === false)) {
    const line = focus.digest(items);
    if (line) notify(line, { source: 'focus', dedupeKey: 'focus:digest', dedupeMs: 0, recap: true, title: 'While you were away' });
  }
}

function notify(message, opts) {
  opts = opts || {};
  const msg = fillPlaceholders(message, { name: cfg && cfg.name ? cfg.name : '', count: opts.count });
  if (!msg) return;
  const now = Date.now();
  const key = opts.dedupeKey || ('msg:' + msg);
  if (now - (notifyRecent.get(key) || 0) < (opts.dedupeMs == null ? 4000 : opts.dedupeMs)) return;
  notifyRecent.set(key, now);
  if (notifyRecent.size > 200) { for (const k of notifyRecent.keys()) { notifyRecent.delete(k); if (notifyRecent.size <= 100) break; } }
  if (!opts.recap) notifyHistory.record(opts.source, msg);   // log it (but not when re-showing from the recap)

  // Focus Guard: while you are busy, anything that can wait DOES wait - no bubble,
  // no sound, no toast - and is delivered as one summary the moment you are free
  // (deliverHeld). It is already in the history above, so nothing is ever lost.
  // opts.ignoreQuiet also means "this is urgent" and skips the hold entirely.
  if (!opts.recap && !opts.ignoreQuiet && !opts.vip && focus.isDeferrable(opts.source) && focusState().busy) {
    heldBack.push({ source: opts.source || '', message: msg, ts: now });
    return;
  }

  // Quiet Hours silences the pet without hiding it: the bubble still appears so a
  // reminder that lands overnight is there when you look, but the meow/purr and the
  // OS toast are held back. opts.ignoreQuiet is the escape hatch for anything that
  // should always break through.
  const quiet = !opts.ignoreQuiet && cfg && inQuietHours(cfg.quietHours, new Date());
  let sound = opts.sound !== false && !quiet;
  const soundKey = 'snd:' + (opts.source || '');
  if (sound && now - (soundRecent.get(soundKey) || 0) < SOUND_FLOOR_MS) sound = false;   // seen and shown, just not spoken
  if (sound) soundRecent.set(soundKey, now);
  if (soundRecent.size > 200) { for (const k of soundRecent.keys()) { soundRecent.delete(k); if (soundRecent.size <= 100) break; } }
  if (opts.bubble !== false && win && !win.isDestroyed()) {
    win.webContents.send('notify', { message: msg, ttl: opts.ttl || 5000, level: opts.level || 'info', sound });
  }
  const wantOs = (opts.os !== undefined ? opts.os : !(cfg && cfg.notifyOn === false)) && !quiet;
  if (wantOs) {
    try { if (Notification.isSupported()) new Notification({ title: opts.title || 'pixelpets', body: msg, silent: true }).show(); }
    catch (e) { /* toasts are best-effort */ }
  }
}

// Is this reminder scheduled to fire on date d? (recurrence gate.)
function reminderDueOn(r, d) {
  const recur = r.recur || 'daily';
  if (recur === 'daily') return true;
  const dow = d.getDay();   // 0 Sun .. 6 Sat
  if (recur === 'weekdays') return dow >= 1 && dow <= 5;
  if (recur === 'weekly') return Array.isArray(r.days) && r.days.includes(dow);
  if (recur === 'once') return !r.lastFired;   // fire a single time, then never again
  return true;
}
let lastTickAt = 0;
function tick() {
  if (!cfg || !win || win.isDestroyed()) return;
  applyFocus();   // cheap, and the busy -> free edge is what releases the held queue
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
  const hhmm = `${hh}:${mm}`;
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hhmm}`;
  if (minuteKey !== lastMinuteKey) { lastMinuteKey = minuteKey; firedThisMinute = new Set(); }
  // Catch-up: after a sleep/resume or long stall, also fire any reminders whose
  // minute we skipped entirely (timers don't run while suspended).
  const skipped = new Map();   // 'HH:MM' -> the Date of that skipped minute, so the recurrence gate checks the RIGHT day
  if (lastTickAt) {
    for (let ms = lastTickAt + 60000; ms < now.getTime(); ms += 60000) {
      const d = new Date(ms);
      const k = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (!skipped.has(k)) skipped.set(k, d);
    }
  }
  lastTickAt = now.getTime();
  let onceFired = false;
  for (const r of cfg.reminders) {
    const skippedDate = skipped.get(r.hhmm);   // a minute we slept through (possibly on a different day)
    const hit = (r.hhmm === hhmm) || skippedDate !== undefined;
    if (!hit || firedThisMinute.has(r.id) || !reminderDueOn(r, skippedDate || now)) continue;
    firedThisMinute.add(r.id);
    lastReminder = { id: r.id, message: r.message };
    notify(r.message, { source: 'reminder', dedupeKey: 'rem:' + r.id });
    if ((r.recur || 'daily') === 'once') { r.lastFired = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate(); onceFired = true; }
  }
  if (onceFired) persistAndBroadcast({ ...cfg });
  if (cfg.breakMinutes > 0 && Date.now() - breakAnchor >= cfg.breakMinutes * 60000) triggerBreak();
  // Pomodoro catch-up: if the exact-time flip was lost to a sleep/stall, flip now.
  if (cfg.pomodoro && cfg.pomodoro.on && pomoEndsAt && Date.now() > pomoEndsAt + 1000) pomoFlip();
}
function startScheduler() {
  breakAnchor = Date.now();
  syncPomodoro();                            // resume the pomodoro loop if it's enabled
  tick();                                    // fire immediately (catch a launch late in the minute)
  scheduleTimer = setInterval(tick, 20000);  // sample each clock-minute ~3x; dedupe handles repeats
}

// ---- teardown --------------------------------------------------------------
let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return; cleanedUp = true;
  if (cursorTimer) clearInterval(cursorTimer);
  tipTimers.forEach(clearTimeout); tipTimers = [];   // a hint must not fire mid-teardown
  if (areaTimer) clearTimeout(areaTimer);
  if (topTimer) clearInterval(topTimer);
  if (hookRetry) { clearInterval(hookRetry); hookRetry = null; }
  if (scheduleTimer) clearInterval(scheduleTimer);
  if (pomoTimer) clearTimeout(pomoTimer);
  notifyHistory.flush();   // write any pending history now so it can't fire mid-teardown
  if (bridge) bridge.stop();
  if (hookStarted) { try { require('uiohook-napi').uIOhook.stop(); } catch (e) { /* ignore */ } }
  try { mail.stop(); } catch (e) { /* ignore */ }
  try { cal.stop(); } catch (e) { /* ignore */ }
  try { tools.stop(); } catch (e) { /* ignore */ }
  try { log.info('pixelpets quitting'); log.flushSync(); } catch (e) { /* ignore */ }
  if (tray) { try { tray.destroy(); } catch (e) { /* ignore */ } tray = null; }
}

// Defense-in-depth: only accept IPC from our own local windows. Both the overlay and settings
// windows load file:// pages, and navigation + window.open are blocked (hardenNav), so any
// sender whose frame URL isn't file:// is bogus. Wrap on()/handle() so every handler is guarded.
function isTrustedSender(e) {
  const wc = e && e.sender;
  if (!wc) return false;
  // Primary + reliable: the IPC came from one of the windows WE created.
  if ((win && !win.isDestroyed() && wc === win.webContents) ||
      (settingsWin && !settingsWin.isDestroyed() && wc === settingsWin.webContents)) return true;
  // The Quick Tools launcher is also a local file:// page, but it is the one window
  // that takes free typing, so it gets its OWN channels (tools/index.js) and nothing
  // else: it must never reach settings:save, the mail password or the calendar.
  if (tools.ownsSender(wc)) return false;
  if (reportWin && reportWin.owns(wc)) return false;   // the report window has its own channels too
  // Fallback: any local file:// frame (navigation/window.open are blocked, so this is still ours).
  try { const u = e.senderFrame && e.senderFrame.url; return typeof u === 'string' && u.startsWith('file:'); }
  catch (_) { return false; }
}
const onSecure = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (isTrustedSender(e)) fn(e, ...a); });
const handleSecure = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (isTrustedSender(e) ? fn(e, ...a) : undefined));

// Renderer reports the cat's interactive bbox (overlay-local px) + drag state.
onSecure('hot', (_e, o) => {
  if (!o || typeof o !== 'object') return;
  const num = (v) => (Number.isFinite(v) ? v : 0);   // reject NaN/Infinity from a misbehaving/forged renderer (else the click-through bbox could become unbounded and capture all clicks)
  hot = { x: num(o.x), y: num(o.y), w: Math.max(0, num(o.w)), h: Math.max(0, num(o.h)), dragging: !!o.dragging };
});
function startSetArea() {
  if (!win || win.isDestroyed() || settingArea) return;   // ignore re-clicks while already setting
  settingArea = true;
  win.setIgnoreMouseEvents(false);
  win.webContents.send('setarea:start');
  clearTimeout(areaTimer);
  areaTimer = setTimeout(endSetArea, 30000);   // safety: never stay click-capturing forever
}
function endSetArea() {
  settingArea = false;
  clearTimeout(areaTimer); areaTimer = null;
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(true, { forward: true });
}
onSecure('setarea:done', (_e, area) => { endSetArea(); if (area && cfg) persistAndBroadcast({ ...cfg, playArea: area }); });
onSecure('quit', () => app.quit());
// The pet's box in screen px, so the launcher can open right next to it.
function getPetAnchor() {
  return { x: origin.x + hot.x, y: origin.y + hot.y, w: hot.w, h: hot.h };
}
onSecure('sheet:image', (_e, dataUrl) => {
  try {
    const b64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
    const dir = path.join(APP_DIR, 'previews');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'contact-sheet.png'), Buffer.from(b64, 'base64'));
    console.log('[wrote previews/contact-sheet.png]');
  } catch (e) { console.log('[sheet-error]', e.message); }
  app.quit();
});
onSecure('settings:open', () => openSettings());
onSecure('report:open', () => { if (reportWin) reportWin.open(); });
onSecure('settings:save-pattern', (_e, i) => {
  if (!cfg) return;
  persistAndBroadcast({ ...cfg, [speciesOf(cfg.species).id === 'dog' ? 'dogPattern' : 'pattern']: i });
});
onSecure('settings:save-species', (_e, id) => {
  if (!cfg) return;
  const next = SPECIES[id] ? id : 'cat';
  const patch = { ...cfg, species: next };
  if (next === 'dog' && !Number.isFinite(cfg.dogPattern)) patch.dogPattern = defaultCoatIndex('dog');
  persistAndBroadcast(patch);
});
onSecure('settings:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close(); });
onSecure('settings:testSound', () => {
  notify('Hi {name}!', { source: 'test', dedupeMs: 0, os: false });   // a sound test shouldn't also pop a desktop toast
});
// "Make it do something": the settings window asks for a behaviour by name and the
// overlay decides what that means for the species it is currently wearing. Main is
// a relay and deliberately does not map ids to poses - the renderer is the only
// place that knows a dog's version of "go chase something" is its ball rather than
// a butterfly. Allow-listed rather than forwarded blind, so the channel cannot
// become a way to poke arbitrary renderer state.
const PET_ACTIONS = new Set(['companion', 'give', 'play', 'stretch', 'groom', 'loaf', 'home']);
// A function declaration rather than a const, so the tray menu built further up this file
// can call it: the tray is the only surface that reaches 'home' with settings closed.
function sendAction(id) { if (win && !win.isDestroyed()) win.webContents.send('action', id); }
onSecure('settings:action', (_e, id) => {
  if (!PET_ACTIONS.has(id)) return;
  sendAction(id);
});
handleSecure('email:passwordInfo', () => mail.passwordInfo());
handleSecure('email:setPassword', (_e, pw) => mail.setPassword(pw));
handleSecure('email:test', (_e, pw) => mail.test(cfg, pw && String(pw).length ? String(pw) : null));
handleSecure('calendar:test', () => cal.test(cfg));
handleSecure('settings:get', () => cfg);
handleSecure('settings:save', (_e, partial) => {
  // reject anything that isn't a small plain object before merging (normalize is the
  // real sanitizer, but this caps the in-flight allocation and drops junk payloads)
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return cfg;
  try { if (JSON.stringify(partial).length > 65536) return cfg; } catch (e) { return cfg; }
  persistAndBroadcast({ ...cfg, ...partial });
  return cfg;
});
handleSecure('themes:get', () => themesCache);
handleSecure('themes:add', (_e, t) => { themesCache = themes.save([...themesCache, t]); broadcastThemes(); rebuildTrayMenu(); return themesCache; });
handleSecure('themes:delete', (_e, name) => {
  const removed = themesCache.findIndex((x) => x.name === name);
  themesCache = themes.save(themesCache.filter((x) => x.name !== name));
  broadcastThemes(); rebuildTrayMenu();
  // Coat indices run built-ins first, custom coats after, so deleting one shifts
  // every coat below it up a slot. Re-anchor the cat's coat or it quietly becomes
  // whichever coat inherited the index.
  if (removed >= 0 && cfg) {
    const next = config.coatAfterThemeRemoval(cfg.pattern, removed);
    if (next !== cfg.pattern) persistAndBroadcast({ ...cfg, pattern: next });
  }
  return themesCache;
});
handleSecure('themes:export', async () => {
  const r = await dialog.showSaveDialog(settingsWin || win, { title: 'Export custom coats', defaultPath: 'pixelpets-coats.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  try { fs.writeFileSync(r.filePath, JSON.stringify({ themes: themesCache }, null, 2)); return true; } catch (e) { return false; }
});
handleSecure('themes:import', async () => {
  const r = await dialog.showOpenDialog(settingsWin || win, { title: 'Import custom coats', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return themesCache;
  try {
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, ''));
    const incoming = themes.clean(Array.isArray(data) ? data : (data && data.themes));
    const have = new Set(themesCache.map((t) => t.name.toLowerCase()));
    themesCache = themes.save(themesCache.concat(incoming.filter((t) => !have.has(t.name.toLowerCase()))));
    broadcastThemes(); rebuildTrayMenu();
  } catch (e) { /* ignore bad file */ }
  return themesCache;
});

app.whenReady().then(() => {
  if (isSecondary) return;
  // Frozen at the old name deliberately, like the bridge paths above. On Windows this
  // string is the toast identity, the name of the HKCU..\Run autostart value Electron
  // writes, and the key the NSIS installer matches to upgrade in place rather than
  // installing a second copy alongside. Changing it to match the new product name
  // would strand the existing autostart entry and split upgrades into two installs.
  try { app.setAppUserModelId('com.johnsonkc.pixelcat'); } catch (e) { /* Windows toast identity */ }
  // Must run before the first read of settings/themes/mail: the pixelcat -> pixelpets
  // rename moved userData, so on an upgrade the files are still under the old name.
  datadir.migrateFromLegacy(app);
  if (!SHOT && !SHEET && !REEL) {
    log = makeLogger({ dir: logDir(), echo: !app.isPackaged });
    log.info('pixelpets started', { version: app.getVersion(), platform: process.platform, release: os.release(), arch: process.arch, electron: process.versions.electron });
    app.on('child-process-gone', (_e, details) => log.error('child process gone', details));
    // Only for real runs: a listener turns an uncaught exception from "exit
    // non-zero" into "log and carry on", and `npm run test:boot` (--shot) relies
    // on the exit code to notice a crash.
    process.on('uncaughtException', (e) => { log.error('uncaught exception', e); trippedOnce(); });
    process.on('unhandledRejection', (e) => { log.warn('unhandled promise rejection', e instanceof Error ? e : String(e)); });
  }
  themesCache = themes.load();
  if (REEL) return createReelWindow(cli);   // capture-only: no tray, no hooks, no scheduler
  if (!SHOT && !SHEET) {
    // Don't fight the user. macOS lists login items in System Settings > General,
    // so a user who turns pixelpets off there has made an explicit choice; asserting
    // openAtLogin on every launch would silently undo it. Ask once, on the first run
    // that ever gets this far, and then leave it alone - the marker file mirrors the
    // pattern datadir.js already uses for its one-time migration.
    if (process.argv.includes('--autostart=off')) setAutostart(false);
    else if (process.platform !== 'darwin') setAutostart(true);
    else if (!autostartAsked()) { setAutostart(true); markAutostartAsked(); }
    if (process.argv.includes('--autostart=off')) { console.log('[autostart disabled]'); return app.quit(); }
    cfg = config.load();
    notifyHistory.load();   // restore the recent-notifications recap from last session
  }
  createWindow();
  if (!SHOT && !SHEET) {
    createTray(); startScheduler(); mail.init(notify, () => cfg); mail.sync(cfg); cal.init(notify, () => cfg); cal.sync(cfg);
    tools.init({
      notify, getCfg: () => cfg, persist: persistAndBroadcast, sendAction, triggerBreak, openSettings,
      rebuildTray: rebuildTrayMenu, hardenNav, onSecure, handleSecure, getPetAnchor,
      isBusy: () => focusState().busy,
      inQuiet: () => !!(cfg && inQuietHours(cfg.quietHours, new Date())),
      isSettingsFocused: () => !!(settingsWin && !settingsWin.isDestroyed() && settingsWin.isFocused()),
      getSettingsWin: () => (settingsWin && !settingsWin.isDestroyed() ? settingsWin : null),
      getThemes: () => themesCache, builtinCoatCount: () => PATTERN_NAMES.length, log,
    });
    reportWin = makeReportWindow({
      hardenNav, wireMacEditKeys, log, logDir: logDir(),
      getInfo: () => ({
        version: app.getVersion(), platform: process.platform, osRelease: os.release(), arch: process.arch,
        electron: process.versions.electron, features: enabledFeatures(cfg), logLines: log.tail(60),
      }),
    });
    // Auto low-power on battery: track power state and re-derive the flag on change.
    try { onBattery = powerMonitor.isOnBatteryPower(); } catch (e) { onBattery = false; }
    try {
      powerMonitor.on('on-battery', () => { onBattery = true; broadcastPower(); rebuildTrayMenu(); });
      powerMonitor.on('on-ac', () => { onBattery = false; broadcastPower(); rebuildTrayMenu(); });
    } catch (e) { /* powerMonitor unavailable: manual control only */ }
  }
});

// Don't quit just because the settings window closed - the overlay is the app.
// We exit only via the tray's Quit (app.quit()), which fires 'before-quit'.
app.on('window-all-closed', () => {
  if (win && !win.isDestroyed()) return;  // overlay still alive: stay running
  app.quit();
});
app.on('before-quit', cleanup);
// If the user launches a second copy while the pet runs, surface Settings rather
// than silently doing nothing (the second copy quits via the single-instance lock).
app.on('second-instance', () => { if (!isSecondary && !SHOT) openSettings(); });
