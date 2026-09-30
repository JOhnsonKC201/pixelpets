// The one global shortcut that opens Quick Tools. Registration can fail when
// another app (Alfred, Raycast, a game overlay) already owns the key; the caller
// hears that as `false` and tells the user, instead of the key silently doing
// nothing. globalShortcut needs no Accessibility permission on macOS.
const { globalShortcut } = require('electron');

let current = null;

function apply(accel, onPress) {
  if (current) {
    try { globalShortcut.unregister(current); } catch (e) { /* already gone */ }
    current = null;
  }
  if (!accel || accel === 'off') return true;
  let ok;
  try { ok = globalShortcut.register(accel, onPress); } catch (e) { ok = false; }
  if (ok) current = accel;
  return ok;
}

function registered() { return current; }

function stop() {
  if (current) { try { globalShortcut.unregister(current); } catch (e) { /* ignore */ } }
  current = null;
}

// "CommandOrControl+Shift+Space" -> "Ctrl+Shift+Space" / "Cmd+Shift+Space".
function label(accel, platform = process.platform) {
  if (!accel || accel === 'off') return '';
  const mac = platform === 'darwin';
  return accel
    .replace('CommandOrControl', mac ? 'Cmd' : 'Ctrl')
    .replace(/\bAlt\b/, mac ? 'Option' : 'Alt');
}

module.exports = { apply, registered, stop, label };
