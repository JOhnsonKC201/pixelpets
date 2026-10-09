// IPC the settings window uses: read and save settings, test mail and the
// calendar, manage custom coats, and ask the pet to do something.
//
// Every handler goes through onSecure/handleSecure (secure-ipc.js), so only the
// overlay and the settings window can reach these channels.
const fs = require('fs');

// "Make it do something": the settings window asks for a behaviour by name and
// the overlay decides what that means for the species it is currently wearing.
// Main is a relay and deliberately does not map ids to poses: the overlay is
// the only place that knows a dog's version of "go chase something" is its ball
// rather than a butterfly. Allow-listed rather than forwarded blind, so the
// channel cannot become a way to poke arbitrary overlay state.
const PET_ACTIONS = new Set(['companion', 'give', 'play', 'stretch', 'groom', 'loaf', 'home']);

// A settings payload bigger than this is junk, not a settings change.
const MAX_SETTINGS_BYTES = 65536;
// Parts of the config Settings has no editor for. The window sends back its
// whole copy of the config on every save, so without this a copy from before
// you saved a snippet would put the old list back, and a full set of snippets
// would push every save past the size limit above.
const NOT_SETTINGS = new Set(['snippets']);
const COATS_FILE_FILTER = [{ name: 'JSON', extensions: ['json'] }];

/**
 * @param {object} d
 * @param {Function} d.onSecure
 * @param {Function} d.handleSecure
 * @param {() => object|null} d.getCfg
 * @param {(next: object) => void} d.persist          persistAndBroadcast
 * @param {() => object[]} d.getThemes
 * @param {(list: object[]) => void} d.setThemes      store a new custom-coat list (already saved)
 * @param {() => void} d.themesChanged                tell every window and the tray
 * @param {object} d.themes                           src/themes.js
 * @param {object} d.config                           src/config.js
 * @param {object} d.pets                             { SPECIES, speciesOf, defaultCoatIndex }
 * @param {object} d.mail
 * @param {object} d.cal
 * @param {object} d.dialog                           Electron dialog
 * @param {() => object|null} d.getDialogParent
 * @param {() => object|null} d.getSettingsWin
 * @param {() => void} d.openSettings
 * @param {() => void} d.openReport
 * @param {(id: string) => void} d.sendAction
 * @param {Function} d.notify
 * @param {() => string} d.appVersion
 * @param {() => Promise<object>|object} d.checkUpdates
 */
function registerSettingsIpc(d) {
  const { onSecure, handleSecure, getCfg, persist } = d;

  onSecure('settings:open', () => d.openSettings());
  onSecure('report:open', () => d.openReport());
  onSecure('settings:close', () => { const w = d.getSettingsWin(); if (w) w.close(); });
  onSecure('settings:testSound', () => {
    d.notify('Hi {name}!', { source: 'test', dedupeMs: 0, os: false });   // a sound test shouldn't also pop a desktop toast
  });

  onSecure('settings:save-pattern', (_e, i) => {
    const cfg = getCfg();
    if (!cfg) return;
    persist({ ...cfg, [d.pets.speciesOf(cfg.species).id === 'dog' ? 'dogPattern' : 'pattern']: i });
  });
  onSecure('settings:save-species', (_e, id) => {
    const cfg = getCfg();
    if (!cfg) return;
    const next = d.pets.SPECIES[id] ? id : 'cat';
    const patch = { ...cfg, species: next };
    if (next === 'dog' && !Number.isFinite(cfg.dogPattern)) patch.dogPattern = d.pets.defaultCoatIndex('dog');
    persist(patch);
  });
  onSecure('settings:action', (_e, id) => {
    if (!PET_ACTIONS.has(id)) return;
    d.sendAction(id);
  });

  handleSecure('email:passwordInfo', () => d.mail.passwordInfo());
  handleSecure('email:setPassword', (_e, pw) => d.mail.setPassword(pw));
  handleSecure('email:test', (_e, pw) => d.mail.test(getCfg(), pw && String(pw).length ? String(pw) : null));
  handleSecure('calendar:test', () => d.cal.test(getCfg()));

  handleSecure('settings:get', () => getCfg());
  handleSecure('app:version', () => d.appVersion());
  // Only ever runs when the user has turned update checks on (src/main/updater.js).
  handleSecure('updates:check-now', () => d.checkUpdates());
  handleSecure('settings:save', (_e, partial) => {
    // Reject anything that is not a small plain object before merging.
    // config.normalize is the real sanitizer; this caps the in-flight
    // allocation and drops junk payloads.
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return getCfg();
    const mine = Object.fromEntries(Object.entries(partial).filter(([key]) => !NOT_SETTINGS.has(key)));
    try { if (JSON.stringify(mine).length > MAX_SETTINGS_BYTES) return getCfg(); } catch (e) { return getCfg(); }
    persist({ ...getCfg(), ...mine });
    return getCfg();
  });

  const saveThemes = (list) => { d.setThemes(d.themes.save(list)); d.themesChanged(); };
  handleSecure('themes:get', () => d.getThemes());
  handleSecure('themes:add', (_e, t) => { saveThemes([...d.getThemes(), t]); return d.getThemes(); });
  handleSecure('themes:delete', (_e, name) => {
    const removed = d.getThemes().findIndex((x) => x.name === name);
    saveThemes(d.getThemes().filter((x) => x.name !== name));
    // Coat indices run built-ins first, custom coats after, so deleting one
    // shifts every coat below it up a slot. Re-anchor the cat's coat or it
    // quietly becomes whichever coat inherited the index.
    const cfg = getCfg();
    if (removed >= 0 && cfg) {
      const next = d.config.coatAfterThemeRemoval(cfg.pattern, removed);
      if (next !== cfg.pattern) persist({ ...cfg, pattern: next });
    }
    return d.getThemes();
  });
  handleSecure('themes:export', async () => {
    const r = await d.dialog.showSaveDialog(d.getDialogParent(), { title: 'Export custom coats', defaultPath: 'pixelpets-coats.json', filters: COATS_FILE_FILTER });
    if (r.canceled || !r.filePath) return false;
    try { fs.writeFileSync(r.filePath, JSON.stringify({ themes: d.getThemes() }, null, 2)); return true; } catch (e) { return false; }
  });
  handleSecure('themes:import', async () => {
    const r = await d.dialog.showOpenDialog(d.getDialogParent(), { title: 'Import custom coats', properties: ['openFile'], filters: COATS_FILE_FILTER });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return d.getThemes();
    try {
      const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^\uFEFF/, ''));
      const incoming = d.themes.clean(Array.isArray(data) ? data : (data && data.themes));
      const have = new Set(d.getThemes().map((t) => t.name.toLowerCase()));
      saveThemes(d.getThemes().concat(incoming.filter((t) => !have.has(t.name.toLowerCase()))));
    } catch (e) { /* ignore bad file */ }
    return d.getThemes();
  });
}

module.exports = { registerSettingsIpc, PET_ACTIONS };
