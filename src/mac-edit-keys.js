// macOS delivers Cmd+C/V/X/A as key equivalents from the Edit menu, and this app
// has no menu bar at all: app.dock.hide() makes it an accessory app, and no
// application menu is ever installed. Without this, Cmd+V is dead in every window
// the app opens. That matters most in Settings, where the two untypeable secrets
// live (a 16-character Gmail app password and a long secret .ics URL), and in the
// Quick Tools launcher, where pasting is half the point. Wiring the edits directly
// is the version that cannot depend on menu-bar behaviour.
//
// `onClose` is what Cmd+W does for this particular window (close vs hide).
function wireMacEditKeys(win, onClose) {
  if (process.platform !== 'darwin' || !win) return;
  win.webContents.on('before-input-event', (e, input) => {
    if (!input.meta || input.type !== 'keyDown' || !input.key) return;
    const wc = win.webContents;
    switch (input.key.toLowerCase()) {
      case 'c': wc.copy(); break;
      case 'v': wc.paste(); break;
      case 'x': wc.cut(); break;
      case 'a': wc.selectAll(); break;
      case 'z': if (input.shift) wc.redo(); else wc.undo(); break;
      case 'w': onClose(); break;
      default: return;
    }
    e.preventDefault();
  });
}

module.exports = { wireMacEditKeys };
