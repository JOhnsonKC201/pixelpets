// The clipboard text fixers: copied text in, tidied text out. Pure, so every
// rule here runs without Electron or a real clipboard.
const test = require('node:test');
const assert = require('node:assert');

const { apply, OPS, MAX_LEN } = require('../src/tools/textfix');

const text = (op, s) => apply(op, s).text;
// Built from code points so this file never holds an invisible character.
const NBSP = String.fromCodePoint(0xa0);
const ZERO_WIDTH = String.fromCodePoint(0x200b);
const BOM = String.fromCodePoint(0xfeff);

test('upper and lower change the case and nothing else', () => {
  assert.strictEqual(text('upper', 'Hello, wörld 42'), 'HELLO, WÖRLD 42');
  assert.strictEqual(text('lower', 'STOP SHOUTING, Élise'), 'stop shouting, élise');
});

test('title capitalises each word and leaves apostrophes inside a word alone', () => {
  assert.strictEqual(text('title', 'the QUICK brown fox'), 'The Quick Brown Fox');
  assert.strictEqual(text('title', "don't stop, it's fine"), "Don't Stop, It's Fine");
  assert.strictEqual(text('title', 'élan vital\nsecond line'), 'Élan Vital\nSecond Line');
  assert.strictEqual(text('title', 'a 3rd try (really)'), 'A 3rd Try (Really)');
  // An accent stored as its own combining character (macOS, some PDFs) is
  // still inside the word.
  const ACUTE = String.fromCodePoint(0x301);
  assert.strictEqual(text('title', `cafe${ACUTE}s au lait`), `Cafe${ACUTE}s Au Lait`);
});

test('one line joins the broken lines of a pasted paragraph', () => {
  assert.strictEqual(text('oneline', 'a line that\r\nwas wrapped   by\n\n  a PDF  '), 'a line that was wrapped by a PDF');
  assert.strictEqual(text('oneline', 'tabs\tand  spaces'), 'tabs and spaces');
});

test('plain drops invisible characters and trailing spaces, and keeps the lines', () => {
  assert.strictEqual(text('plain', `price:${NBSP}5${ZERO_WIDTH} eur  \nnext${BOM}`), 'price: 5 eur\nnext');
  assert.strictEqual(text('plain', 'kept\r\nas is'), 'kept\r\nas is');
  // Wide spaces from typeset and CJK text trail a line too.
  const WIDE = String.fromCodePoint(0x3000);
  const EM = String.fromCodePoint(0x2003);
  assert.strictEqual(text('plain', `a ${EM}\r\nb${WIDE}`), 'a\r\nb');
});

test('count reports words, characters and lines without changing the text', () => {
  const r = apply('count', 'one two\nthree 🙂');
  assert.deepStrictEqual(r, { ok: true, stats: { words: 4, chars: 15, lines: 2 } });
  assert.ok(!('text' in r));
  assert.strictEqual(apply('count', 'a\n').stats.lines, 1, 'a trailing line break is not another line');
  assert.strictEqual(apply('count', 'a\r\nb\r\n').stats.lines, 2);
});

test('nothing copied, too much copied and an unknown fixer are refused, not thrown', () => {
  for (const blank of ['', '   \n\t', null, undefined]) assert.deepStrictEqual(apply('upper', blank), { ok: false, reason: 'none' });
  assert.deepStrictEqual(apply('upper', 'x'.repeat(MAX_LEN + 1)), { ok: false, reason: 'big' });
  assert.strictEqual(apply('upper', 'x'.repeat(MAX_LEN)).ok, true);
  assert.deepStrictEqual(apply('constructor', 'abc'), { ok: false, reason: 'unknown' });
  assert.deepStrictEqual(apply('rot13', 'abc'), { ok: false, reason: 'unknown' });
});

test('the largest allowed input is handled in linear time by every fixer', () => {
  // One enormous run of spaces is the worst case for a backtracking regex, and
  // a fixer runs in the main process, where a stall freezes the pet.
  const worst = [`${' '.repeat(MAX_LEN - 1)}x`, `x${' '.repeat(MAX_LEN - 1)}`, 'a '.repeat(MAX_LEN / 2), "a'".repeat(MAX_LEN / 2)];
  for (const op of OPS) {
    for (const input of worst) {
      const started = process.hrtime.bigint();
      assert.strictEqual(apply(op, input).ok, true);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      assert.ok(ms < 1500, `${op} took ${Math.round(ms)}ms on ${MAX_LEN} characters`);
    }
  }
});

test('every listed fixer runs', () => {
  assert.deepStrictEqual(OPS, ['plain', 'upper', 'lower', 'title', 'oneline', 'count']);
  for (const op of OPS) assert.strictEqual(apply(op, 'Some Text').ok, true, op);
});
