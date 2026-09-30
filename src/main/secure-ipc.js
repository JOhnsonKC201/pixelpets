// Only accept IPC from our own local windows.
//
// Defense-in-depth: the overlay and settings windows load file:// pages, and
// navigation + window.open are blocked (harden-nav.js), so any sender whose
// frame URL is not file:// is bogus. onSecure()/handleSecure() wrap
// ipcMain.on()/handle() so every handler is guarded.

/**
 * @param {object} deps
 * @param {object} deps.ipcMain
 * @param {(wc: object) => boolean} deps.isMainWindow    the overlay or the settings window
 * @param {(wc: object) => boolean} deps.hasOwnChannels  windows that must use ONLY their own channels
 */
function makeSecureIpc({ ipcMain, isMainWindow, hasOwnChannels }) {
  function isTrustedSender(e) {
    const wc = e && e.sender;
    if (!wc) return false;
    // Primary and reliable: the IPC came from one of the windows WE created.
    if (isMainWindow(wc)) return true;
    // The Quick Tools launcher and the report window are local file:// pages
    // too, but the launcher takes free typing, so each gets its OWN channels and
    // nothing else: they must never reach settings:save, the mail password or
    // the calendar.
    if (hasOwnChannels(wc)) return false;
    // Fallback: any local file:// frame (navigation/window.open are blocked, so this is still ours).
    try { const u = e.senderFrame && e.senderFrame.url; return typeof u === 'string' && u.startsWith('file:'); }
    catch (_) { return false; }
  }
  const onSecure = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (isTrustedSender(e)) fn(e, ...a); });
  const handleSecure = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (isTrustedSender(e) ? fn(e, ...a) : undefined));
  return { isTrustedSender, onSecure, handleSecure };
}

module.exports = { makeSecureIpc };
