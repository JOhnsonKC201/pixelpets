// The agent-status and notify bridges are each a filename in %TEMP% written by one
// file and read by another, with no shared constant between them. Nothing at runtime
// notices when the two sides disagree: the writer still reports success, it just
// writes to a file the app never opens, and the pet goes quiet.
//
// The suite could not catch that either, because the existing tests restate the
// literal a third time instead of asking main.js what it listens on. So renaming one
// side during, say, a rebrand would leave every test green and the feature dead.
//
// These read the names out of the sources and compare them, so a drift fails here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Pull the filename out of `path.join(os.tmpdir(), '<name>')`.
const TMPFILE = /os\.tmpdir\(\)\s*,\s*['"]([^'"]+)['"]/g;
function tmpNames(rel) {
  return [...src(rel).matchAll(TMPFILE)].map((m) => m[1]);
}
// ...or out of a specific `const NAME = path.join(os.tmpdir(), '<name>')`.
function constTmpName(rel, constName) {
  const m = new RegExp(`const\\s+${constName}\\s*=\\s*path\\.join\\(\\s*os\\.tmpdir\\(\\)\\s*,\\s*['"]([^'"]+)['"]`).exec(src(rel));
  assert.ok(m, `expected src/main/bridge.js to define ${constName} as a file in os.tmpdir()`);
  return m[1];
}

test('the agent hook writes the file main.js watches', () => {
  const watched = constTmpName('src/main/bridge.js', 'AGENT_FILE');
  const written = tmpNames('agent-hook.js');

  assert.deepStrictEqual(written, [watched],
    'agent-hook.js must write exactly the file main.js watches, or installed hooks go nowhere');
});

test('notify.js appends to the file main.js reads', () => {
  const watched = constTmpName('src/main/bridge.js', 'NOTIFY_FILE');
  const written = tmpNames('scripts/notify.js');

  assert.deepStrictEqual(written, [watched],
    'scripts/notify.js must append to the file main.js reads, or messages vanish');
});

test('the bridge filenames stay frozen at the published names', () => {
  // These went out in v0.2.0 and are pasted into user-side hook configs and CI
  // scripts that this repo cannot reach in and update. Renaming them to match the
  // pixelpets rebrand would break every existing installation, so pin them: a
  // deliberate change has to come here and read the reasoning first.
  assert.strictEqual(constTmpName('src/main/bridge.js', 'AGENT_FILE'), 'pixelcat-agent.state');
  assert.strictEqual(constTmpName('src/main/bridge.js', 'NOTIFY_FILE'), 'pixelcat-notify.jsonl');
});

test('the Windows app identity stays frozen too', () => {
  // On Windows this doubles as the toast identity, the name of the HKCU..\\Run value
  // Electron writes for autostart, and the key NSIS matches to upgrade in place.
  // Renaming it strands the old autostart entry and turns an upgrade into a second
  // parallel install, so it is pinned on purpose despite naming a cat.
  assert.match(src('src/main.js'), /setAppUserModelId\('com\.johnsonkc\.pixelcat'\)/);
  const pkg = JSON.parse(src('package.json'));
  assert.strictEqual(pkg.build.appId, 'com.johnsonkc.pixelcat',
    'the installer appId must match the app user model id, or NSIS installs alongside the old copy');
});

test('the docs quote the same bridge paths the code uses', () => {
  // The docs are how anyone sets these hooks up, so a stale path there sends people
  // to a file nothing reads. Which page carries which path may move as the docs are
  // reorganised; what must not happen is a path going undocumented, or documented
  // wrong, so this asserts over the whole user-facing set rather than one file.
  const PAGES = ['README.md', 'docs/features.md', 'integrations/README.md'];
  const docs = PAGES.map((p) => [p, src(p)]);
  for (const name of [constTmpName('src/main/bridge.js', 'AGENT_FILE'), constTmpName('src/main/bridge.js', 'NOTIFY_FILE')]) {
    assert.ok(docs.some(([, text]) => text.includes(name)),
      `the bridge path ${name} is documented nowhere in ${PAGES.join(', ')}`);
  }
  // A page that names the wrong file is worse than one that stays quiet.
  const STALE = /%TEMP%\/([\w.-]+\.(?:state|jsonl))/g;
  const live = [constTmpName('src/main/bridge.js', 'AGENT_FILE'), constTmpName('src/main/bridge.js', 'NOTIFY_FILE')];
  for (const [page, text] of docs) {
    for (const m of text.matchAll(STALE)) {
      assert.ok(live.includes(m[1]), `${page} documents ${m[1]}, which nothing reads`);
    }
  }
});
