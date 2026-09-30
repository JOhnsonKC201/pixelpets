// settings.json on disk: first run, corrupt files, older and newer formats.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../src/config');

function tempFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-config-'));
  const file = path.join(dir, 'settings.json');
  if (contents !== undefined) fs.writeFileSync(file, contents);
  return { dir, file };
}
const siblings = (dir) => fs.readdirSync(dir).sort();

test('first run writes defaults, stamped with the schema version', () => {
  const { file } = tempFile();
  const cfg = config.load(file);
  assert.strictEqual(cfg.schemaVersion, config.SCHEMA_VERSION);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion, config.SCHEMA_VERSION);
});

test('a corrupt file is kept beside the fresh defaults, not thrown away', () => {
  const broken = '{"name":"Mochi","reminders":[{"hhmm":"09:00"';
  const { dir, file } = tempFile(broken);
  const cfg = config.load(file);
  assert.strictEqual(cfg.name, '');
  const copies = siblings(dir).filter((f) => f.startsWith('settings.json.corrupt-'));
  assert.strictEqual(copies.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, copies[0]), 'utf8'), broken);
});

test('a file from before versioning loads as it always did', () => {
  const { file } = tempFile(JSON.stringify({ name: 'Mochi', soundOn: false }));
  const cfg = config.load(file);
  assert.strictEqual(cfg.name, 'Mochi');
  assert.strictEqual(cfg.soundOn, false);
  assert.strictEqual(cfg.schemaVersion, config.SCHEMA_VERSION);
});

test('a file from a newer build is backed up before this build can overwrite it', () => {
  const newer = JSON.stringify({ schemaVersion: config.SCHEMA_VERSION + 1, name: 'Mochi', someFutureSetting: { on: true } });
  const { dir, file } = tempFile(newer);
  const cfg = config.load(file);
  assert.strictEqual(cfg.name, 'Mochi', 'known settings still load');
  const backup = path.join(dir, `settings.json.v${config.SCHEMA_VERSION + 1}.bak`);
  assert.strictEqual(fs.readFileSync(backup, 'utf8'), newer);
  // Loading again must not replace the backup with a later, already-trimmed copy.
  config.save(cfg, file);
  config.load(file);
  assert.strictEqual(fs.readFileSync(backup, 'utf8'), newer);
});

test('save is atomic and leaves no temp file behind', () => {
  const { dir, file } = tempFile();
  config.save({ name: 'Mochi' }, file);
  assert.deepStrictEqual(siblings(dir), ['settings.json']);
  assert.strictEqual(config.load(file).name, 'Mochi');
});

test('a byte-order mark from a text editor does not count as corruption', () => {
  const { dir, file } = tempFile(String.fromCodePoint(0xFEFF) + JSON.stringify({ name: 'Mochi' }));
  assert.strictEqual(config.load(file).name, 'Mochi');
  assert.deepStrictEqual(siblings(dir), ['settings.json']);
});
