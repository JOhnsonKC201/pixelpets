// Static checks for the Quick Tools wiring. Nothing here boots Electron: these are
// the properties that keep the one window that takes free typing boxed in, and
// they are exactly the kind that drift silently when someone edits one file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('the launcher page has a strict CSP and renders text, never HTML', () => {
  const html = read('launcher.html');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline'[^;]*script/);
  const js = codeOnly(read('launcher-renderer.js'));
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});

test('every element id the launcher script uses exists in the page', () => {
  const html = read('launcher.html');
  const ids = [...codeOnly(read('launcher-renderer.js')).matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('the launcher can only send a query and an index, never an action', () => {
  const preload = codeOnly(read('launcher-preload.js'));
  const channels = [...preload.matchAll(/ipcRenderer\.(?:invoke|send)\('([\w:]+)'/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(channels, ['launcher:hide', 'launcher:resize', 'launcher:run', 'launcher:suggest']);
});

test('every suggest() result that crosses IPC is awaited (a Promise cannot be cloned)', () => {
  const index = codeOnly(read('tools', 'index.js'));
  assert.match(index, /async function display/, 'display() is async, so suggest() returns a Promise');
  const calls = [...index.matchAll(/(await\s+)?suggest\(q\)/g)];
  const inReturns = calls.filter((m) => index.slice(Math.max(0, m.index - 40), m.index).includes('list:'));
  assert.ok(inReturns.length > 0);
  for (const m of inReturns) assert.ok(m[1], 'a refreshed list sent back to the launcher must be awaited');
});

test('main refuses the launcher on every general channel', () => {
  // secure-ipc.js refuses any window that has its own channels before the
  // file:// fallback (tests/secure-ipc.test.js). What is left to pin here is
  // that main.js tells it the launcher is one of those windows.
  const main = codeOnly(read('main.js'));
  const wiring = /makeSecureIpc\(\{[\s\S]*?\n\}\);/.exec(main);
  assert.ok(wiring, 'main.js no longer builds its IPC guard with makeSecureIpc');
  assert.match(wiring[0], /hasOwnChannels:[^\n]*tools\.ownsSender\(wc\)/, 'the launcher must be listed as a window with its own channels');
});

test('only system.js spawns processes or opens things, and never through a shell', () => {
  const dir = path.join(SRC, 'tools');
  for (const f of fs.readdirSync(dir)) {
    const js = codeOnly(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.doesNotMatch(js, /(?<!\.)\bexec\(|execSync|\bspawn\(|shell:\s*true|\beval\(|new Function/, f);
    if (f !== 'system.js') assert.doesNotMatch(js, /shell\.(openExternal|openPath)|execFile/, f);
  }
});

test('right-click still reaches the coat cycle on Shift', () => {
  const r = codeOnly(require('../src/overlay/parts').readOverlaySource());
  const block = /addEventListener\('contextmenu'[\s\S]*?\n}\);/.exec(r)[0];
  assert.match(block, /e\.shiftKey/);
  assert.match(block, /cycleCoat\(\)/);
  assert.match(block, /openLauncher\(\)/);
});

test('every icon the router asks for is drawn, and icons are built as DOM, not markup', () => {
  const icons = read('launcher-icons.js');
  const shapes = /const SHAPES = \{([\s\S]*?)\n {2}\};/.exec(icons)[1];
  const have = new Set([...shapes.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
  const { suggest } = require('../src/tools/commands');
  const ctx = {
    platform: 'win32', search: 'google', keepAwake: false, clipboardOn: true, now: 0,
    shortcuts: [{ id: 's1', label: 'a', target: 'https://a.com/' }, { id: 's2', label: 'b', target: 'C:\\b' },
      { id: 's3', label: 'c', target: 'C:\\c.exe' }, { id: 's4', label: 'd', target: 'C:\\d.pdf' }, { id: 's5', label: 'e', target: 'mailto:e@x.y' }],
    todos: { day: '', items: [{ id: 't1', text: 'x', done: false }], nudged: '' },
    timers: [{ id: 'tm1', endsAt: 1000, label: 't' }], clips: ['clip'],
  };
  const used = new Set();
  for (const q of ['', '?', 'text', '=1+1', '5 km in mi', 'g x', 'note x', 'todo x', 'done 1', '10m', 'clip', '=bad', 'zzqq']) {
    for (const r of suggest(q, ctx)) used.add(r.icon);
  }
  for (const id of used) assert.ok(have.has(id), `icon "${id}" is missing from launcher-icons.js`);
  assert.doesNotMatch(codeOnly(icons), /innerHTML|insertAdjacentHTML/);
  assert.match(icons, /createElementNS/);
});

test('the launcher only asks the OS for glass where the OS can draw it', () => {
  const { glassFor } = require('../src/tools/glass');
  assert.strictEqual(glassFor('win32', '10.0.26200'), 'acrylic');
  assert.strictEqual(glassFor('win32', '10.0.22621'), 'acrylic');
  assert.strictEqual(glassFor('win32', '10.0.19045'), null, 'Windows 10 gets the solid panel');
  assert.strictEqual(glassFor('darwin', '23.0.0'), 'vibrancy');
  assert.strictEqual(glassFor('linux', '6.1'), null);
});
