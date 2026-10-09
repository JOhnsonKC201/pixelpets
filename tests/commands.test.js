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
  assert.strictEqual(top('awake').title, 'Keep screen awake');
  assert.strictEqual(top('awake').toggle, true);
  assert.strictEqual(top('awake').hint, 'Turn on');
  assert.strictEqual(top('awake', ctx({ keepAwake: true })).hint, 'Turn off');
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

test('every result has an icon and a verb, and the empty query is sectioned', () => {
  const queries = ['', '?', 'text', '=1+1', '5 km in mi', 'g x', 'note x', 'todo x', 'done 1', '10m tea', 'clip', 'gmail', 'proj', 'lock', 'zzqqxx', '=bad'];
  for (const q of queries) {
    for (const r of suggest(q, ctx())) {
      assert.ok(typeof r.icon === 'string' && r.icon, `${q}: icon`);
      assert.strictEqual(typeof r.hint, 'string', `${q}: hint`);
      if (r.action) assert.ok(r.hint, `${q}: an actionable row names its verb`);
    }
  }
  // `section` is a stable id the launcher keys on; `sectionLabel` is what it shows.
  const sections = [...new Map(suggest('', ctx()).map((r) => [r.section, r.sectionLabel]))];
  assert.deepStrictEqual(sections, [['pinned', 'Pinned'], ['today', 'Today'], ['timers', 'Timers'], ['clips', 'Recent clips'], ['actions', 'Actions']]);
  assert.strictEqual(top('gmail').icon, 'link');
  assert.strictEqual(top('proj').icon, 'folder');
  assert.strictEqual(top('=2*3').hint, 'Copy');
});

test('"?" and "help" list things to type, and a row fills the box instead of running', () => {
  const list = suggest('?', ctx());
  assert.deepStrictEqual(suggest('help', ctx()), list);
  assert.ok(list.length <= MAX_RESULTS);
  assert.deepStrictEqual(list.map((r) => r.icon), ['calc', 'timer', 'todo', 'note', 'snippet', 'search', 'text', 'settings']);
  const fills = list.filter((r) => r.action.type === 'fill');
  assert.strictEqual(fills.length, 7);
  for (const r of fills) {
    assert.strictEqual(r.stay, true, 'the launcher stays open so you can finish typing');
    assert.strictEqual(r.hint, 'Try');
    // What the box shows the moment a starter lands is about that same tool,
    // and so is the first thing you get once you type more.
    assert.strictEqual(top(r.action.text).icon, r.icon, `"${r.action.text}" as filled`);
    const more = /\s$/.test(r.action.text) ? `${r.action.text}2` : r.action.text;
    assert.strictEqual(top(more).icon, r.icon, `"${more}"`);
  }
  // A command word and a space is waiting for the rest; the bare word is still a search.
  assert.strictEqual(top('todo ').action, null);
  assert.strictEqual(top('todo ').title, 'todo call the dentist');
  assert.notStrictEqual(top('g').kind, 'help', '"g" alone is still the start of "gmail"');
  assert.strictEqual(top('g ').icon, 'search');
  assert.deepStrictEqual(list[7].action, { type: 'system', what: 'settings' });
  // The dashboard and the fuzzy list both lead to it.
  assert.deepStrictEqual(suggest('', ctx()).at(-1).action, { type: 'fill', text: '?' });
  assert.deepStrictEqual(top('examples').action, { type: 'fill', text: '?' });
});

test('text fixers are found by name and never show what is on the clipboard', () => {
  for (const [q, op] of [['upper', 'upper'], ['lower', 'lower'], ['title', 'title'], ['plain', 'plain'], ['one line', 'oneline'], ['count', 'count'], ['caps', 'upper']]) {
    assert.deepStrictEqual(top(q).action, { type: 'textfix', op }, q);
  }
  const all = suggest('text', ctx()).filter((r) => r.kind === 'text');
  assert.strictEqual(all.length, 6, '"text" lists every fixer');
  for (const r of all) {
    assert.strictEqual(r.icon, 'text');
    assert.ok(!('keys' in r));
    assert.ok(!JSON.stringify(r).includes('first clip'), 'a row is a label, not a preview');
  }
  assert.ok(!suggest('', ctx()).some((r) => r.kind === 'text'), 'they stay out of the dashboard');
});

test('help and the text fixers answer to whole words, so ordinary searches still search', () => {
  const quiet = ctx({ shortcuts: [], timers: [], todos: { day: '', items: [], nudged: '' } });
  // Each of these fits, letter by scattered letter, inside a fixer's or help's title.
  for (const q of ['weather', 'news', 'hello', 'excel', 'context', 'text me', 'help me', '?!']) {
    assert.deepStrictEqual(suggest(q, quiet).map((r) => r.action.type), ['search', 'note'], q);
  }
  assert.deepStrictEqual(top('how', quiet).action, { type: 'fill', text: '?' });
  assert.deepStrictEqual(top('upp', quiet).action, { type: 'textfix', op: 'upper' });
});

test('a help example says which part of it is the command, in every language', () => {
  const i18n = require('../src/i18n');
  for (const code of i18n.CODES) {
    const t = i18n.translator(code);
    const leads = suggest('?', ctx({ t })).map((r) => (r.lead ? r.title.slice(0, r.lead) : ''));
    assert.deepStrictEqual(leads, ['=', '10m', 'todo', 'note', 'save', 'g', 'upper', ''], code);
    assert.strictEqual(top('todo ', ctx({ t })).lead, 4, `${code}: the waiting row marks it too`);
  }
  assert.ok(!('lead' in top('gmail')), 'ordinary rows carry no lead');
});
