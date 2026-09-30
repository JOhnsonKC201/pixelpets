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
