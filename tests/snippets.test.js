// Text snippets: a name and a piece of text you saved, copied back with ";name".
// The list rules are pure; the runner is tested with the clipboard stubbed.
const test = require('node:test');
const assert = require('node:assert');

const snippets = require('../src/tools/snippets');
const { suggest } = require('../src/tools/commands');
const config = require('../src/config');

const LIST = [{ name: 'sig', text: 'Best,\nJohn' }, { name: 'addr', text: '12 Baker Street, London' }];
const ctx = (over = {}) => ({
  platform: 'win32', search: 'google', shortcuts: [], timers: [], clips: [], clipboardOn: false, keepAwake: false, now: 0,
  todos: { day: '', items: [], nudged: '' }, snippets: LIST, ...over,
});
const top = (q, c = ctx()) => suggest(q, c)[0];

test('a name is one word of letters and digits, lower-cased', () => {
  assert.strictEqual(snippets.cleanName(' Sig '), 'sig');
  assert.strictEqual(snippets.cleanName('home-addr_2'), 'home-addr_2');
  assert.strictEqual(snippets.cleanName('dirección'), 'dirección');
  for (const bad of ['', 'two words', 'a;b', ';sig', 'x'.repeat(25), null, '../etc']) assert.strictEqual(snippets.cleanName(bad), null, String(bad));
});

test('add saves a new snippet, replaces one with the same name, and refuses what it should', () => {
  const one = snippets.add([], 'Sig', 'Best,\nJohn');
  assert.deepStrictEqual(one, { ok: true, list: [{ name: 'sig', text: 'Best,\nJohn' }], replaced: false });
  const two = snippets.add(one.list, 'sig', 'Cheers');
  assert.deepStrictEqual(two.list, [{ name: 'sig', text: 'Cheers' }]);
  assert.strictEqual(two.replaced, true);
  assert.notStrictEqual(two.list, one.list, 'the old list is left alone');

  assert.deepStrictEqual(snippets.add([], 'two words', 'x'), { ok: false, reason: 'name' });
  assert.deepStrictEqual(snippets.add([], 'sig', '  \n'), { ok: false, reason: 'none' });
  assert.deepStrictEqual(snippets.add([], 'sig', 'x'.repeat(snippets.MAX_TEXT + 1)), { ok: false, reason: 'big' });
  const full = Array.from({ length: snippets.MAX_SNIPPETS }, (_, i) => ({ name: `n${i}`, text: 't' }));
  assert.deepStrictEqual(snippets.add(full, 'extra', 'x'), { ok: false, reason: 'full' });
  assert.strictEqual(snippets.add(full, 'n3', 'new').ok, true, 'replacing one is fine when full');
});

test('a key or token is never written to disk, and ordinary text is', () => {
  // Built in pieces so no scanner mistakes this file for a leak.
  const secrets = [`gh${'p'}_${'a1B2'.repeat(6)}`, `-----BEGIN RSA ${'PRIVATE'} KEY-----\nabc`, `s${'k'}-${'x'.repeat(24)}`];
  for (const s of secrets) assert.deepStrictEqual(snippets.add([], 'k', s), { ok: false, reason: 'secret' }, s.slice(0, 6));
  // Things the stricter clipboard-history filter would refuse, and people do save.
  for (const fine of ['John.Doe99@Example.com', 'https://zoom.us/j/1234567890?pwd=abcDEF123456789012345678', '+1 (555) 010-2030']) {
    assert.strictEqual(snippets.add([], 'k', fine).ok, true, fine);
  }
});

test('remove and find go by cleaned name', () => {
  assert.deepStrictEqual(snippets.find(LIST, ' SIG '), LIST[0]);
  assert.strictEqual(snippets.find(LIST, 'nope'), null);
  assert.deepStrictEqual(snippets.remove(LIST, 'sig'), [LIST[1]]);
  assert.deepStrictEqual(snippets.remove(LIST, 'nope'), LIST);
});

test('the config keeps only well-formed snippets', () => {
  const dirty = [{ name: 'Sig', text: 'a' }, { name: 'sig', text: 'dup' }, { name: 'bad name', text: 'x' }, { name: 'ok', text: '' }, null, 'str', { name: 'n', text: 5 }];
  assert.deepStrictEqual(config.normalize({ snippets: dirty }).snippets, [{ name: 'sig', text: 'a' }]);
  assert.deepStrictEqual(config.normalize({}).snippets, []);
  assert.deepStrictEqual(config.normalize({ snippets: 'junk' }).snippets, []);
  // Saving another setting from the Settings window must not drop them.
  const kept = config.normalize({ ...config.normalize({ snippets: LIST }), tools: { search: 'bing' } });
  assert.deepStrictEqual(kept.snippets, LIST);
});

test('";" lists snippets and ";name" finds one, showing a one-line preview', () => {
  const all = suggest(';', ctx());
  assert.deepStrictEqual(all.map((r) => r.title), [';sig', ';addr']);
  assert.strictEqual(all[0].subtitle, 'Best, John', 'line breaks collapse in the preview');
  assert.deepStrictEqual(all[0].action, { type: 'snippet', name: 'sig' });
  assert.strictEqual(all[0].icon, 'snippet');
  assert.strictEqual(all[0].hint, 'Copy');
  assert.deepStrictEqual(top(';ad').action, { type: 'snippet', name: 'addr' });
  assert.strictEqual(top(';zzz').action, null);
  assert.strictEqual(top(';', ctx({ snippets: [] })).action, null, 'an empty list explains how to make one');
  const long = suggest(';', ctx({ snippets: [{ name: 'l', text: 'z'.repeat(500) }] }))[0];
  assert.ok(long.subtitle.length <= 80);
});

test('"save name" and "forget name" build actions that carry a name and never the text', () => {
  assert.deepStrictEqual(top('save phone').action, { type: 'snippetSave', name: 'phone' });
  assert.match(top('save phone').title, /;phone/);
  assert.match(top('save sig').title, /^Replace/);
  assert.strictEqual(top('save a;b').action, null, 'a bad name is explained, not saved');
  // Several words after "save" is somebody's sentence, so it is left to search.
  assert.deepStrictEqual(suggest('save the date ideas', ctx()).map((r) => r.action.type), ['search', 'note']);
  assert.deepStrictEqual(suggest('forget about it', ctx()).map((r) => r.action.type), ['search', 'note']);
  assert.deepStrictEqual(top('forget sig').action, { type: 'snippetForget', name: 'sig' });
  assert.strictEqual(top('forget nope').action, null);
  assert.strictEqual(top('save ').action, null, 'waiting for a name shows the example');
  assert.strictEqual(top('save ').icon, 'snippet');
  for (const q of ['save phone', 'forget sig']) assert.ok(!JSON.stringify(top(q)).includes('Baker'), q);
});

test('running them reads the clipboard in main and says what happened without quoting it', async () => {
  const system = require('../src/tools/system');
  const { runAction } = require('../src/tools/actions');
  const real = { readText: system.readText, copyText: system.copyText };
  let board = 'my office door code';
  let saved = [...LIST];
  const said = [];
  const remembered = [];
  system.readText = () => board;
  system.copyText = (s) => { board = s; };
  const api = {
    say: (t) => said.push(t), rememberClip: (t) => remembered.push(t),
    cfg: () => ({ snippets: saved }), persistSnippets: (list) => { saved = list; },
  };
  try {
    await runAction(api, { type: 'snippetSave', name: 'door' });
    assert.deepStrictEqual(saved.at(-1), { name: 'door', text: 'my office door code' });
    await runAction(api, { type: 'snippet', name: 'sig' });
    assert.strictEqual(board, 'Best,\nJohn');
    assert.deepStrictEqual(remembered, ['Best,\nJohn'], 'clipboard history is told this copy is ours');
    await runAction(api, { type: 'snippetForget', name: 'door' });
    assert.strictEqual(snippets.find(saved, 'door'), null);
    await runAction(api, { type: 'snippet', name: 'door' });
    board = '';
    await runAction(api, { type: 'snippetSave', name: 'empty' });
    assert.strictEqual(snippets.find(saved, 'empty'), null);
  } finally {
    Object.assign(system, real);
  }
  assert.deepStrictEqual(said, [
    'Saved. Type ;door to get it back.',
    'Copied ;sig. Paste it where you want.',
    'Forgot ;door.',
    'That snippet is gone.',
    'Copy some text first, then ask me again.',
  ]);
  assert.ok(!said.join(' ').includes('office'));
});
