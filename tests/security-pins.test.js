// Security properties that live in markup and wiring rather than in a function
// a test can call, pinned by reading the source.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const pages = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));

function cspOf(html) {
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

test('every page ships a strict content security policy', () => {
  assert.ok(pages.length >= 4, `expected the overlay, settings, launcher and report pages, found ${pages.join(', ')}`);
  for (const page of pages) {
    const csp = cspOf(read(page));
    assert.ok(csp, `${page} has no Content-Security-Policy`);
    assert.deepStrictEqual(csp['default-src'], ["'none'"], `${page}: default-src must be 'none'`);
    assert.deepStrictEqual(csp['script-src'], ["'self'"], `${page}: scripts only from the app itself, never inline or eval`);
    assert.deepStrictEqual(csp['base-uri'], ["'none'"], `${page}: base-uri must be 'none'`);
    assert.deepStrictEqual(csp['form-action'], ["'none'"], `${page}: form-action must be 'none'`);
    const remote = Object.values(csp).flat().filter((v) => /^(https?:|wss?:|\*)/.test(v));
    assert.deepStrictEqual(remote, [], `${page} allows a remote origin`);
  }
});

test('the contact-sheet export only exists in --sheet mode', () => {
  const main = read('main.js');
  assert.match(main, /if \(SHEET\) onSecure\('sheet:image'/,
    'sheet:image writes into the app folder and quits; a normal run must not listen for it');
});

test('the report window, like the launcher, is kept to its own channels', () => {
  const main = read('main.js');
  const wiring = /makeSecureIpc\(\{[\s\S]*?\n\}\);/.exec(main);
  assert.ok(wiring, 'main.js no longer builds its IPC guard with makeSecureIpc');
  assert.match(wiring[0], /hasOwnChannels:[^\n]*reportWin\.owns\(wc\)/);
});

test('every window is sandboxed with context isolation and no Node', () => {
  const files = ['main.js', 'report-window.js', path.join('tools', 'launcher-window.js'), path.join('main', 'reel-window.js')];
  for (const f of files) {
    const src = read(f);
    const prefs = [...src.matchAll(/webPreferences:\s*\{([^}]*)\}/g)].map((m) => m[1]);
    assert.ok(prefs.length > 0, `${f} builds no window with webPreferences`);
    for (const p of prefs) {
      assert.match(p, /contextIsolation:\s*true/, `${f}: contextIsolation`);
      assert.match(p, /nodeIntegration:\s*false/, `${f}: nodeIntegration`);
      assert.match(p, /sandbox:\s*true/, `${f}: sandbox`);
    }
  }
});

test('release builds cannot be run as plain Node or debugged from the command line', () => {
  const fuses = require('../package.json').build.electronFuses;
  assert.ok(fuses, 'package.json build.electronFuses is missing');
  assert.strictEqual(fuses.runAsNode, false);
  assert.strictEqual(fuses.enableNodeOptionsEnvironmentVariable, false);
  assert.strictEqual(fuses.enableNodeCliInspectArguments, false);
  assert.strictEqual(fuses.onlyLoadAppFromAsar, true);
  assert.strictEqual(fuses.enableEmbeddedAsarIntegrityValidation, true);
  // Must stay ON while pages load with loadFile: with it off, file:// cannot read
  // inside app.asar and the packaged overlay fails with ERR_FILE_NOT_FOUND (the
  // packaged-boot CI job showed this on Windows and macOS). Turning it off needs
  // a custom protocol for the app's own pages first.
  assert.strictEqual(fuses.grantFileProtocolExtraPrivileges, true);
});

test('nothing relies on running the app binary as Node', () => {
  // The RunAsNode fuse is off, so ELECTRON_RUN_AS_NODE does nothing in a
  // release build. Workers go through utilityProcess (worker-host.js).
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js') && /ELECTRON_RUN_AS_NODE['"]?\s*:/.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(SRC, full));
    }
  };
  walk(SRC);
  assert.deepStrictEqual(offenders, []);
});
