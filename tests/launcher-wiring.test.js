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

test('main refuses the launcher on every general channel', () => {
  const main = codeOnly(read('main.js'));
  const trusted = /function isTrustedSender[\s\S]*?\n}/.exec(main)[0];
  const refusal = trusted.indexOf('tools.ownsSender(wc)) return false');
  const fallback = trusted.indexOf("startsWith('file:')");
  assert.ok(refusal > 0, 'isTrustedSender must refuse the launcher');
  assert.ok(refusal < fallback, 'the refusal must come before the file:// fallback');
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
  const r = codeOnly(read('renderer.js'));
  const block = /addEventListener\('contextmenu'[\s\S]*?\n}\);/.exec(r)[0];
  assert.match(block, /e\.shiftKey/);
  assert.match(block, /cycleCoat\(\)/);
  assert.match(block, /openLauncher\(\)/);
});
