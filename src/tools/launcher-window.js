// The Quick Tools launcher window. The pet's own overlay is click-through and
// never takes focus (so it can't steal your typing), which means anything you type
// into needs a window of its own: this small frameless one.
//
// Created once and then shown / hidden, never re-created, so the hotkey feels
// instant. It sits one level above the overlay (which is 'screen-saver' level) so
// the pet can never cover it, and it hides itself the moment it loses focus.
const { BrowserWindow, screen, app } = require('electron');
const path = require('path');
const os = require('os');

const WIDTH = 600;
const MIN_H = 66;
const MAX_H = 560;
const WIN11_22H2 = 22621;   // first Windows build with DWM backdrop materials (acrylic)

// Which native "glass" this OS can draw behind the launcher. Windows 11 22H2+
// gets acrylic, macOS gets vibrancy; anything older gets a solid panel, which
// the page learns about through the reset state (glass: false).
function glassFor(platform = process.platform, release = os.release()) {
  if (platform === 'darwin') return 'vibrancy';
  if (platform === 'win32' && Number(String(release).split('.')[2]) >= WIN11_22H2) return 'acrylic';
  return null;
}

function materialOptions(glass) {
  if (glass === 'acrylic') return { backgroundColor: '#00000000', backgroundMaterial: 'acrylic', roundedCorners: true };
  if (glass === 'vibrancy') return { transparent: true, backgroundColor: '#00000000', vibrancy: 'popover', visualEffectState: 'active', roundedCorners: true };
  return { backgroundColor: '#1b1d24', roundedCorners: true };
}
const GAP = 12;   // space between the pet and the launcher when anchored to it

function makeLauncher({ hardenNav, wireMacEditKeys }) {
  let win = null;
  let anchoredAbove = false;   // grows upward when it sits above the pet
  const glass = glassFor();

  function create() {
    win = new BrowserWindow({
      width: WIDTH, height: MIN_H, useContentSize: true,
      frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, show: false, alwaysOnTop: true, hasShadow: true,
      ...materialOptions(glass),
      title: 'pixelpets quick tools',
      webPreferences: {
        preload: path.join(__dirname, '..', 'launcher-preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    hardenNav(win);
    win.setMenuBarVisibility(false);
    wireMacEditKeys(win, hide);
    win.on('blur', hide);
    win.on('closed', () => { win = null; });
    win.loadFile(path.join(__dirname, '..', 'launcher.html'));
  }

  // Where to put it. With an anchor (the pet's box in screen px), sit just above
  // the pet, or below it when the pet is near the top. Without one, the upper
  // third of whichever display the cursor is on, like Spotlight.
  function place(anchor) {
    const [, h] = win.getContentSize();
    if (anchor && anchor.w > 0 && anchor.h > 0) {
      const area = screen.getDisplayMatching({ x: Math.round(anchor.x), y: Math.round(anchor.y), width: Math.round(anchor.w), height: Math.round(anchor.h) }).workArea;
      const cx = anchor.x + anchor.w / 2;
      const x = Math.round(Math.min(Math.max(cx - WIDTH / 2, area.x + GAP), area.x + area.width - WIDTH - GAP));
      const above = anchor.y - GAP - MAX_H >= area.y;
      anchoredAbove = above;
      const y = Math.round(above ? anchor.y - GAP - h : Math.min(anchor.y + anchor.h + GAP, area.y + area.height - h - GAP));
      win.setPosition(x, y);
      return;
    }
    anchoredAbove = false;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    win.setPosition(Math.round(area.x + (area.width - WIDTH) / 2), Math.round(area.y + area.height * 0.28));
  }

  function show(anchor, state = {}) {
    if (!win || win.isDestroyed()) create();
    const reveal = () => {
      if (!win || win.isDestroyed()) return;
      place(anchor);
      win.show();
      // An accessory app (dock hidden) is not the active app, so on macOS a plain
      // focus() can leave keystrokes going to whatever app was in front.
      if (process.platform === 'darwin') app.focus({ steal: true });
      win.focus();
      win.webContents.send('launcher:reset', { ...state, glass: !!glass });
    };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal);
    else reveal();
  }

  function hide() {
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
  }

  const isVisible = () => !!(win && !win.isDestroyed() && win.isVisible());

  function resize(h) {
    if (!win || win.isDestroyed()) return;
    const height = Math.max(MIN_H, Math.min(MAX_H, Math.round(h)));
    const [x, y] = win.getPosition();
    const [, oldH] = win.getContentSize();
    win.setContentSize(WIDTH, height);
    // When the launcher sits ABOVE the pet it grows upward, so its bottom edge
    // stays put next to the pet instead of sliding down over it.
    if (anchoredAbove) win.setPosition(x, y - (height - oldH));
  }

  const owns = (wc) => !!(win && !win.isDestroyed() && wc === win.webContents);
  const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

  function destroy() {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
  }

  return { show, hide, isVisible, resize, owns, send, destroy };
}

module.exports = { makeLauncher, glassFor, MIN_H, MAX_H };
