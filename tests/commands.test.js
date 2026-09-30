// The launcher's router: typed text in, a short list of things to do out. Each
// result carries an `action` that only main ever executes (the launcher window
// just sends back an index). These tests pin each route and the privacy rule
// that clipboard text shown in the list is always a short preview.
const test = require('node:test');
const assert = require('node:assert');

const { suggest, searchUrl, MAX_RESULTS } = require('../src/tools/commands');

const ctx = (over = {}) => ({
  platform: 'win32',
  search: 'google',
  shortcuts: [
    { id: 's1', label: 'Gmail', target: 'https://mail.google.com/' },
    { id: 's2', label: 'Projects', target: 'C:\\Projects' },
  ],
  todos: { day: '2026-9-28', items: [{ id: 't1', text: 'email Dr. Lee', done: false }, { id: 't2', text: 'gym', done: true }], nudged: '' },
  timers: [{ id: 'tm1', endsAt: 5 * 60000, label: 'tea' }],
  clips: ['first clip ' + 'z'.repeat(300), 'second'],
  clipboardOn: true,
  keepAwake: false,
  now: 0,
  ...over,
});
const top = (q, c = ctx()) => suggest(q, c)[0];

test('calculator: "=" always routes to the calculator and Enter copies the answer', () => {
  const r = top('=12*7.5');
  assert.strictEqual(r.kind, 'calc');
  assert.strictEqual(r.title, '90');
  assert.deepStrictEqual(r.action, { type: 'copy', text: '90' });
  assert.strictEqual(top('=nonsense').action, null);
  assert.strictEqual(top('(3+4)/2').title, '3.5');
});

test('unit conversion', () => {
  const r = top('5 km in mi');
  assert.strictEqual(r.kind, 'convert');
  assert.strictEqual(r.title, '3.10686 mi');
  assert.deepStrictEqual(r.action, { type: 'copy', text: '3.10686' });
  assert.strictEqual(top('72 f to c').title, '22.2222 °C');
  assert.strictEqual(top('3 gb in mib').title, '2861.02 MiB');
});

test('web search prefixes build an encoded URL from a fixed template', () => {
  const r = top('g how to center a div & more');
  assert.deepStrictEqual(r.action, { type: 'search', engine: 'google', query: 'how to center a div & more' });
  assert.strictEqual(top('ddg cats').action.engine, 'duckduckgo');
  assert.strictEqual(top('b cats').action.engine, 'bing');
  assert.strictEqual(searchUrl('google', 'a&b c'), 'https://www.google.com/search?q=a%26b%20c');
  assert.strictEqual(searchUrl('evil', 'x'), 'https://www.google.com/search?q=x');
});

test('notes, to-dos and done', () => {
  assert.deepStrictEqual(top('note buy milk').action, { type: 'note', text: 'buy milk' });
  assert.deepStrictEqual(top('todo call mom').action, { type: 'todoAdd', text: 'call mom' });
  assert.deepStrictEqual(top('done 1').action, { type: 'todoToggle', id: 't1' });
  assert.strictEqual(top('done 9').action, null);
});

test('timers', () => {
  const r = top('10m tea');
  assert.strictEqual(r.kind, 'timer');
  assert.deepStrictEqual(r.action, { type: 'timerStart', ms: 600000, label: 'tea' });
  assert.deepStrictEqual(top('timer 1h30m').action, { type: 'timerStart', ms: 5400000, label: '' });
});

test('fuzzy finds shortcuts and system commands', () => {
  assert.deepStrictEqual(top('gmail').action, { type: 'openShortcut', id: 's1' });
  assert.deepStrictEqual(top('proj').action, { type: 'openShortcut', id: 's2' });
  assert.deepStrictEqual(top('snip').action, { type: 'system', what: 'snip' });
  assert.deepStrictEqual(top('lock').action, { type: 'system', what: 'lock' });
  assert.match(top('lock', ctx({ platform: 'darwin' })).title, /Sleep display/);
  assert.match(top('awake').title, /Keep awake: turn on/);
  assert.match(top('awake', ctx({ keepAwake: true })).title, /turn off/);
});

test('an unmatched query offers search and a note instead of an empty list', () => {
  const list = suggest('asdkjh qwe', ctx());
  assert.deepStrictEqual(list.map((r) => r.action.type), ['search', 'note']);
});

test('the empty query shows sections, with clips only when history is on', () => {
  const list = suggest('', ctx());
  const kinds = new Set(list.map((r) => r.kind));
  for (const k of ['shortcut', 'todo', 'timer', 'clip', 'system']) assert.ok(kinds.has(k), k);
  assert.ok(!suggest('', ctx({ clipboardOn: false })).some((r) => r.kind === 'clip'));
  const todo = list.find((r) => r.kind === 'todo' && r.action.id === 't2');
  assert.strictEqual(todo.checked, true);
  assert.strictEqual(todo.stay, true);
});

test('clipboard text shown in the list is always a short preview', () => {
  for (const r of suggest('', ctx()).concat(suggest('clip', ctx()))) {
    assert.ok(r.title.length <= 80 && String(r.subtitle || '').length <= 80, r.title);
  }
  assert.deepStrictEqual(suggest('clip', ctx())[0].action, { type: 'clip', index: 0 });
});

test('typed results are capped', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, label: `site ${i}`, target: `https://e.com/${i}` }));
  assert.ok(suggest('site', ctx({ shortcuts: many })).length <= MAX_RESULTS);
});
