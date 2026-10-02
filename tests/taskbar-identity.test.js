// The taskbar icon when the app is run from source on Windows. Nothing here boots
// Electron: the decision of what to change on the shortcut is a pure function.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { APP_ID, ICON, shortcutFix } = require('../src/main/taskbar-identity.js');

const ROOT = path.join(__dirname, '..');
// The shortcut as Electron leaves it: the app's id, electron.exe's own icon.
const electrons = { appUserModelId: APP_ID, target: 'C:/x/electron.exe', icon: '', iconIndex: 0 };
const dev = { platform: 'win32', isPackaged: false, link: electrons };

test("Electron's shortcut for this app is given the mascot", () => {
  assert.deepEqual(shortcutFix(dev), { icon: ICON, iconIndex: 0 });
  assert.ok(fs.existsSync(ICON), 'the taskbar icon points at a file that does not exist');
  assert.ok(ICON.endsWith('.ico'), 'the shell reads an .ico here, not a png');
});

test('only the icon changes, so the target and the id Electron wrote survive', () => {
  assert.deepEqual(Object.keys(shortcutFix(dev)).sort(), ['icon', 'iconIndex']);
});

test('a shortcut that belongs to another Electron project is not touched', () => {
  // Every Electron app run from source uses the same file name.
  assert.equal(shortcutFix({ ...dev, link: { ...electrons, appUserModelId: 'com.someone.else' } }), null);
  assert.equal(shortcutFix({ ...dev, link: { ...electrons, appUserModelId: undefined } }), null);
});

test('a shortcut that already has the mascot is not rewritten on every start', () => {
  assert.equal(shortcutFix({ ...dev, link: { ...electrons, icon: ICON, iconIndex: 0 } }), null);
});

test('an installed build, other platforms and a missing shortcut are left alone', () => {
  assert.equal(shortcutFix({ ...dev, isPackaged: true }), null);
  assert.equal(shortcutFix({ ...dev, platform: 'darwin' }), null);
  assert.equal(shortcutFix({ ...dev, platform: 'linux' }), null);
  assert.equal(shortcutFix({ ...dev, link: null }), null);
});

test('the shortcut is matched on the id the rest of the app uses', () => {
  // Three copies of one string. If main.js moved to another id, this would go on
  // fixing a shortcut the taskbar no longer reads.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.equal(pkg.build.appId, APP_ID);
  assert.ok(main.includes(`setAppUserModelId('${APP_ID}')`), 'main.js sets a different app id');
  assert.match(main, /fixDevTaskbarIcon\(\)/, 'main.js never runs the fix');
});
