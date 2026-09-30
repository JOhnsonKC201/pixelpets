const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { makeUpdater, updateMode, RELEASES } = require('../src/main/updater');

const on = (channel = 'stable') => ({ updates: { check: true, channel } });

test('nothing happens unless the user turned checks on', () => {
  assert.strictEqual(updateMode({ cfg: {}, isPackaged: true, platform: 'win32' }), 'off');
  assert.strictEqual(updateMode({ cfg: { updates: { check: 'yes' } }, isPackaged: true, platform: 'win32' }), 'off');
  assert.strictEqual(updateMode({ cfg: null, isPackaged: true, platform: 'win32' }), 'off');
});

test('Windows installs, macOS only tells, a source checkout does neither', () => {
  assert.strictEqual(updateMode({ cfg: on(), isPackaged: true, platform: 'win32' }), 'install');
  assert.strictEqual(updateMode({ cfg: on(), isPackaged: true, platform: 'darwin' }), 'notify');
  assert.strictEqual(updateMode({ cfg: on(), isPackaged: false, platform: 'win32' }), 'dev');
});

// An updater over a fake electron-updater and a hand-driven timer.
function setup({ cfg = on(), platform = 'win32', isPackaged = true, result } = {}) {
  const fake = Object.assign(new EventEmitter(), {
    checks: 0, installed: false,
    async checkForUpdates() { this.checks += 1; return result || { isUpdateAvailable: false, updateInfo: { version: '0.4.0' } }; },
    quitAndInstall() { this.installed = true; },
  });
  let requires = 0;
  const state = { cfg, timers: [], notes: [], opened: [], changes: 0, warns: [] };
  const u = makeUpdater({
    getUpdater: () => { requires += 1; return fake; },
    isPackaged, platform,
    getCfg: () => state.cfg,
    notify: (m) => state.notes.push(m),
    log: { info() {}, warn: (m) => state.warns.push(m) },
    openExternal: (url) => state.opened.push(url),
    onChange: () => { state.changes += 1; },
    setTimer: (fn, ms) => { const t = { fn, ms }; state.timers.push(t); return t; },
    clearTimer: (t) => { state.timers = state.timers.filter((x) => x !== t); },
  });
  return { u, fake, state, requires: () => requires };
}

test('with checks off, electron-updater is never even loaded', async () => {
  const { u, state, requires } = setup({ cfg: {} });
  u.sync();
  assert.strictEqual(requires(), 0);
  assert.deepStrictEqual(state.timers, []);
  assert.deepStrictEqual(await u.checkNow(), { status: 'off' });
});

test('turning checks on schedules a first check, then one every six hours', async () => {
  const { u, fake, state } = setup();
  u.sync();
  assert.strictEqual(state.timers.length, 1);
  assert.strictEqual(state.timers[0].ms, 30 * 1000);
  await state.timers.shift().fn();
  assert.strictEqual(fake.checks, 1);
  assert.strictEqual(state.timers[0].ms, 6 * 60 * 60 * 1000);
});

test('turning checks off again cancels what was scheduled', () => {
  const { u, state } = setup();
  u.sync();
  state.cfg = {};
  u.sync();
  assert.deepStrictEqual(state.timers, []);
});

test('Windows downloads, says so once, and offers a restart', () => {
  const { u, fake, state } = setup();
  u.sync();
  assert.strictEqual(fake.autoDownload, true);
  fake.emit('update-downloaded', { version: '0.5.0' });
  fake.emit('update-downloaded', { version: '0.5.0' });
  assert.strictEqual(state.notes.length, 1);
  assert.match(state.notes[0], /0\.5\.0 is ready/);
  const [item] = u.trayItems();
  assert.strictEqual(item.label, 'Restart to update to 0.5.0');
  item.click();
  assert.strictEqual(fake.installed, true);
});

test('macOS never downloads; it points at the release page', () => {
  const { u, fake, state } = setup({ platform: 'darwin' });
  u.sync();
  assert.strictEqual(fake.autoDownload, false);
  fake.emit('update-available', { version: '0.5.0' });
  assert.match(state.notes[0], /0\.5\.0 is out/);
  const [item] = u.trayItems();
  assert.strictEqual(item.label, 'Download 0.5.0');
  item.click();
  assert.deepStrictEqual(state.opened, [`${RELEASES}/tag/v0.5.0`]);
});

test('the beta channel takes pre-releases, stable does not', () => {
  const beta = setup({ cfg: on('beta') });
  beta.u.sync();
  assert.strictEqual(beta.fake.allowPrerelease, true);
  const stable = setup({ cfg: on('stable') });
  stable.u.sync();
  assert.strictEqual(stable.fake.allowPrerelease, false);
});

test('Check now reports what it found', async () => {
  const { u } = setup({ result: { isUpdateAvailable: true, updateInfo: { version: '0.5.0' } } });
  u.sync();
  assert.deepStrictEqual(await u.checkNow(), { status: 'available', version: '0.5.0' });
  assert.deepStrictEqual(await setup().u.checkNow(), { status: 'off' }, 'not synced yet: nothing runs');
});

test('a failed check is logged, not shown to the user', async () => {
  const { u, fake, state } = setup();
  fake.checkForUpdates = async () => { throw new Error('offline'); };
  u.sync();
  assert.deepStrictEqual(await u.checkNow(), { status: 'error' });
  assert.deepStrictEqual(state.notes, []);
  assert.deepStrictEqual(state.warns, ['update check failed']);
});

test('a source checkout says so instead of checking', async () => {
  const { u, requires } = setup({ isPackaged: false });
  u.sync();
  assert.deepStrictEqual(await u.checkNow(), { status: 'dev' });
  assert.strictEqual(requires(), 0);
});

test('update checks ship off, and only an explicit true turns them on', () => {
  const { normalize, DEFAULTS } = require('../src/config');
  assert.strictEqual(DEFAULTS.updates.check, false);
  assert.strictEqual(normalize({}).updates.check, false);
  assert.strictEqual(normalize({ updates: { check: 1 } }).updates.check, false);
  assert.strictEqual(normalize({ updates: { check: true } }).updates.check, true);
});
