// Putting the pet down moves its home.
//
// The drop itself was never the bug: mouseup always placed the cat where you let go.
// What shipped was a pet that sat there for about ten seconds and then walked back to
// the corner it came from, which reads as the drop being ignored. Three separate causes,
// all pinned here:
//
//   1. The wander picker skewed its target toward the restSide corner (r*r clusters at
//      one edge), so the first stroll after any drop crossed the screen and every stroll
//      after that kept the pet there. Every OTHER system that re-homes the pet (the launch
//      restore, the floor re-pin, the display-change rescue, work mode, the dog carrying
//      its ball back) asks homeX() where home is, and homeX() only ever knew about the
//      corner setting, so none of them knew the pet had been moved.
//   2. The drop committed head.x, the position of an underdamped spring chasing the
//      cursor, so a fast drag across the screen landed the cat tens of pixels short of
//      the pointer.
//   3. The spot had to survive a restart and a resolution change, so it is stored as a
//      fraction of the window width rather than a pixel column.
//
// The listeners themselves are unreachable here (scripts/overlay-vm.js stubs
// addEventListener), which is why the drop lives in dropAt() rather than inline in
// mouseup: before the split, a "drag" in a test was a hand-written pos.x, which pinned
// nothing about what releasing the mouse actually does.
const test = require('node:test');
const assert = require('node:assert');
const { loadOverlay } = require('../scripts/overlay-vm.js');

const STEP = 60;
const LEFT_THIRD = { x: 0, y: 0, w: 1 / 3, h: 1 };
const BASE = { species: 'cat', soundOn: false, floorLock: true, butterflyOn: false, moodOn: false, huntOn: false, followCursor: false };

// Nothing else may claim the roam slot while we are watching where a stroll aims.
function pet(cfg = {}) {
  const h = loadOverlay();
  h.ipc('onConfig', { ...BASE, ...cfg });
  return h;
}
// Sample the wander picker directly. Driving frames and waiting for the 8-24s roam timer
// would take five minutes of simulated time per sample and still only give one draw.
function samples(h, n = 400) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(h.run('roamTargetX()'));
  return out;
}

test('a drop makes that spot home, on the floor line, and remembers it', () => {
  const h = pet();
  h.run('dropAt(300)');
  assert.strictEqual(h.run('pos.x'), 300, 'the cat should land where it was released');
  assert.strictEqual(h.run('homeX()'), 300, 'the drop spot should become home');
  assert.strictEqual(h.run('homeAnchored()'), true, 'the pet should now have a chosen spot');
  assert.strictEqual(h.run('pos.y'), h.run('restingY()'), 'the feet should land on the floor line');
  assert.strictEqual(JSON.parse(h.store.pos).y, h.run('restingY()'), 'the saved position should be on the floor line too');
  assert.ok(Math.abs(parseFloat(h.store.homeFrac) - 300 / h.run('viewW')) < 1e-9,
    `homeFrac should be the drop spot as a fraction, saw ${h.store.homeFrac}`);
});

test('a stroll from the drop spot stays near it and never crosses to the old corner', () => {
  const h = pet({ restSide: 'right' });
  const corner = h.run('homeX()');
  assert.ok(corner > 1700, `with no spot chosen, home should still be the right corner, saw ${corner}`);
  h.run('dropAt(300)');
  const radius = h.run('homeRoamRadius()');
  const xs = samples(h);
  for (const x of xs) {
    assert.ok(Math.abs(x - 300) <= radius + 1e-9, `a stroll aimed at ${x.toFixed(0)}, outside ${radius.toFixed(0)}px of the drop spot`);
  }
  assert.ok(Math.max(...xs) < corner - 400, `a stroll aimed at ${Math.max(...xs).toFixed(0)}, back toward the old corner at ${corner}`);
  // Symmetric: the pet should mooch both ways, not creep steadily off in one direction.
  assert.ok(xs.some((x) => x < 300) && xs.some((x) => x > 300), 'strolls should go both left and right of the spot');
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean - 300) < radius * 0.15, `strolls should average out at the spot, mean was ${mean.toFixed(0)}`);
});

test('with no chosen spot the wander still favours the rest corner', () => {
  for (const [restSide, near, far] of [['right', 1920, 0], ['left', 0, 1920]]) {
    const h = pet({ restSide });
    const xs = samples(h);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(Math.abs(mean - near) < Math.abs(mean - far),
      `restSide '${restSide}' should still skew toward ${near}, mean was ${mean.toFixed(0)}`);
    assert.ok(Math.max(...xs) > 1920 * 0.85 || Math.min(...xs) < 1920 * 0.15, 'it should still reach the far edge sometimes');
  }
});

test('the drop spot survives a restart', () => {
  const h = loadOverlay({ store: { homeFrac: '0.1', pos: JSON.stringify({ x: 1800, y: 900 }) } });
  h.ipc('onConfig', { ...BASE, restSide: 'right' });
  assert.strictEqual(h.run('homeAnchored()'), true, 'a saved spot should be read back at launch');
  assert.ok(Math.abs(h.run('pos.x') - 192) < 1, `the cat should start at the saved spot, saw ${h.run('pos.x')}`);
  assert.ok(h.run('pos.x') < 1000, 'it must NOT be pulled back to the right corner on launch');
});

test('the drop spot is a fraction, so it moves with a resolution change', () => {
  const h = pet();
  h.run('dropAt(960)');                       // dead centre of a 1920 screen
  h.sandbox.innerWidth = 1280;
  h.ipc('onGeom', { bottomInset: 40, bottomWorkY: 1040 });
  assert.ok(Math.abs(h.run('homeX()') - 640) < 1, `home should track to the middle of the narrower screen, saw ${h.run('homeX()')}`);
});

test('a drop outside the play area is pulled inside it, and strolls stay inside too', () => {
  const h = pet({ playArea: LEFT_THIRD });
  const lo = h.run('zoneClampX(-99999)'), hi = h.run('zoneClampX(99999)');
  h.run('dropAt(1800)');                      // released well outside the zone
  assert.ok(h.run('pos.x') <= hi + 1e-9 && h.run('pos.x') >= lo, `the drop landed at ${h.run('pos.x')}, outside ${lo}..${hi}`);
  assert.strictEqual(h.run('homeX()'), h.run('pos.x'), 'home should be the clamped landing spot');
  for (const x of samples(h, 200)) {
    assert.ok(h.run(`zoneClampX(${x})`) >= lo && h.run(`zoneClampX(${x})`) <= hi, 'a clamped stroll target should stay in the zone');
  }
});

test('changing the rest corner forgets the spot and strolls back to the corner', () => {
  const h = pet({ restSide: 'right' });
  h.run('dropAt(300)');
  h.ipc('onConfig', { ...BASE, restSide: 'left' });
  assert.strictEqual(h.run('homeAnchored()'), false, 'picking a corner should forget the drop spot');
  assert.strictEqual(h.store.homeFrac, undefined, 'and should clear it from storage');
  assert.strictEqual(h.run('homeX()'), h.run('HOME_MARGIN_L'), 'home should be the newly picked corner');
  assert.strictEqual(h.run('roamTo.x'), h.run('homeX()'), 'the pet should set off for the corner');
});

test('an unrelated setting does not forget the spot', () => {
  const h = pet();
  h.run('dropAt(300)');
  h.ipc('onConfig', { ...BASE, volume: 50 });
  assert.strictEqual(h.run('homeAnchored()'), true, 'changing the volume must not move the pet home');
  assert.strictEqual(h.run('homeX()'), 300, 'the spot should be untouched');
});

test('Send it home forgets the spot, even on the corner already selected', () => {
  const h = pet({ restSide: 'right' });
  h.run('dropAt(300)');
  h.ipc('onAction', 'home');
  assert.strictEqual(h.run('homeAnchored()'), false, 'the action should forget the drop spot');
  assert.strictEqual(h.store.homeFrac, undefined, 'and clear it from storage');
  assert.ok(h.run('homeX()') > 1700, 'home should be the right corner again');
  assert.strictEqual(h.run('roamTo.x'), h.run('homeX()'), 'and the pet should walk back to it');
  assert.ok(h.run('roamUntil') > 0, 'the walk should actually be scheduled');
});

test('work mode parks at the drop spot, not the corner', () => {
  const h = pet({ restSide: 'right' });
  h.run('dropAt(300)');
  h.ipc('onConfig', { ...BASE, restSide: 'right', workMode: true });
  for (let t = STEP; t <= 12000; t += STEP) { h.run('nextIdleAt = 1e12'); h.run(`draw(${t})`); }
  assert.ok(Math.abs(h.run('pos.x') - 300) < 3, `work mode should hold the pet at its spot, saw ${h.run('pos.x')}`);
});

test('a later drop replaces the earlier spot', () => {
  const h = pet();
  h.run('dropAt(300)');
  h.run('dropAt(900)');
  assert.strictEqual(h.run('homeX()'), 900, 'the most recent drop should win');
  assert.ok(Math.abs(parseFloat(h.store.homeFrac) - 900 / h.run('viewW')) < 1e-9, 'and should be the one saved');
});
