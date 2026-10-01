// App-wide guards that apply to every web page Electron ever creates, not only
// the windows main.js builds and hardens one by one (harden-nav.js).
//
// - No web permissions. Electron grants permission requests (camera, mic,
//   location, notifications, ...) unless told otherwise, and the pet needs
//   none of them: notifications come from the main process, and audio is
//   synthesised with Web Audio, which needs no permission.
// - No navigation, no pop-ups and no <webview> anywhere, including in any
//   window added later that forgets to call hardenNav.

/**
 * @param {object} d
 * @param {object} d.app       Electron app
 * @param {object} d.session   Electron session module
 * @param {{ warn: Function }} d.log
 */
function installAppGuards({ app, session, log }) {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    log.warn('denied a permission request', { permission, url: safeUrl(wc) });
    callback(false);
  });
  ses.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault());
    contents.on('will-navigate', (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

function safeUrl(wc) {
  try { return wc && wc.getURL ? wc.getURL() : ''; } catch (e) { return ''; }
}

module.exports = { installAppGuards };
