const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeAutostart } = require('../src/main/autostart');

function fakeApp({ isPackaged = true } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-autostart-'));
  const calls = [];
  return {
    calls, userData, isPackaged,
    getPath: () => userData,
    setLoginItemSettings: (o) => calls.push(o),
  };
}

test('Windows registers the app folder as the launch argument', () => {
  const app = fakeApp();
  makeAutostart({ app, appDir: 'C:\\pixelpets', platform: 'win32', execPath: 'C:\\electron.exe' }).set(true);
  assert.deepStrictEqual(app.calls, [{ openAtLogin: true, path: 'C:\\electron.exe', args: ['C:\\pixelpets'] }]);
});

test('Windows turning it off drops the argument', () => {
  const app = fakeApp();
  makeAutostart({ app, appDir: 'x', platform: 'win32', execPath: 'e' }).set(false);
  assert.deepStrictEqual(app.calls, [{ openAtLogin: false, path: 'e', args: [] }]);
});

test('macOS from source never registers Electron itself', () => {
  const app = fakeApp({ isPackaged: false });
  makeAutostart({ app, appDir: 'x', platform: 'darwin' }).set(true);
  assert.deepStrictEqual(app.calls, []);
});

test('macOS asks once, then leaves the login item to the user', () => {
  const app = fakeApp();
  const a = makeAutostart({ app, appDir: 'x', platform: 'darwin' });
  assert.strictEqual(a.applyOnLaunch([]), false);
  assert.strictEqual(a.applyOnLaunch([]), false);
  assert.deepStrictEqual(app.calls, [{ openAtLogin: true }], 'only the first launch touches it');
});

test('--autostart=off turns it off and asks the caller to quit', () => {
  const app = fakeApp();
  const a = makeAutostart({ app, appDir: 'x', platform: 'win32', execPath: 'e' });
  assert.strictEqual(a.applyOnLaunch(['--autostart=off']), true);
  assert.deepStrictEqual(app.calls, [{ openAtLogin: false, path: 'e', args: [] }]);
});
