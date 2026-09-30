// Today's to-dos: a short list (5 at most) that belongs to one day. Unfinished
// items carry over to tomorrow and finished ones are cleared. Every function
// returns a new state, so these tests freeze their inputs to prove nothing is
// edited in place.
const test = require('node:test');
const assert = require('node:assert');

const todos = require('../src/tools/todos');

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
const EMPTY = deepFreeze({ day: '2026-9-28', items: [], nudged: '' });
const at = (h, m, d = 28) => new Date(2026, 8, d, h, m, 0, 0);

test('todayKey matches the reminder scheduler format', () => {
  assert.strictEqual(todos.todayKey(at(9, 0)), '2026-9-28');
});

test('add trims, caps text, and refuses a sixth item', () => {
  let s = EMPTY;
  for (let i = 0; i < 5; i++) {
    const r = todos.add(s, `  task ${i}  `);
    assert.strictEqual(r.ok, true);
    s = deepFreeze(r.state);
  }
  assert.strictEqual(s.items[0].text, 'task 0');
  const sixth = todos.add(s, 'one more');
  assert.strictEqual(sixth.ok, false);
  assert.strictEqual(sixth.reason, 'full');
  assert.strictEqual(todos.add(EMPTY, '   ').reason, 'empty');
  assert.strictEqual(todos.add(EMPTY, 'z'.repeat(300)).state.items[0].text.length, 80);
});

test('toggle and remove work by id and leave the input alone', () => {
  const s = deepFreeze(todos.add(todos.add(EMPTY, 'a').state, 'b').state);
  const id = s.items[0].id;
  const toggled = todos.toggle(s, id);
  assert.strictEqual(toggled.items[0].done, true);
  assert.strictEqual(s.items[0].done, false);
  assert.strictEqual(todos.toggle(toggled, id).items[0].done, false);
  assert.deepStrictEqual(todos.remove(s, id).items.map((t) => t.text), ['b']);
  assert.strictEqual(todos.toggle(s, 'nope'), s);
});

test('byIndex finds items by their 1-based number', () => {
  const s = todos.add(todos.add(EMPTY, 'a').state, 'b').state;
  assert.strictEqual(todos.byIndex(s, 2).text, 'b');
  assert.strictEqual(todos.byIndex(s, 3), null);
  assert.strictEqual(todos.byIndex(s, 0), null);
});

test('rollover keeps unfinished items and clears finished ones on a new day', () => {
  let s = todos.add(todos.add(EMPTY, 'a').state, 'b').state;
  s = deepFreeze(todos.toggle(s, s.items[0].id));
  assert.strictEqual(todos.rollover(s, '2026-9-28'), s);
  const next = todos.rollover(s, '2026-9-29');
  assert.strictEqual(next.day, '2026-9-29');
  assert.deepStrictEqual(next.items.map((t) => t.text), ['b']);
});

test('counts', () => {
  let s = todos.add(todos.add(EMPTY, 'a').state, 'b').state;
  s = todos.toggle(s, s.items[0].id);
  assert.deepStrictEqual(todos.counts(s), { total: 2, done: 1, left: 1 });
});

test('the midday nudge fires once, after the nudge time, only when something is left', () => {
  const s = deepFreeze(todos.add(EMPTY, 'a').state);
  assert.strictEqual(todos.needsMiddayNudge(s, at(12, 29), '12:30'), false);
  assert.strictEqual(todos.needsMiddayNudge(s, at(12, 30), '12:30'), true);
  assert.strictEqual(todos.needsMiddayNudge(s, at(16, 0), '12:30'), true);
  const nudged = { ...s, nudged: '2026-9-28' };
  assert.strictEqual(todos.needsMiddayNudge(nudged, at(16, 0), '12:30'), false);
  assert.strictEqual(todos.needsMiddayNudge(EMPTY, at(13, 0), '12:30'), false);
  const allDone = todos.toggle(s, s.items[0].id);
  assert.strictEqual(todos.needsMiddayNudge(allDone, at(13, 0), '12:30'), false);
  assert.strictEqual(todos.needsMiddayNudge(s, at(13, 0), ''), false);
});

test('normalizeTodos cleans a hand-edited config', () => {
  const out = todos.normalizeTodos({ day: 'yesterday', items: [{ text: 'ok' }, { text: '' }, 'junk', { id: 't1', text: 'x', done: 1 }], nudged: 5 });
  assert.strictEqual(out.day, '');
  assert.strictEqual(out.nudged, '');
  assert.deepStrictEqual(out.items.map((t) => [t.text, t.done]), [['ok', false], ['x', true]]);
  assert.ok(out.items.every((t) => /^t[a-z0-9]{1,16}$/.test(t.id)));
  assert.deepStrictEqual(todos.normalizeTodos(null), { day: '', items: [], nudged: '' });
});
