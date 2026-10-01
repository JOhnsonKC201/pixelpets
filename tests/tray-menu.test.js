const test = require('node:test');
const assert = require('node:assert');
const { buildTrayTemplate } = require('../src/main/tray-menu');
const { speciesOf, SPECIES_IDS, SPECIES } = require('../src/pets');

// A menu built over a config that can change between build and click, the way
// the real one does. Returns the template, the live config and what persist saw.
function menu(cfg, extra = {}) {
  const live = { current: cfg };
  const saved = [];
  const calls = [];
  const template = buildTrayTemplate({
    cfg, getCfg: () => live.current, species: speciesOf(cfg && cfg.species),
    speciesList: SPECIES_IDS.map((id) => ({ id, emoji: SPECIES[id].emoji, label: SPECIES[id].label })),
    coatNames: ['Tabby', 'Tuxedo'], recent: [], relTime: () => 'now',
    onBattery: false, lowPowerOn: false, toolItems: [],
    ...extra,
  }, new Proxy({}, {
    get: (_t, name) => (name === 'persist'
      ? (next) => { saved.push(next); live.current = next; }
      : (...args) => calls.push([name, ...args])),
  }));
  return { template, live, saved, calls };
}

const find = (items, label) => {
  for (const it of items) {
    if (it.label === label) return it;
    if (it.submenu) { const hit = find(it.submenu, label); if (hit) return hit; }
  }
  return null;
};

test('checkmarks follow the config, with default-on settings on when unset', () => {
  const { template } = menu({ huntOn: true });
  assert.strictEqual(find(template, 'Mouse hunt').checked, true);
  assert.strictEqual(find(template, 'Follow cursor').checked, false);
  assert.strictEqual(find(template, 'Always on top').checked, true);   // unset means on
  assert.strictEqual(find(template, 'Wander').checked, true);
});

test('a toggle flips the LIVE value, not the one the menu was built from', () => {
  const { template, live, saved } = menu({ soundOn: false });
  live.current = { soundOn: true };   // changed in Settings after the menu was built
  find(template, 'Sound').click();
  assert.strictEqual(saved.at(-1).soundOn, false);
});

test('turning a default-on setting off stores false', () => {
  const { template, saved } = menu({});
  find(template, 'Always on top').click();
  assert.strictEqual(saved.at(-1).onTop, false);
});

test('a click keeps every other setting', () => {
  const { template, saved } = menu({ name: 'Mochi', huntOn: false });
  find(template, 'Mouse hunt').click();
  assert.deepStrictEqual(saved.at(-1), { name: 'Mochi', huntOn: true });
});

test('picking a Lobby Jam mood never starts music that was left off', () => {
  const { template, saved } = menu({ lobbyJam: { on: false, mood: 'cozy' } });
  find(template, 'Rainy study').click();
  assert.deepStrictEqual(saved.at(-1).lobbyJam, { on: false, mood: 'rain' });
});

test('the coat list writes the field for the species being shown', () => {
  const cat = menu({ species: 'cat', pattern: 0 });
  find(cat.template, 'Tuxedo').click();
  assert.strictEqual(cat.saved.at(-1).pattern, 1);

  const dog = menu({ species: 'dog', dogPattern: 0 });
  find(dog.template, 'Tuxedo').click();
  assert.strictEqual(dog.saved.at(-1).dogPattern, 1);
  assert.strictEqual(dog.saved.at(-1).pattern, undefined);
});

test('low power shows the effective flag but flips the user setting', () => {
  const { template, saved } = menu({ lowPower: false, lowPowerOnBattery: true }, { onBattery: true, lowPowerOn: true });
  const item = find(template, 'Low power mode (on battery)');
  assert.strictEqual(item.checked, true);
  item.click();
  assert.strictEqual(saved.at(-1).lowPower, true);
});

test('recent notifications list newest first and can be cleared', () => {
  const recent = [{ ts: 2, message: 'second  line\nwrapped' }, { ts: 1, message: 'first' }];
  const { template, calls } = menu({}, { recent, relTime: (ts) => `t${ts}` });
  const sub = find(template, 'Recent notifications').submenu;
  assert.strictEqual(sub[0].label, 't2 - second line wrapped');
  sub[0].click();
  assert.deepStrictEqual(calls.at(-1), ['renotify', recent[0]]);
  find(template, 'Clear').click();
  assert.strictEqual(calls.at(-1)[0], 'clearRecent');
});

test('an empty recap says so instead of showing an empty submenu', () => {
  const { template } = menu({});
  assert.deepStrictEqual(find(template, 'Recent notifications').submenu, [{ label: '(nothing yet)', enabled: false }]);
});

test('menu actions reach their handlers', () => {
  const { template, calls } = menu({});
  find(template, '10 minutes').click();
  find(template, 'Zoomies!').click();
  find(template, 'Send it home (forget the drop spot)').click();
  assert.deepStrictEqual(calls, [['snooze', 10], ['sendMood', 'zoomies'], ['sendAction', 'home']]);
});
