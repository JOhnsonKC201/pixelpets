// The "make it do something" buttons cross four files: a data-act in settings.html,
// an allow-list in main.js, a bridge method in each preload, and a case in the
// renderer's runAction. Every hop is matched by STRING, and a mismatch anywhere
// throws nothing at all - the click just goes nowhere and the pet carries on as if
// you had not pressed it. That is invisible in code review and invisible in CI, and
// the only way anyone finds it is by opening settings and clicking a dead button.
//
// So pin the chain end to end, then drive the real renderer and check the buttons
// actually DO something, which is a different claim from being wired up.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadOverlay } = require('../scripts/overlay-vm.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Parsed from source rather than imported, the way tests/shot-window.test.js does
// it: main.js pulls in Electron at require time, and neither renderer runs here.
const html = read(path.join('src', 'settings.html'));
const main = require('./helpers/sources').readMainSource();   // main.js + src/main/
const renderer = require('../src/overlay/parts').readOverlaySource();
const preload = read(path.join('src', 'preload.js'));
const settingsPreload = read(path.join('src', 'settings-preload.js'));

const buttonIds = [...html.matchAll(/data-act="([a-z]+)"/g)].map((m) => m[1]);
const allowed = (() => {
  const m = main.match(/PET_ACTIONS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'the main process no longer declares a PET_ACTIONS allow-list');
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
})();

test('the settings window offers actions, with no duplicate ids', () => {
  assert.ok(buttonIds.length >= 1, 'no data-act buttons found in settings.html');
  assert.strictEqual(new Set(buttonIds).size, buttonIds.length, 'two action buttons share a data-act id');
});

test('every button is allowed through main and handled by the renderer', () => {
  for (const id of buttonIds) {
    assert.ok(allowed.includes(id),
      `settings.html has a "${id}" button, but main.js's PET_ACTIONS does not allow it, `
      + 'so the click is dropped silently in the main process');
    assert.ok(renderer.includes(`case '${id}':`),
      `main.js forwards "${id}", but the overlay's runAction has no case for it, `
      + 'so the pet receives the message and ignores it');
  }
});

test('nothing is allowed through that no button can send', () => {
  for (const id of allowed) {
    assert.ok(buttonIds.includes(id), `PET_ACTIONS allows "${id}" but no button sends it`);
  }
});

test('the ipc chain from the settings window to the pet is unbroken', () => {
  assert.match(settingsPreload, /ipcRenderer\.send\('settings:action'/,
    'settings-preload.js no longer exposes the action bridge');
  assert.match(main, /onSecure\('settings:action'/, 'the main process no longer listens for settings:action');
  assert.match(main, /webContents\.send\('action'/, 'the main process no longer forwards the action to the overlay');
  assert.match(preload, /onAction: sub\('action'/, 'preload.js no longer bridges the action channel');
  assert.match(renderer, /onAction\(\(id\) => runAction\(id\)\)/, 'the overlay no longer registers onAction');
});

// ---- and now the behaviour itself, in the real renderer ---------------------
function petOverlay(species) {
  const h = loadOverlay();
  h.run(`setSpecies(${JSON.stringify(species)})`);
  h.ipc('onConfig', { species, soundOn: false, followCursor: true, floorLock: true });
  h.run('draw(1000)');
  return h;
}

test('a cat action moves the state it claims to', () => {
  const h = petOverlay('cat');

  h.ipc('onAction', 'companion');
  assert.ok(h.run('bfOn'), 'companion did not summon a butterfly for a cat');

  h.ipc('onAction', 'give');
  assert.ok(h.run('!!treat'), 'give did not drop a treat for a cat');

  h.ipc('onAction', 'play');
  assert.ok(h.run('!!mote'), 'play did not put out a leaf to bat');

  h.ipc('onAction', 'groom');
  assert.ok(h.run('groomUntil') > 0, 'groom did not open the grooming window');

  h.ipc('onAction', 'loaf');
  assert.ok(h.run('loafUntil') > 0, 'loaf did not open the loafing window');

  h.ipc('onAction', 'stretch');
  assert.ok(h.run('stretchT0') >= 0, 'stretch did not start the stretch clock');
});

test('a dog gets its ball where a cat gets a butterfly', () => {
  const h = petOverlay('dog');
  h.ipc('onAction', 'companion');
  assert.ok(h.run('!!ball'), 'companion did not throw the ball for a dog');
  assert.ok(!h.run('bfOn'), 'a dog was sent a butterfly');
});

test('an action stands down whatever the pet was already doing', () => {
  // This is the whole reason runAction clears first. Without it, the gates guarding
  // grooming stay shut while the pet is mid-wander and the button silently no-ops.
  const h = petOverlay('cat');
  h.run('roamUntil = 1e9; huntUntil = 1e9');
  h.ipc('onAction', 'groom');
  assert.strictEqual(h.run('roamUntil'), 0, 'a wander survived an action request');
  assert.strictEqual(h.run('huntUntil'), 0, 'a hunt survived an action request');
  assert.ok(h.run('groomUntil') > 0, 'groom did not take effect after the clear');
});

test('an unknown action is ignored rather than guessed at', () => {
  const h = petOverlay('cat');
  const probe = '[bfOn, !!treat, !!mote, groomUntil, loafUntil]';
  const before = h.run(probe);
  h.ipc('onAction', 'definitely-not-a-real-action');
  assert.deepStrictEqual(h.run(probe), before, 'an unrecognised action id changed the pet state');
});

test('every action label resolves for both species', () => {
  const pets = require('../src/pets.js');
  for (const species of ['cat', 'dog']) {
    const t = pets.settingsText(species);
    for (const key of ['actCompanion', 'actGive', 'actPlay', 'actionsHint']) {
      assert.ok(t[key], `settingsText(${species}) has no ${key}`);
      assert.ok(!t[key].includes('%'), `settingsText(${species}).${key} left an unresolved token: ${t[key]}`);
    }
  }
});
