// Seasonal weather: snow, leaves, petals or fireflies around the pet, picked from
// the date. These drive the real overlay (scripts/overlay-vm.js) with a pinned
// clock, so the rules people will notice are pinned too: it follows the calendar,
// it stays sparse and near the pet, and every "be quiet" switch actually stops it.
const test = require('node:test');
const assert = require('node:assert');
const { loadOverlay } = require('../scripts/overlay-vm.js');
const { WEATHER_SETTINGS, normalize } = require('../src/config');

const DEC_AFTERNOON = 'new Date(2026, 11, 20, 14, 0)';
const BASE = { species: 'cat', soundOn: false, butterflyOn: false, roamOn: false, huntOn: false, floorLock: true };

function overlay(cfg = {}, when = DEC_AFTERNOON) {
  const h = loadOverlay();
  h.ipc('onConfig', { ...BASE, ...cfg });
  h.run(`weatherClock = () => ${when}`);
  return h;
}
const frames = (h, from, to, every = 50) => { for (let t = from; t <= to; t += every) h.run(`draw(${t})`); };
const inAir = (h, kind) => h.run(`weatherFlakes.filter((f) => f.kind === '${kind}').length`);

test('the seasons follow the calendar, flipped south of the equator', () => {
  const h = overlay();
  const season = (month, hemi) => h.run(`seasonOf(new Date(2026, ${month}, 15), '${hemi}')`);
  const north = [0, 1, 2, 4, 5, 7, 8, 10, 11].map((m) => season(m, 'north'));
  assert.deepStrictEqual(north, ['winter', 'winter', 'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter']);
  const south = [0, 3, 6, 9, 11].map((m) => season(m, 'south'));
  assert.deepStrictEqual(south, ['summer', 'autumn', 'winter', 'spring', 'summer']);
});

test('auto picks the weather for the season, and fireflies wait for dark', () => {
  const h = overlay();
  const auto = (date, hemi = 'north') => h.run(`weatherFor(${date}, 'auto', '${hemi}')`);
  assert.strictEqual(auto('new Date(2026, 11, 20, 14)'), 'snow');
  assert.strictEqual(auto('new Date(2026, 9, 20, 14)'), 'leaves');
  assert.strictEqual(auto('new Date(2026, 3, 20, 14)'), 'petals');
  assert.strictEqual(auto('new Date(2026, 6, 20, 14)'), null, 'a summer afternoon has no fireflies');
  assert.strictEqual(auto('new Date(2026, 6, 20, 21)'), 'fireflies');
  assert.strictEqual(auto('new Date(2026, 6, 20, 3)'), 'fireflies');
  assert.strictEqual(auto('new Date(2026, 11, 20, 22)', 'south'), 'fireflies', 'December nights are summer nights down south');
});

test('a kind picked by hand shows at any hour, and off means off', () => {
  const h = overlay();
  assert.strictEqual(h.run(`weatherFor(new Date(2026, 6, 20, 14), 'snow', 'north')`), 'snow');
  assert.strictEqual(h.run(`weatherFor(new Date(2026, 6, 20, 14), 'fireflies', 'north')`), 'fireflies');
  assert.strictEqual(h.run(`weatherFor(new Date(2026, 11, 20, 14), 'off', 'north')`), null);
});

test('snow keeps falling, but stays sparse and around the pet', () => {
  const h = overlay({ weather: 'auto' });
  frames(h, 1000, 61000);
  const n = inAir(h, 'snow');
  assert.ok(n > 0, 'nothing is falling in December');
  // a fixed number, not WEATHER_MAX.snow: the point is that it stays a light
  // flurry, and a test that reads the cap back from the code cannot notice it rising
  assert.ok(n <= 16, `${n} flakes in the air is a blizzard, not a light flurry`);
  assert.ok(h.run('weatherSettled.length') <= h.run('WEATHER_SETTLED_MAX'));
  const stray = h.run('weatherFlakes.filter((f) => Math.abs(f.x - pos.x) > WEATHER_SPAN + 40).length');
  assert.strictEqual(stray, 0, 'a flake wandered off across the screen');
});

test('nothing falls when the weather is off', () => {
  const h = overlay({ weather: 'off' });
  frames(h, 1000, 21000);
  assert.strictEqual(h.run('weatherFlakes.length + weatherSettled.length'), 0);
});

test('a settings change applies at once, without waiting for the minute check', () => {
  const h = overlay({ weather: 'snow' });
  frames(h, 1000, 3000);
  assert.strictEqual(h.run('weatherKind'), 'snow');
  h.ipc('onConfig', { ...BASE, weather: 'leaves' });
  h.run('draw(3050)');
  assert.strictEqual(h.run('weatherKind'), 'leaves');
});

for (const [name, quiet] of [
  ['work mode', (h) => h.ipc('onConfig', { ...BASE, weather: 'snow', workMode: true })],
  ['Focus Guard', (h) => h.ipc('onFocus', { busy: true })],
]) {
  test(`${name} lets what is falling land, then stops the weather`, () => {
    const h = overlay({ weather: 'snow' });
    frames(h, 1000, 21000);
    assert.ok(inAir(h, 'snow') > 0);
    quiet(h);
    h.run('draw(21050)');
    assert.ok(inAir(h, 'snow') > 0, 'the air emptied in one frame instead of letting the snow land');
    frames(h, 21100, 61000);
    assert.strictEqual(inAir(h, 'snow'), 0, `${name} did not stop the snow`);
  });
}

for (const [name, still] of [
  ['reduced motion', (h) => h.ipc('onConfig', { ...BASE, weather: 'snow', reducedMotion: true })],
  ['low power', (h) => h.ipc('onPower', { lowPower: true })],
]) {
  test(`${name} clears the air at once`, () => {
    const h = overlay({ weather: 'snow' });
    frames(h, 1000, 21000);
    assert.ok(h.run('weatherFlakes.length') > 0);
    still(h);
    h.run('draw(21050)');
    assert.strictEqual(h.run('weatherFlakes.length + weatherSettled.length'), 0);
  });
}

test('a coat full of snow gets shaken off, and a light dusting does not', () => {
  const h = overlay({ weather: 'snow' });
  frames(h, 1000, 1200);
  h.run('snowOnPet = SNOW_SHAKE_AT - 1');
  assert.strictEqual(h.run('maybeShakeOffSnow(2000)'), false);
  h.run('snowOnPet = SNOW_SHAKE_AT');
  assert.strictEqual(h.run('maybeShakeOffSnow(2000)'), true);
  assert.strictEqual(h.run('weatherBursts.length'), 9, 'no spray of flakes');
  assert.strictEqual(h.run('snowOnPet'), 0, 'the count did not start again');
  assert.strictEqual(h.run('tailFlickT0'), 2000);
});

test('snow really does land on the pet over a few minutes', () => {
  const h = overlay({ weather: 'snow' });
  h.run('var caught = 0; const realMove = moveFalling; moveFalling = (f, t, s) => { const n = snowOnPet; const r = realMove(f, t, s); if (snowOnPet > n) caught++; return r; }');
  frames(h, 1000, 181000);
  assert.ok(h.run('caught') > 0, 'no flake ever reached the pet');
});

test('idle eyes go to the nearest thing in the air', () => {
  const h = overlay({ weather: 'off' });
  frames(h, 1000, 1100);
  assert.strictEqual(h.run('weatherGlance()'), null, 'an empty sky gave a gaze target');
  h.run(`weatherFlakes = [{ kind: 'snow', x: pos.x + 60, y: pos.y - SH * 0.72, t0: 0 }]`);
  const g = h.run('weatherGlance()');
  assert.ok(Math.abs(g.x - 1) < 1e-9 && Math.abs(g.y) < 1e-9, `looked at ${JSON.stringify(g)} instead of straight right`);
});

test('Settings and the overlay offer the same kinds of weather', () => {
  const h = overlay();
  assert.deepStrictEqual(h.run('WEATHER_KINDS'), WEATHER_SETTINGS.filter((s) => s !== 'auto' && s !== 'off'));
});

test('settings keep a real weather choice and fall back on junk', () => {
  assert.strictEqual(normalize({}).weather, 'auto');
  assert.strictEqual(normalize({}).hemisphere, 'north');
  assert.strictEqual(normalize({ weather: 'fireflies', hemisphere: 'south' }).weather, 'fireflies');
  assert.strictEqual(normalize({ weather: 'fireflies', hemisphere: 'south' }).hemisphere, 'south');
  assert.strictEqual(normalize({ weather: 'hail', hemisphere: 'east' }).weather, 'auto');
  assert.strictEqual(normalize({ weather: 'hail', hemisphere: 'east' }).hemisphere, 'north');
});
