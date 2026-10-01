// Launch at login.
//
// Windows: always registered (the installer and the user can turn it off in
// Settings > Apps > Startup). macOS: asked once, because the login item is
// user-visible and user-togglable in System Settings, and after the first run
// that switch belongs to the user, not to us.
const fs = require('fs');
const path = require('path');

/**
 * @param {object} d
 * @param {object} d.app          Electron app
 * @param {string} d.appDir       the app folder, passed to Electron when run from source
 * @param {string} [d.platform]
 * @param {string} [d.execPath]
 */
function makeAutostart({ app, appDir, platform = process.platform, execPath = process.execPath }) {
  function set(enabled) {
    // `path` and `args` are documented win32-only and are silently dropped on
    // macOS. Worse, from source execPath is Electron's own binary, so macOS
    // would register Electron.app and the user would get a bare Electron window
    // at login instead of a pet. Only register a packaged bundle there.
    if (platform === 'darwin') {
      if (!app.isPackaged) return;
      try { app.setLoginItemSettings({ openAtLogin: enabled }); } catch (e) { /* not fatal */ }
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled, path: execPath, args: enabled ? [appDir] : [] });
  }

  // Whether we have ever enabled launch-at-login on this machine. A missing or
  // unreadable marker reads as "not yet asked", so the worst case is asking
  // once more, never overriding repeatedly.
  const markerPath = () => path.join(app.getPath('userData'), '.autostart-set');
  function asked() { try { return fs.existsSync(markerPath()); } catch (e) { return false; } }
  function markAsked() {
    try {
      const fp = markerPath();
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, new Date().toISOString());
    } catch (e) { /* best effort: at worst we offer again next launch */ }
  }

  /**
   * The launch-time decision. Returns true when this run was only asked to
   * turn autostart off and should quit.
   */
  function applyOnLaunch(argv) {
    const off = argv.includes('--autostart=off');
    if (off) set(false);
    else if (platform !== 'darwin') set(true);
    else if (!asked()) { set(true); markAsked(); }
    return off;
  }

  return { set, asked, markAsked, applyOnLaunch };
}

module.exports = { makeAutostart };
