// The pixelcat -> pixelpets rename moved app.getPath('userData'), so an upgrade
// would have read an empty directory and looked like a factory reset. These drive
// src/datadir.js against real temp directories - no Electron, no mocked fs, so a
// pass means actual bytes moved.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const datadir = require('../src/datadir');

let seq = 0;
// A fresh old/new pair per case, so one test cannot see another's marker.
function dirs() {
  seq += 1;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `pixelpets-migrate-${seq}-`));
  const fromDir = path.join(base, 'pixelcat');
  const toDir = path.join(base, 'pixelpets');
  fs.mkdirSync(fromDir, { recursive: true });
  return { base, fromDir, toDir };
}
const write = (dir, name, body) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
};
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
const has = (dir, name) => fs.existsSync(path.join(dir, name));

test('an upgrade carries the old data directory across', () => {
  const { fromDir, toDir } = dirs();
  write(fromDir, 'settings.json', '{"name":"Mochi"}');
  write(fromDir, 'themes.json', '[{"name":"custom"}]');
  write(fromDir, 'email.cred', 'encrypted-bytes');
  write(fromDir, 'notify-history.json', '[]');
  write(fromDir, 'notes.md', '# Quick notes\n');

  const report = datadir.migrate({ fromDir, toDir });

  assert.strictEqual(report.ran, true);
  assert.deepStrictEqual(report.copied.sort(), datadir.DATA_FILES.slice().sort());
  assert.strictEqual(read(toDir, 'settings.json'), '{"name":"Mochi"}',
    'the pet should keep its name across the rename');
  // The one file the user cannot recreate by hand: it is an app-password encrypted
  // with safeStorage, so losing it silently disconnects their mailbox.
  assert.strictEqual(read(toDir, 'email.cred'), 'encrypted-bytes');
});

test('nothing already in the new directory is overwritten', () => {
  const { fromDir, toDir } = dirs();
  write(fromDir, 'settings.json', '{"name":"old"}');
  write(fromDir, 'email.cred', 'old-cred');
  write(toDir, 'settings.json', '{"name":"new"}');

  const report = datadir.migrate({ fromDir, toDir });

  assert.strictEqual(read(toDir, 'settings.json'), '{"name":"new"}',
    'settings written under the new name win over the legacy copy');
  assert.deepStrictEqual(report.kept, ['settings.json']);
  assert.deepStrictEqual(report.copied, ['email.cred'], 'the missing file still comes across');
  assert.strictEqual(read(fromDir, 'settings.json'), '{"name":"old"}', 'the old directory is left intact');
});

test('a migrated file the user deletes on purpose stays deleted', () => {
  const { fromDir, toDir } = dirs();
  write(fromDir, 'email.cred', 'encrypted-bytes');

  datadir.migrate({ fromDir, toDir });
  assert.ok(has(toDir, 'email.cred'));

  // Disconnecting email removes the credential. Without the marker, the next launch
  // would helpfully copy it back and silently reconnect their mailbox.
  fs.unlinkSync(path.join(toDir, 'email.cred'));
  const second = datadir.migrate({ fromDir, toDir });

  assert.strictEqual(second.ran, false, 'a completed migration never runs again');
  assert.strictEqual(has(toDir, 'email.cred'), false);
});

test('a clean install does no work and claims nothing', () => {
  const { base, toDir } = dirs();
  const report = datadir.migrate({ fromDir: path.join(base, 'never-existed'), toDir });

  assert.strictEqual(report.ran, false);
  assert.deepStrictEqual(report.copied, []);
  assert.strictEqual(has(toDir, datadir.MARKER), false,
    'no marker, so data appearing under the old name later is still picked up');
});

test('a failed copy is retried on the next launch', () => {
  const { fromDir, toDir } = dirs();
  write(fromDir, 'settings.json', '{"name":"Mochi"}');
  // A directory where a file is expected makes copyFileSync fail the same way a
  // locked file does, without depending on platform permission semantics.
  fs.mkdirSync(path.join(fromDir, 'email.cred'));

  const first = datadir.migrate({ fromDir, toDir });
  assert.deepStrictEqual(first.copied, ['settings.json'], 'the healthy file still lands');
  assert.strictEqual(first.failed.length, 1);
  assert.strictEqual(has(toDir, datadir.MARKER), false, 'a partial run must not mark itself done');
  assert.strictEqual(has(toDir, 'email.cred.migrating'), false, 'no half-written temp file left behind');

  // Once the obstruction clears, the retry picks up exactly what was missed.
  fs.rmSync(path.join(fromDir, 'email.cred'), { recursive: true });
  write(fromDir, 'email.cred', 'encrypted-bytes');
  const second = datadir.migrate({ fromDir, toDir });

  assert.deepStrictEqual(second.copied, ['email.cred']);
  assert.deepStrictEqual(second.kept, ['settings.json']);
  assert.ok(has(toDir, datadir.MARKER), 'a clean run closes the door');
});

test('migrating a directory onto itself is refused', () => {
  const { fromDir } = dirs();
  write(fromDir, 'settings.json', '{"name":"Mochi"}');

  const report = datadir.migrate({ fromDir, toDir: path.join(fromDir, '.', '') });

  assert.strictEqual(report.ran, false);
  assert.strictEqual(read(fromDir, 'settings.json'), '{"name":"Mochi"}');
  assert.strictEqual(has(fromDir, datadir.MARKER), false);
});

test('the legacy directory sits beside userData, not inside it', () => {
  // getPath('appData') is the parent both names live under (%APPDATA%,
  // ~/Library/Application Support, ~/.config).
  const app = { getPath: (k) => (k === 'appData' ? path.join('/base', 'AppData') : path.join('/base', 'AppData', 'pixelpets')) };
  assert.strictEqual(datadir.legacyDir(app), path.join('/base', 'AppData', 'pixelcat'));
});

test('every persisted file is covered by the migration list', () => {
  // If a new store lands in src/ and forgets to register here, its data quietly
  // fails to migrate. Catch that by reading the sources rather than trusting memory.
  const srcDir = path.join(__dirname, '..', 'src');
  const referenced = new Set();
  // Recursive: stores live in subfolders too (src/tools/ keeps notes.md), and a
  // top-level-only scan silently missed them.
  const sources = fs.readdirSync(srcDir, { recursive: true }).filter((n) => String(n).endsWith('.js'));
  for (const f of sources) {
    const body = fs.readFileSync(path.join(srcDir, f), 'utf8');
    // path.join(app.getPath('userData'), 'something.json')
    const re = /getPath\(\s*['"]userData['"]\s*\)\s*,\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(body))) referenced.add(m[1]);
  }
  assert.ok(referenced.size > 0, 'expected to find userData readers in src/');
  // Deliberately NOT migrated. These are per-INSTALL markers, not user data, and
  // carrying one across the rename would be a bug rather than a fix:
  //   .autostart-set records that we have already made the launch-at-login decision
  //   for this bundle. On macOS the login item is registered per app bundle, so a
  //   renamed install genuinely needs to make that decision again - migrating the
  //   marker would leave the new bundle never registered and autostart silently dead.
  //   logs/ is the diagnostic log (logger.js). It postdates the rename, holds
  //   nothing a person made, and rotates itself away anyway.
  const NOT_USER_DATA = new Set(['.autostart-set', 'logs']);
  for (const name of referenced) {
    if (NOT_USER_DATA.has(name)) {
      assert.ok(!datadir.DATA_FILES.includes(name),
        `${name} is a per-install marker and must NOT be in DATA_FILES`);
      continue;
    }
    assert.ok(datadir.DATA_FILES.includes(name),
      `${name} is stored in userData but is missing from datadir.DATA_FILES, so it would not survive the rename`);
  }
});
