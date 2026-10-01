// The settings window. main.js owns the single instance and reopens it; this
// only builds one.
const { BrowserWindow } = require('electron');
const path = require('path');
const { hardenNav } = require('./harden-nav');
const { wireMacEditKeys } = require('../mac-edit-keys');

const SRC = path.join(__dirname, '..');

function createSettingsWindow() {
  const w = new BrowserWindow({
    // Width is pinned (the layout is designed for one column at 400), but height is
    // draggable: the tallest section still overflows 640px on a short screen and
    // a fixed window left no way out of that but scrolling.
    width: 400, height: 640, minWidth: 400, maxWidth: 400, minHeight: 420,
    resizable: true, fullscreenable: false, maximizable: false,
    title: 'pixelpets settings', skipTaskbar: false, alwaysOnTop: true,
    icon: path.join(SRC, '..', 'assets', 'icon.png'),   // taskbar icon for the settings window
    show: false, backgroundColor: '#191b22',   // dark from the first paint - no white flash
    webPreferences: { preload: path.join(SRC, 'settings-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  hardenNav(w);
  w.setMenuBarVisibility(false);
  wireMacEditKeys(w, () => w.close());   // no menu bar, so Cmd+V has to be wired by hand (see mac-edit-keys.js)
  w.once('ready-to-show', () => { if (!w.isDestroyed()) w.show(); });
  w.loadFile(path.join(SRC, 'settings.html'));
  return w;
}

module.exports = { createSettingsWindow };
