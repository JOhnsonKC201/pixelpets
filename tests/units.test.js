// "5 km in mi" in the launcher. The conversions are table-driven, so these tests
// check the table's shape (aliases, categories, decimal vs binary data sizes) and
// the one non-linear case, temperature.
const test = require('node:test');
const assert = require('node:assert');

const { convert, parseConversion } = require('../src/tools/units');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('length, mass and volume', () => {
  near(convert(5, 'km', 'mi').value, 3.10685596118667);
  near(convert(1, 'ft', 'in').value, 12);
  near(convert(1, 'kg', 'lb').value, 2.20462262184878);
  near(convert(1, 'gal', 'l').value, 3.785411784);
  near(convert(100, 'cm', 'm').value, 1);
});

test('temperature round-trips', () => {
  near(convert(72, 'f', 'c').value, 22.2222222222222);
  near(convert(100, 'c', 'f').value, 212);
  near(convert(0, 'c', 'k').value, 273.15);
  near(convert(convert(37, 'c', 'f').value, 'f', 'c').value, 37);
});

test('data sizes keep decimal and binary apart', () => {
  near(convert(1, 'GB', 'MB').value, 1000);
  near(convert(1, 'GiB', 'MiB').value, 1024);
  near(convert(3, 'GB', 'MiB').value, 3e9 / 1048576);
});

test('aliases and plurals resolve to the same unit', () => {
  for (const alias of ['km', 'kilometer', 'kilometers', 'kilometre', 'KM']) {
    near(convert(1, alias, 'm').value, 1000);
  }
  near(convert(2, 'hours', 'min').value, 120);
  near(convert(60, 'mph', 'km/h').value, 96.56064);
});

test('conversions across categories, or with unknown units, return null', () => {
  assert.strictEqual(convert(1, 'km', 'kg'), null);
  assert.strictEqual(convert(1, 'c', 'm'), null);
  assert.strictEqual(convert(1, 'parsec', 'm'), null);
  assert.strictEqual(convert(1, 'constructor', 'm'), null);
  assert.strictEqual(convert(Infinity, 'km', 'm'), null);
});

test('parseConversion reads the phrasings people type', () => {
  assert.deepStrictEqual(parseConversion('5 km in mi'), { n: 5, from: 'km', to: 'mi' });
  assert.deepStrictEqual(parseConversion('72f to c'), { n: 72, from: 'f', to: 'c' });
  assert.deepStrictEqual(parseConversion('-3.5 C to F'), { n: -3.5, from: 'C', to: 'F' });
  assert.deepStrictEqual(parseConversion('60 km/h in mph'), { n: 60, from: 'km/h', to: 'mph' });
  assert.strictEqual(parseConversion('buy milk in town'), null);
  assert.strictEqual(parseConversion('5 km'), null);
});
