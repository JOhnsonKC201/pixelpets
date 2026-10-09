const test = require('node:test');
const assert = require('node:assert');
const { registerSettingsIpc, PET_ACTIONS } = require('../src/main/settings-ipc');
const config = require('../src/config');
const { SPECIES, speciesOf, defaultCoatIndex } = require('../src/pets');

// Registers the handlers against fakes and hands back a way to call them.
function setup(cfg, extra = {}) {
  const on = new Map(), handle = new Map();
  const state = { cfg, themes: [], saved: [], actions: [], changed: 0 };
  registerSettingsIpc({
    onSecure: (ch, fn) => on.set(ch, fn),
    handleSecure: (ch, fn) => handle.set(ch, fn),
    getCfg: () => state.cfg,
    persist: (next) => { state.saved.push(next); state.cfg = next; },
    getThemes: () => state.themes,
    setThemes: (list) => { state.themes = list; },
    themesChanged: () => { state.changed += 1; },
    themes: { save: (list) => list, clean: (list) => list || [] },
    config, pets: { SPECIES, speciesOf, defaultCoatIndex },
    mail: {}, cal: {}, dialog: {},
    getDialogParent: () => null, getSettingsWin: () => null,
    openSettings() {}, openReport() {}, notify() {},
    sendAction: (id) => state.actions.push(id),
    ...extra,
  });
  const send = (ch, ...args) => on.get(ch)({}, ...args);
  const invoke = (ch, ...args) => handle.get(ch)({}, ...args);
  return { state, send, invoke };
}

test('settings:save merges a small plain object', () => {
  const { state, invoke } = setup({ name: 'Mochi', soundOn: false });
  const out = invoke('settings:save', { soundOn: true });
  assert.deepStrictEqual(state.saved.at(-1), { name: 'Mochi', soundOn: true });
  assert.deepStrictEqual(out, state.cfg);
});

test('settings:save refuses arrays, primitives and oversized payloads', () => {
  const { state, invoke } = setup({ name: 'Mochi' });
  invoke('settings:save', ['soundOn']);
  invoke('settings:save', 'soundOn');
  invoke('settings:save', null);
  invoke('settings:save', { note: 'x'.repeat(70000) });
  assert.deepStrictEqual(state.saved, []);
});

test('settings:save survives a payload that cannot be serialised', () => {
  const { state, invoke } = setup({ name: 'Mochi' });
  const loop = {}; loop.self = loop;
  assert.deepStrictEqual(invoke('settings:save', loop), { name: 'Mochi' });
  assert.deepStrictEqual(state.saved, []);
});

test('only allow-listed pet actions reach the overlay', () => {
  const { state, send } = setup({});
  send('settings:action', 'play');
  send('settings:action', 'eval');
  send('settings:action', '__proto__');
  assert.deepStrictEqual(state.actions, ['play']);
  assert.ok(PET_ACTIONS.has('home'));
});

test('switching to the dog picks a default breed when none is stored', () => {
  const { state, send } = setup({ species: 'cat', pattern: 3 });
  send('settings:save-species', 'dog');
  assert.strictEqual(state.saved.at(-1).species, 'dog');
  assert.strictEqual(state.saved.at(-1).dogPattern, defaultCoatIndex('dog'));
});

test('an unknown species falls back to the cat', () => {
  const { state, send } = setup({ species: 'dog' });
  send('settings:save-species', 'dragon');
  assert.strictEqual(state.saved.at(-1).species, 'cat');
});

test('the coat index goes to the field for the current species', () => {
  const { state, send } = setup({ species: 'dog', pattern: 1, dogPattern: 0 });
  send('settings:save-pattern', 2);
  assert.strictEqual(state.saved.at(-1).dogPattern, 2);
  assert.strictEqual(state.saved.at(-1).pattern, 1);
});

test('deleting a custom coat above the one in use keeps the same coat on screen', () => {
  const builtins = require('../src/patterns').PATTERN_NAMES.length;
  // Wearing the second custom coat; the first one is deleted, so it moves up a slot.
  const { state, invoke } = setup({ pattern: builtins + 1 });
  state.themes = [{ name: 'Mint' }, { name: 'Rust' }];
  invoke('themes:delete', 'Mint');
  assert.deepStrictEqual(state.themes, [{ name: 'Rust' }]);
  assert.strictEqual(state.cfg.pattern, builtins);
  assert.strictEqual(state.changed, 1);
});

test('themes:add stores the coat and tells every window', () => {
  const { state, invoke } = setup({});
  assert.deepStrictEqual(invoke('themes:add', { name: 'Mint' }), [{ name: 'Mint' }]);
  assert.strictEqual(state.changed, 1);
});

test('settings:save never touches snippets, which only the launcher writes', () => {
  const mine = [{ name: 'sig', text: 'Best' }];
  const { state, invoke } = setup({ name: 'Mochi', snippets: mine });
  // Settings sends back its whole copy of the config, here one from before a snippet was saved.
  invoke('settings:save', { name: 'Tofu', snippets: [] });
  assert.deepStrictEqual(state.saved.at(-1), { name: 'Tofu', snippets: mine });
  // A full set of snippets is about 60 KB. That must not make an ordinary save look like junk.
  const full = Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, text: 'x'.repeat(2000) }));
  const big = setup({ name: 'Mochi', snippets: full });
  big.invoke('settings:save', { name: 'Tofu', snippets: full });
  assert.strictEqual(big.state.saved.at(-1).name, 'Tofu');
  assert.strictEqual(big.state.saved.at(-1).snippets, full);
});
