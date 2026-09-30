// Quick timers ("10m tea"). The parser has to be forgiving about how people write
// durations and strict about the range, and the timer list is plain data so the
// scheduler in main can be a dumb loop over due().
const test = require('node:test');
const assert = require('node:assert');

const timers = require('../src/tools/timers');

const S = 1000, M = 60 * S, H = 60 * M;

test('parseDuration reads compact and spaced forms', () => {
  assert.strictEqual(timers.parseDuration('10m'), 10 * M);
  assert.strictEqual(timers.parseDuration('1h30m'), 90 * M);
  assert.strictEqual(timers.parseDuration('1h 30m'), 90 * M);
  assert.strictEqual(timers.parseDuration('90s'), 90 * S);
  assert.strictEqual(timers.parseDuration('1.5h'), 90 * M);
  assert.strictEqual(timers.parseDuration('2 min'), 2 * M);
  assert.strictEqual(timers.parseDuration('45 seconds'), 45 * S);
  assert.strictEqual(timers.parseDuration('1 hour'), H);
});

test('parseDuration refuses nonsense and out-of-range values', () => {
  for (const s of ['', 'tea', '10', 'm', '0m', '25h', '10x', '1h1h', '-5m']) {
    assert.strictEqual(timers.parseDuration(s), null, s);
  }
  assert.strictEqual(timers.parseDuration('24h'), 24 * H);
});

test('parseTimerQuery splits the duration from the label', () => {
  assert.deepStrictEqual(timers.parseTimerQuery('10m tea'), { ms: 10 * M, label: 'tea' });
  assert.deepStrictEqual(timers.parseTimerQuery('timer 1h30m laundry done'), { ms: 90 * M, label: 'laundry done' });
  assert.deepStrictEqual(timers.parseTimerQuery('5m'), { ms: 5 * M, label: '' });
  assert.deepStrictEqual(timers.parseTimerQuery('timer 25 min'), { ms: 25 * M, label: '' });
  assert.strictEqual(timers.parseTimerQuery('tea 10m'), null);
  assert.strictEqual(timers.parseTimerQuery('timer'), null);
});

test('labels are trimmed and capped', () => {
  const t = timers.parseTimerQuery('1m ' + 'x'.repeat(200));
  assert.strictEqual(t.label.length, 40);
});

test('add refuses a sixth timer and never mutates its input', () => {
  let list = Object.freeze([]);
  for (let i = 0; i < 5; i++) {
    const next = timers.add(list, { now: 0, ms: M, label: `t${i}` });
    assert.ok(next.ok);
    assert.notStrictEqual(next.list, list);
    list = Object.freeze(next.list);
  }
  const sixth = timers.add(list, { now: 0, ms: M, label: 'nope' });
  assert.strictEqual(sixth.ok, false);
  assert.strictEqual(list.length, 5);
});

test('due splits fired from remaining, and cancel removes by id', () => {
  let list = [];
  list = timers.add(list, { now: 0, ms: 1 * M, label: 'a' }).list;
  list = timers.add(list, { now: 0, ms: 5 * M, label: 'b' }).list;
  const { fired, remaining } = timers.due(Object.freeze(list), 2 * M);
  assert.deepStrictEqual(fired.map((t) => t.label), ['a']);
  assert.deepStrictEqual(remaining.map((t) => t.label), ['b']);
  assert.deepStrictEqual(timers.cancel(list, list[1].id).map((t) => t.label), ['a']);
});

test('formatRemaining is short and human', () => {
  assert.strictEqual(timers.formatRemaining(90 * M), '1h 30m');
  assert.strictEqual(timers.formatRemaining(4 * M + 5 * S), '4m 5s');
  assert.strictEqual(timers.formatRemaining(42 * S), '42s');
  assert.strictEqual(timers.formatRemaining(-5), '0s');
});
