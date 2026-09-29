// Fuzzy matching for the launcher list: "kpa" should find "Keep awake", and
// word starts should beat letters buried mid-word.
const test = require('node:test');
const assert = require('node:assert');

const { score, rank } = require('../src/tools/fuzzy');

test('score is -1 when the letters are not all there in order', () => {
  assert.strictEqual(score('xyz', 'Keep awake'), -1);
  assert.strictEqual(score('ekk', 'Keep awake'), -1);
  assert.ok(score('', 'anything') >= 0);
});

test('word starts and contiguous runs score higher', () => {
  assert.ok(score('ka', 'Keep awake') > score('ka', 'Snooze break'));
  assert.ok(score('lock', 'Lock screen') > score('lock', 'Clock cleaner'));
  assert.ok(score('note', 'Open notes') > score('note', 'Now on the tea'));
});

test('rank keeps matches only, best first, stable for ties', () => {
  const items = [{ title: 'Snip screen' }, { title: 'Lock screen' }, { title: 'Settings' }, { title: 'Keep awake' }];
  assert.deepStrictEqual(rank(items, 'scr', (i) => i.title).map((i) => i.title), ['Snip screen', 'Lock screen']);
  assert.deepStrictEqual(rank(items, 'set', (i) => i.title).map((i) => i.title), ['Settings']);
  assert.strictEqual(rank(items, '', (i) => i.title).length, 4);
});
