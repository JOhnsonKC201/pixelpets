// themes.json on disk: the user's own coat designs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const themes = require('../src/themes');

const GALAXY = { name: 'Galaxy', build: 'fluffy', tabby: false, coat: '#3b2f63', mark: '#2a2147', white: '#c9c0e8', patch: '#7a5cc0', eye: '#7fd6ff', nose: '#e0a0c0', inner: '#9a7ad0', outline: '#15101f' };

function tempFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-themes-'));
  const file = path.join(dir, 'themes.json');
  if (contents !== undefined) fs.writeFileSync(file, contents);
  return { dir, file };
}

test('coats round-trip through the file', () => {
  const { dir, file } = tempFile();
  themes.save([GALAXY], file);
  assert.deepStrictEqual(themes.load(file).map((t) => t.name), ['Galaxy']);
  assert.deepStrictEqual(fs.readdirSync(dir), ['themes.json'], 'no temp file left behind');
});

test('a corrupt file is kept, so the next save cannot erase the coats in it', () => {
  const broken = JSON.stringify({ themes: [GALAXY] }).slice(0, -3);
  const { dir, file } = tempFile(broken);
  assert.deepStrictEqual(themes.load(file), []);
  themes.save([{ ...GALAXY, name: 'Nebula' }], file);   // the user adds a coat afterwards
  const copies = fs.readdirSync(dir).filter((f) => f.startsWith('themes.json.corrupt-'));
  assert.strictEqual(copies.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, copies[0]), 'utf8'), broken);
});

test('launching again over the same corrupt file does not pile up copies', () => {
  const { dir, file } = tempFile('{"themes": [');
  for (let launch = 0; launch < 5; launch++) themes.load(file);
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.startsWith('themes.json.corrupt-')).length, 1);
  fs.writeFileSync(file, '{"themes": [{');   // corrupt in a different way: worth its own copy
  themes.load(file);
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.startsWith('themes.json.corrupt-')).length, 2);
});

test('no file means no custom coats yet, and nothing is written', () => {
  const { dir, file } = tempFile();
  assert.deepStrictEqual(themes.load(file), []);
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});
