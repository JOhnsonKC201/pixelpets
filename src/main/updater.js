// Update checks, opt-in.
//
// pixelpets promises not to touch the network unless you ask it to, so this
// does nothing at all until Settings > Updates > "Check for updates" is on.
// When it is on, the only requests go to this repo's GitHub Releases
// (build.publish in package.json). Like any web request they carry the IP
// address and a user agent naming the app, Electron and OS versions.
// electron-updater would also send a random ID that it keeps per install,
// which lets every check from one machine be linked; we replace it with the
// same value for everyone (SHARED_ID below), so it identifies no one.
//
// Windows downloads in the background and installs when the app quits; the
// tray offers "Restart to update". macOS only checks: installing an update
// there needs an Apple Developer ID signature these builds do not have, so the
// pet points at the release page instead. Both verify the download against the
// sha512 in latest.yml / latest-mac.yml. That catches a corrupt download,
// not a malicious one: the manifest and the installer come from the same
// release, so whoever can publish a release can publish an update. Code
// signing (win.publisherName) is what would add that check.

const { translator, FALLBACK } = require('../i18n');
const FIRST_CHECK_MS = 30 * 1000;
const EVERY_MS = 6 * 60 * 60 * 1000;
const RELEASES = 'https://github.com/JOhnsonKC201/pixelpets/releases';
// Sent as x-user-staging-id instead of a per-install ID. Staged rollouts are
// not used, so the value does not matter as long as it is the same for all.
const SHARED_ID = '00000000-0000-4000-8000-000000000000';
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// Only plain versions from the manifest are trusted into text and URLs.
const versionOf = (info) => (info && VERSION.test(String(info.version)) ? String(info.version) : null);

/**
 * What this run should do about updates.
 * @returns {'off' | 'dev' | 'install' | 'notify'}
 */
function updateMode({ cfg, isPackaged, platform }) {
  if (!(cfg && cfg.updates && cfg.updates.check === true)) return 'off';
  if (!isPackaged) return 'dev';   // a source checkout updates with git, not with this
  return platform === 'darwin' ? 'notify' : 'install';
}

/**
 * @param {object} d
 * @param {() => object} d.getUpdater     returns electron-updater's autoUpdater (required lazily)
 * @param {boolean} d.isPackaged
 * @param {string} d.platform
 * @param {() => object|null} d.getCfg
 * @param {(msg: string, opts: object) => void} d.notify
 * @param {{ info: Function, warn: Function }} d.log
 * @param {(url: string) => void} d.openExternal
 * @param {() => void} d.onChange         something the tray shows has changed
 * @param {Function} [d.setTimer]
 * @param {Function} [d.clearTimer]
 */
function makeUpdater(d) {
  const setTimer = d.setTimer || setTimeout;
  const clearTimer = d.clearTimer || clearTimeout;
  let updater = null;
  let timer = null;
  let mode = 'off';
  let available = null;   // a newer version we know about (macOS, or Windows mid-download)
  let ready = null;       // a version downloaded and waiting for a restart (Windows)
  const told = new Set(); // versions the pet already mentioned

  function wire() {
    if (updater) return updater;
    updater = d.getUpdater();
    updater.logger = null;              // our own log gets the outcome, not electron-updater's chatter
    updater.requestHeaders = { 'x-user-staging-id': SHARED_ID };
    updater.autoInstallOnAppQuit = true;
    updater.on('update-available', (info) => {
      available = versionOf(info);
      if (mode === 'notify') tell(available, `Version ${available} is out. Pick "Download ${available}" in the tray menu to get it.`);
      d.onChange();
    });
    updater.on('update-downloaded', (info) => {
      ready = versionOf(info);
      tell(ready, `Version ${ready} is ready. It installs when you quit, or pick "Restart to update" in the tray.`);
      d.onChange();
    });
    updater.on('error', (e) => d.log.warn('update check failed', e && e.message ? e.message : String(e)));
    return updater;
  }

  function tell(version, message) {
    if (!version || told.has(version)) return;
    told.add(version);
    d.notify(message, { source: 'updates', title: 'pixelpets update', os: false });
  }

  function configure() {
    const u = wire();
    const cfg = d.getCfg();
    u.autoDownload = mode === 'install';
    u.allowPrerelease = !!(cfg && cfg.updates && cfg.updates.channel === 'beta');
    return u;
  }

  async function check() {
    if (mode !== 'install' && mode !== 'notify') return { status: mode };
    try {
      const result = await configure().checkForUpdates();
      const latest = result && result.updateInfo && result.updateInfo.version;
      d.log.info('update check', { mode, latest: latest || null });
      if (ready) return { status: 'ready', version: ready };
      if (result && result.isUpdateAvailable) return { status: 'available', version: latest };
      return { status: 'up-to-date', version: latest || null };
    } catch (e) {
      d.log.warn('update check failed', e && e.message ? e.message : String(e));
      return { status: 'error' };
    }
  }

  function schedule(delay) {
    if (timer) clearTimer(timer);
    timer = setTimer(async () => { timer = null; await check(); if (mode === 'install' || mode === 'notify') schedule(EVERY_MS); }, delay);
  }

  /** Re-read the settings: start, stop or retune. Call on launch and after every settings change. */
  function sync() {
    const next = updateMode({ cfg: d.getCfg(), isPackaged: d.isPackaged, platform: d.platform });
    const wasOn = mode === 'install' || mode === 'notify';
    mode = next;
    const on = mode === 'install' || mode === 'notify';
    if (on && !wasOn) schedule(FIRST_CHECK_MS);
    if (!on && timer) { clearTimer(timer); timer = null; }
    if (on) configure();
    d.onChange();
  }

  const tr = () => (typeof d.t === 'function' ? d.t : translator(FALLBACK));

  /** Tray items for what is waiting, if anything. */
  function trayItems() {
    if (mode === 'install' && ready) {
      return [{ label: tr()('tray.updateRestart', { version: ready }), click: () => wire().quitAndInstall() }];
    }
    if (mode === 'notify' && available) {
      return [{ label: tr()('tray.updateDownload', { version: available }), click: () => d.openExternal(`${RELEASES}/tag/v${encodeURIComponent(available)}`) }];
    }
    return [];
  }

  function stop() {
    if (timer) { clearTimer(timer); timer = null; }
  }

  return { sync, checkNow: check, trayItems, stop, mode: () => mode };
}

module.exports = { makeUpdater, updateMode, RELEASES, SHARED_ID };
