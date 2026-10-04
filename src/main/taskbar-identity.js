// The taskbar icon when the app is run from source on Windows.
//
// main.js gives the app its own taskbar identity (the app id below), and Windows
// answers an explicit identity by looking for a Start Menu shortcut that carries it.
// Run from source, there is one: Electron drops "Electron.lnk" into the Start Menu so
// that notifications have something to belong to, pointing at electron.exe and
// wearing electron.exe's icon. Windows takes the taskbar icon from that shortcut,
// so every window sat on Electron's atom while its own title bar showed the mascot.
//
// Neither the BrowserWindow `icon` option nor setAppDetails() gets past it; both
// were tried, and the shortcut wins. They only decide the icon when no shortcut
// claims the id. So the fix is to the shortcut itself: keep everything Electron
// wrote and change its icon.
//
// An installed build is left alone. Its exe carries the icon, the installer writes
// the real shortcut, and an icon inside app.asar is not a file the shell can open.
const path = require('path');
const { app, shell } = require('electron');

// The same string main.js passes to setAppUserModelId and package.json ships as
// build.appId. tests/taskbar-identity.test.js holds the three together.
const APP_ID = 'com.johnsonkc.pixelcat';
const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
const SHORTCUT_NAME = 'Electron.lnk';

// What to change on the shortcut, or null to leave it alone. `link` is what the
// shortcut says now. Split from the file access so it can be checked without one.
function shortcutFix({ platform, isPackaged, link }) {
  if (platform !== 'win32' || isPackaged || !link) return null;
  // Every Electron app run from source shares that file name. One that carries a
  // different id belongs to some other project on this machine.
  if (link.appUserModelId !== APP_ID) return null;
  if (link.icon === ICON && link.iconIndex === 0) return null;
  return { icon: ICON, iconIndex: 0 };
}

// Electron writes the shortcut the first time the app raises a notification, so on
// a fresh checkout there is nothing to fix until the run after that one.
function fixDevTaskbarIcon() {
  if (process.platform !== 'win32' || app.isPackaged) return;
  const file = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', SHORTCUT_NAME);
  let link;
  try { link = shell.readShortcutLink(file); } catch (e) { return; }   // no shortcut yet
  const fix = shortcutFix({ platform: process.platform, isPackaged: app.isPackaged, link });
  if (!fix) return;
  // Cosmetic: a refusal here must not stop the pet from starting.
  let ok = false;
  try { ok = shell.writeShortcutLink(file, 'update', fix); } catch (e) { /* reported below */ }
  if (!ok) console.warn('[taskbar] could not set the icon on', file);
}

module.exports = { APP_ID, ICON, shortcutFix, fixDevTaskbarIcon };
