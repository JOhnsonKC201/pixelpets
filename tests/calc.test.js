// The launcher's calculator reads text a person typed and turns it into a number.
// Two things matter: it gets arithmetic right, and it can never be talked into
// running code. It is a hand-written parser with no eval, so these tests pin both
// the maths and the refusal of anything that is not maths.
const test = require('node:test');
const assert = require('node:assert');

const { evaluate, looksLikeMath, formatNumber } = require('../src/tools/calc');

const val = (s) => {
  const r = evaluate(s);
  assert.strictEqual(r.ok, true, `expected ${JSON.stringify(s)} to evaluate`);
  return r.value;
};
const bad = (s) => assert.strictEqual(evaluate(s).ok, false, `expected ${JSON.stringify(s)} to be refused`);

test('precedence, parentheses and unary minus', () => {
  assert.strictEqual(val('1 + 2 * 3'), 7);
  assert.strictEqual(val('(1 + 2) * 3'), 9);
  assert.strictEqual(val('-3 + 5'), 2);
  assert.strictEqual(val('2 * -3'), -6);
  assert.strictEqual(val('--4'), 4);
  assert.strictEqual(val('10 / 4'), 2.5);
  assert.strictEqual(val('10 % 4'), 2);
  assert.strictEqual(val('12*7.5'), 90);
  assert.strictEqual(val('.5 + 1e3'), 1000.5);
});

test('power is right-associative and binds tighter than unary minus', () => {
  assert.strictEqual(val('2 ^ 3 ^ 2'), 512);
  assert.strictEqual(val('-2 ^ 2'), -4);
  assert.strictEqual(val('2 ** 10'), 1024);
});

test('constants, functions and percent', () => {
  assert.ok(Math.abs(val('pi') - Math.PI) < 1e-12);
  assert.strictEqual(val('sqrt(16) + abs(-2)'), 6);
  assert.strictEqual(val('round(2.5) + floor(1.9) + ceil(1.1)'), 3 + 1 + 2);
  assert.strictEqual(val('20% * 50'), 10);
  assert.strictEqual(val('log(1000)'), 3);
});

test('a leading "=" is allowed and ignored', () => {
  assert.strictEqual(val('= 6 * 7'), 42);
});

test('division by zero and non-finite results are refused, not shown as Infinity', () => {
  bad('1 / 0');
  bad('sqrt(-1)');
  bad('10 ^ 400');
});

test('anything that is not arithmetic is refused', () => {
  for (const s of ['', '   ', 'process', 'constructor', '__proto__', 'alert(1)', '1;2', '1,2',
    'x + 1', '"1"', '`1`', 'this', '2 +', '(1 + 2', '1 + 2)', 'sqrt', 'sqrt 4', 'pi(2)', '1 2']) {
    bad(s);
  }
});

test('input size and nesting are bounded', () => {
  bad('1+'.repeat(150) + '1');
  bad('('.repeat(40) + '1' + ')'.repeat(40));
  assert.strictEqual(val('('.repeat(10) + '1' + ')'.repeat(10)), 1);
});

test('random junk never throws', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const alphabet = '0123456789+-*/%^().e piqrtsabnlog=,;x';
  for (let i = 0; i < 3000; i++) {
    const len = Math.floor(rnd() * 30);
    let s = '';
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const r = evaluate(s);
    assert.ok(r && typeof r.ok === 'boolean');
    if (r.ok) assert.ok(Number.isFinite(r.value));
  }
});

test('looksLikeMath only fires for real expressions, not plain words or bare numbers', () => {
  assert.strictEqual(looksLikeMath('12*7'), true);
  assert.strictEqual(looksLikeMath('(3+4)/2'), true);
  assert.strictEqual(looksLikeMath('=5'), true);
  assert.strictEqual(looksLikeMath('42'), false);
  assert.strictEqual(looksLikeMath('notes'), false);
  assert.strictEqual(looksLikeMath('10m tea'), false);
  assert.strictEqual(looksLikeMath('-'), false);
});

test('formatNumber trims float noise', () => {
  assert.strictEqual(formatNumber(0.1 + 0.2), '0.3');
  assert.strictEqual(formatNumber(90), '90');
  assert.strictEqual(formatNumber(1 / 3), '0.333333333333');
  assert.strictEqual(formatNumber(1e21), '1e+21');
});
