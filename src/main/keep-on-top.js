// Keep the pet above everything.
//
// alwaysOnTop at the highest level can still be stolen by fullscreen apps and
// other topmost windows, so it is re-asserted on a timer (and the very top is
// reclaimed with moveTop on Windows).

const REASSERT_MS = 700;

/**
 * @param {object} d
 * @param {object} d.win                   the overlay window
 * @param {() => object|null} d.getCfg
 * @param {object} d.screen                Electron screen (display events)
 * @param {string} [d.platform]
 * @returns {{ stop(): void }}
 */
function keepOnTop({ win, getCfg, screen, platform = process.platform }) {
  const alive = () => win && !win.isDestroyed();

  const reassertTop = () => {
    if (!alive()) return;
    const cfg = getCfg();
    if (cfg && cfg.onTop === false) return;       // user turned "always on top" off
    try {
      // The off->on toggle and moveTop() are a WINDOWS re-raise trick. On macOS
      // they drop the window from NSScreenSaverWindowLevel to normal and back on
      // every tick, 1.4 times a second, forever: window-server thrash the user
      // sees as flicker and the battery sees as work.
      if (platform !== 'darwin') {
        win.setAlwaysOnTop(false);                // toggle off->on forces a real re-raise on Windows
        win.setAlwaysOnTop(true, 'screen-saver');
        win.moveTop();
      } else {
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    } catch (e) { /* ignore */ }
  };

  // Collection behaviour is sticky, so on macOS it is set once at window creation
  // and re-asserted only on the events that can actually drop it, never on the
  // timer (see skipTransformProcessType where the window is created).
  const reassertSpaces = () => {
    if (platform !== 'darwin' || !alive()) return;
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); } catch (e) { /* ignore */ }
  };

  const both = () => { reassertTop(); reassertSpaces(); };
  reassertTop();                                  // claim the top immediately
  const timer = setInterval(reassertTop, REASSERT_MS);
  win.webContents.on('did-finish-load', both);
  screen.on('display-metrics-changed', both);
  screen.on('display-added', both);

  return { stop() { clearInterval(timer); } };
}

module.exports = { keepOnTop };
