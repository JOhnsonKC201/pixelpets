// How the cat PLAYS with the butterfly once it is here: the swat cadence, the
// catch, the whiff, and the beats around them. tests/butterfly.test.js covers
// arrival and departure; this file covers everything in between.
//
// Everything here drives the real renderer through scripts/overlay-vm.js with a
// seeded PRNG, so the same script of draw() calls plays out the same way on every
// run. Time is advanced by hand (60ms frames); performance.now() is pinned at 0.
const test = require('node:test');
const assert = require('node:assert');
const { loadOverlay } = require('../scripts/overlay-vm.js');
const { readOverlaySource } = require('../src/overlay/parts');

const STEP = 60;
const RENDERER = readOverlaySource();

// A cat with a butterfly already mid-visit and the cursor long idle, so the play
// gates (cursorIdle, mouseQuiet) are all open from the first frame.
function playing(cfg = {}) {
  const h = loadOverlay();
  h.ipc('onConfig', { species: 'cat', soundOn: false, butterflyOn: true, followCursor: true, floorLock: true, roamOn: true, moodOn: false, ...cfg });
  h.run('startBflyVisit(1000); lastCursorMove = -99999;');
  assert.ok(h.run('bfOn'), 'the visit should have started');
  return h;
}

// One frame, with the idle roll held off: it can fire a perk-up bounce that chirps
// on its own, which would make any chirp count here ambiguous.
const step = (h, t) => { h.run('nextIdleAt = 1e12'); h.run(`draw(${t})`); };

// The 2026-08-26 quiet fix. A 600ms swat that re-armed 100ms later threw a whoosh
// roughly every 350ms for a whole 22-30s visit: the app's loudest source of "it
// never stops". The paw now rests 2.6-4.0s between swats (jittered, so it reads as
// a cat losing interest rather than a machine keeping time) and the whoosh has a
// 900ms floor of its own. Nothing pinned either number until this test: the only
// other whoosh test drives the scroll LEAF with the butterfly switched off.
test('the swat rests between swipes and never turns back into a metronome', () => {
  const h = playing({ soundOn: true, roamOn: false });
  h.run('var __swipes = 0, __str = []; playSwipe = function (s) { __swipes++; __str.push(s); };');
  const arms = [], whooshes = [];
  let lastArm = h.run('bfSwatT0'), lastCount = 0;
  for (let t = 1000 + STEP; t <= 40000 && h.run('bfOn'); t += STEP) {
    // Park the bug where the swat gate (62 < dh < 150 from the head) is open every
    // frame, but the pounce (dh < 87) and the dodge (dh < 60) never are. roamOn:false
    // keeps the stalk-walk off, so roamUntil stays 0 and nothing else moves the cat.
    h.run('bfX = pos.x + 100; bfY = pos.y - SH - 20;');
    step(h, t);
    const arm = h.run('bfSwatT0');
    if (arm !== lastArm) { arms.push(arm); lastArm = arm; }
    const n = h.run('__swipes');
    if (n !== lastCount) { whooshes.push(t); lastCount = n; }
  }
  assert.ok(arms.length >= 3, `the gate barely opened (${arms.length} swats in a full visit)`);
  assert.strictEqual(whooshes.length, arms.length, `${whooshes.length} whooshes for ${arms.length} swats: a second stroke inside one swat is sounding again`);
  for (let i = 1; i < arms.length; i++) {
    assert.ok(arms[i] - arms[i - 1] >= 2600, `swats ${i - 1} and ${i} were only ${arms[i] - arms[i - 1]}ms apart; the rest between them has shrunk`);
  }
  for (let i = 1; i < whooshes.length; i++) {
    assert.ok(whooshes[i] - whooshes[i - 1] >= 900, `whooshes ${i - 1} and ${i} were ${whooshes[i] - whooshes[i - 1]}ms apart; the 900ms floor is gone`);
  }
  assert.ok(arms.length <= Math.ceil(30000 / 2600) + 2, `${arms.length} swats in one visit is the old cadence`);
  const strengths = h.run('__str');
  assert.ok(strengths.every((s) => s >= 0 && s <= 1), `a swipe strength left 0..1: ${strengths.join(', ')}`);
});

// The behavioural test above would still pass with the numbers nudged a little,
// so pin them by name as well (the way tests/reel-spec.test.js pins --state ids).
test('the quiet constants are still spelled the way the fix left them', () => {
  assert.match(RENDERER, /const BF_SWAT_RANGE = 150, BF_SWAT_MS = 600;/, 'BF_SWAT_MS moved or changed');
  assert.match(RENDERER, /bfSwatCool = t \+ 2600 \+ Math\.random\(\) \* 1400;/, 'the jittered rest between swats changed');
  assert.match(RENDERER, /nextSwipeSound = t \+ 900;/, 'the whoosh time budget changed');
  assert.match(RENDERER, /const stroke = Math\.floor\(swing \/ Math\.PI\);/, 'the one-whoosh-per-stroke clock changed');
});

// Force the wind-up the way the dive path does: the bug parked at (bugDx, bugDy)
// from the feet and the hunt aimed at it, exactly as the trigger does. The leap
// aims the FEET one paw-reach under the bug, so a bug straight overhead at
// -POUNCE_REACH gives a leap that goes straight up and lands where it started.
function armPounce(h, t, bugDx, bugDy) {
  h.run(`bfMode = 'dive'; bfX = pos.x + ${bugDx}; bfY = pos.y + ${bugDy};
    huntUntil = ${t} + 1400; huntTarget = { x: bfX, y: bfY }; windingUp = true; windupT0 = ${t}; pounceFrom = { x: pos.x, y: pos.y };`);
}
const REACH = (h) => h.run('POUNCE_REACH');
// With armPounce(h, 1060, ...): the coil runs 1060..1300, the leap starts at 1360,
// the catch test first passes at 1540 (e = 0.6) and the cat lands at 1660.
const ARM = 1060, CATCH = 1540, LAND = 1660;

// Record every eyeMode drawCat is asked for, the way tests/petting.test.js does.
const watchEyes = (h) => h.run(`
  var __eyes = [];
  var __realDrawCat = drawCat;
  drawCat = function (g, sp, t, pal, o) { __eyes.push([t, o && o.eyeMode]); return __realDrawCat(g, sp, t, pal, o); };
`);

test('a catch: pink sparks at the paws, happy eyes on the bounce, and exactly one trill', () => {
  for (const soundOn of [true, false]) {
    const h = playing({ soundOn });
    h.run('var __chirps = 0; playChirp = function () { __chirps++; };');
    watchEyes(h);
    armPounce(h, ARM, 0, -REACH(h));
    let sparks = -1;
    for (let t = ARM; t <= 4000; t += STEP) {
      step(h, t);
      if (t === CATCH + STEP) sparks = h.run("hearts.filter((x) => x.kind === 'spark').length");
    }
    const tag = soundOn ? 'sound on' : 'sound off';
    assert.strictEqual(h.run('__chirps'), soundOn ? 1 : 0, `${tag}: expected ${soundOn ? 'one trill' : 'silence'} for one catch`);
    assert.ok(sparks >= 4, `${tag}: only ${sparks} pink sparks a frame after the catch`);
    const eyes = h.run('__eyes');
    const after = eyes.filter((e) => e[0] > LAND).map((e) => e[1]);
    assert.ok(after.includes('happy'), `${tag}: the eyes never squeezed shut on the victory bounce`);
    assert.strictEqual(eyes[eyes.length - 1][1], 'open', `${tag}: the happy eyes stuck after the beat was over`);
  }
});

test('a whiff (the bug jinks as the cat coils) gets no sparkle, no trill and no bounce; the cat watches it go', () => {
  const h = playing({ soundOn: true });
  h.run('var __chirps = 0; playChirp = function () { __chirps++; };');
  armPounce(h, ARM, 0, -REACH(h));
  for (let t = ARM; t <= LAND; t += STEP) {
    if (t === ARM + STEP * 2) h.run('bfX = pos.x + 90');   // the jink, applied by hand: the aim is already committed
    step(h, t);
  }
  assert.strictEqual(h.run('__chirps'), 0, 'a miss trilled');
  assert.strictEqual(h.run('hearts.length'), 0, 'a miss threw sparks or a heart');
  assert.strictEqual(h.run('idleSparkles.length'), 0, 'a miss still got the "got it!" sparkle');
  assert.ok(h.run('bfJoyT0') < 0, 'a miss opened the victory window');
  assert.strictEqual(h.run('lookTargetUntil'), LAND + 400, 'the cat should look after the bug it missed');
  assert.ok(h.run('lookTarget.y') < 0, 'the look after a miss should be UP, where the bug is');
  assert.ok(h.run('pouncing') === false && h.run('huntUntil') === 0, 'the pounce should be over');
});

// The hold: the bug sits in the paws for BF_HELD_MS after the catch, then slips out
// and climbs away, and only then does the victory window open. While it is held,
// nothing else may react to it: it is 50px under the head, inside both the dodge
// radius and the swat's reach, and either firing would snatch it out of the paws.
const HELD_MS = 550;

test('a pet set to stay put does not move a pixel through a catch, the hold and the bounce after it', () => {
  const h = playing({ roamOn: false });
  armPounce(h, ARM, 0, -REACH(h));
  for (let t = ARM; t <= LAND; t += STEP) step(h, t);
  assert.strictEqual(h.run('bfMode'), 'held', 'the leap should have connected and the bug should be in the paws');
  const x0 = h.run('pos.x'), y0 = h.run('pos.y');
  const swat0 = h.run('bfSwatUntil'), dodge0 = h.run('bfDodgeUntil');
  let worst = 0, released = -1, farthest = 0;
  for (let t = LAND + STEP; t <= 4000; t += STEP) {
    step(h, t);
    worst = Math.max(worst, Math.abs(h.run('pos.x') - x0), Math.abs(h.run('pos.y') - y0));
    assert.strictEqual(h.run('roamUntil'), 0, `a wander was armed at ${t}ms`);
    const mode = h.run('bfMode');
    if (mode === 'held') {
      assert.ok(t <= CATCH + HELD_MS, `still held at ${t}ms, ${t - CATCH}ms after the catch`);
      farthest = Math.max(farthest, Math.abs(h.run('bfX') - x0));
      assert.strictEqual(h.run('bfSwatUntil'), swat0, `a swat was armed at the bug in its own paws (${t}ms)`);
      assert.strictEqual(h.run('bfDodgeUntil'), dodge0, `the held bug was kicked into a dodge (${t}ms)`);
    } else if (released < 0) {
      released = t;
      assert.strictEqual(mode, 'out', `the bug left the paws into '${mode}', not 'out'`);
      assert.ok(h.run('bfVy') < 0, 'the release should climb, not drop');
      assert.ok(h.run('bfJoyT0') >= 0, 'the victory window should open as the bug gets away');
    }
  }
  assert.ok(released > CATCH + HELD_MS && released <= CATCH + HELD_MS + STEP, `released at ${released}ms, expected the first frame after ${CATCH + HELD_MS}ms`);
  assert.ok(farthest < 3, `the held bug wandered ${farthest.toFixed(1)}px from the paws`);
  assert.strictEqual(worst, 0, `the catch moved a stay-put pet ${worst.toFixed(2)}px`);
  // The bounce is a render offset, never a position: it must be there (else the beat
  // is a face and nothing more) and it must have gone by the end of the window.
  const joyT0 = h.run('bfJoyT0');
  assert.ok(h.run(`bfJoyHop(${joyT0 + 350})`) > 8, 'the first bounce should lift the sprite');
  assert.ok(h.run(`bfJoyHop(${joyT0 + 1050})`) > 4, 'the second, smaller bounce should still lift it');
  assert.strictEqual(h.run(`bfJoyHop(${joyT0 + 1400})`), 0, 'the bounce should be over when the window closes');
});

// "oh! a butterfly": the moment the bug is first spotted (bfMode in -> wander) the cat
// gets a small perk and a "!" over the head for half a second, then nothing. It opens
// on the first frame of a visit, before a --shot's capture timer even starts, so a
// test is the only place it can be checked.
test('spotting the butterfly draws a "!" for half a second and then stops', () => {
  const h = playing();
  h.run('var __sparks = []; drawDoneSpark = function (x, y, t) { __sparks.push(t); };');
  let spotted = -1;
  for (let t = 1000 + STEP; t <= 6000; t += STEP) {
    step(h, t);
    if (spotted < 0 && h.run('bfMode') !== 'in') spotted = t;
  }
  assert.ok(spotted > 0, 'the butterfly never came close enough to be spotted');
  assert.strictEqual(h.run('bfNoticeT0'), spotted, 'the notice should open on the frame the bug is spotted');
  const sparks = h.run('__sparks');
  const during = sparks.filter((t) => t >= spotted && t < spotted + 500);
  const after = sparks.filter((t) => t >= spotted + 600 && t < spotted + 3000);
  assert.ok(during.length >= 6, `the "!" should show on every frame of the half second (${during.length} frames)`);
  assert.strictEqual(after.length, 0, `the "!" stayed up ${after.length} frames past its window`);
  assert.strictEqual(sparks.filter((t) => t < spotted).length, 0, 'a "!" showed before the bug was spotted');
});

// The cat's tail now takes an excitement argument (wagBoost plus a butterfly in
// play), mirroring the mood argument the dog's tail already had. The dog path must
// not change, and a cat's wagBoost must decay the way a dog's does instead of being
// zeroed every frame, which is what kept the cat locked out before.
test('the cat tail takes an excitement arg in 0..1 and the dog tail is untouched', () => {
  const dog = loadOverlay();
  dog.run('setSpecies("dog")');
  dog.ipc('onConfig', { species: 'dog', soundOn: false, butterflyOn: false, followCursor: true, floorLock: true, moodOn: false });
  dog.run('var __dog = [], __cat = 0; var __dt = drawDogTail; drawDogTail = function () { __dog.push(arguments.length); return __dt.apply(null, arguments); }; drawTail = function () { __cat++; };');
  for (let t = STEP; t <= 3000; t += STEP) step(dog, t);   // past the hello-stretch, which hides the tail
  assert.strictEqual(dog.run('__cat'), 0, 'a dog drew a cat tail');
  assert.ok(dog.run('__dog.length') > 0, 'the dog never drew its tail');
  assert.ok(dog.run('__dog').every((n) => n === 7), 'drawDogTail is being called with a different arity');

  const cat = loadOverlay();
  cat.ipc('onConfig', { species: 'cat', soundOn: false, butterflyOn: false, followCursor: true, floorLock: true, moodOn: false });
  cat.run('var __ex = []; var __rt = drawTail; drawTail = function () { __ex.push([arguments.length, arguments[6]]); return __rt.apply(null, arguments); };');
  for (let t = STEP; t <= 3000; t += STEP) step(cat, t);
  const ex = cat.run('__ex');
  assert.ok(ex.length > 0, 'the cat never drew its tail');
  assert.ok(ex.every((e) => e[0] === 7 && typeof e[1] === 'number' && e[1] >= 0 && e[1] <= 1),
    `a tail call broke the contract (7 args, excitement 0..1): ${JSON.stringify(ex.find((e) => !(e[0] === 7 && e[1] >= 0 && e[1] <= 1)))}`);
  assert.ok(ex.every((e) => e[1] === 0), 'a cat with nothing to be excited about should have a resting tail');
  cat.run('wagBoost = 1');
  step(cat, 3060); step(cat, 3120);
  const wb = cat.run('wagBoost');
  assert.ok(wb > 0 && wb < 1, `a cat's wagBoost should decay like a dog's, not be zeroed or held (${wb})`);
  const last = cat.run('__ex[__ex.length - 1]');
  assert.ok(last[1] > 0.9, `the tail should read the boost (excitement ${last[1]})`);
});

// Work mode and Focus Guard stop UNSOLICITED visits and stop the pet wandering off;
// they do not veto what you clicked, the rule the treat and the ball already follow.
// Before this, "Send a butterfly" in work mode summoned a bug that left on the very
// next frame: a dead click, and exactly what a user sees when the mode is on.
test('"Send a butterfly" in work mode gets a visit that stays; an unsolicited one still leaves', () => {
  const h = loadOverlay();
  h.ipc('onConfig', { species: 'cat', soundOn: false, butterflyOn: true, followCursor: true, floorLock: true, roamOn: true, moodOn: false, workMode: true });
  h.run('lastCursorMove = -99999');
  h.run('draw(1000)');
  h.ipc('onAction', 'companion');
  assert.ok(h.run('bfOn'), 'the button should still summon a butterfly in work mode');
  let caught = false;
  for (let t = 1000 + STEP; t <= 6000; t += STEP) {
    step(h, t);
    caught = caught || h.run("bfMode === 'held'");
    if (caught) break;   // a catch ends a visit on purpose: that is the play working, not work mode
    assert.ok(h.run('bfOn'), `the summoned butterfly despawned at ${t}ms`);
    assert.notStrictEqual(h.run('bfMode'), 'out', `work mode sent the butterfly you asked for home at ${t}ms`);
  }
  // Force the visit over and let it despawn, then an unsolicited visit must still be
  // evicted: the exemption is per visit, not a switch left on.
  h.run('bfUntil = 0');
  let t = 6000;
  while (h.run('bfOn') && t < 20000) { t += STEP; step(h, t); }
  assert.strictEqual(h.run('bfOn'), false, 'the summoned visit never ended');
  h.run(`startBflyVisit(${t})`);
  step(h, t + STEP);
  assert.strictEqual(h.run('bfMode'), 'out', 'an unsolicited visit in work mode should still be sent home');
});

// The aim fix makes a leap at a frozen bug connect every time, which would end a visit at
// the first pounce a couple of seconds in. Across seeds, with the opening embargo and the
// jink in place: most visits still end in a catch, some pounces still whiff, and no pounce
// happens before the embargo is up. (Before the aim fix: 0 catches in 316 pounces.)
test('most visits end in a catch, some pounces still whiff, none in the opening seconds', () => {
  let visits = 0, caught = 0, pounces = 0, whiffs = 0, earliest = Infinity, embargo = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const h = loadOverlay({ seed: 0x9e3779b9 + seed * 7919 });
    h.ipc('onConfig', { species: 'cat', soundOn: false, butterflyOn: true, followCursor: true, floorLock: true, roamOn: true, moodOn: false });
    h.run('startBflyVisit(1000); lastCursorMove = -99999;');
    embargo = h.run('BF_POUNCE_AFTER_MS');
    visits++;
    let wasP = false, got = false;
    for (let t = 1000 + STEP; t <= 45000 && h.run('bfOn'); t += STEP) {
      step(h, t);
      const p = h.run('pouncing');
      if (p && !wasP) { pounces++; earliest = Math.min(earliest, t - 1000); }
      if (!p && wasP) { if (h.run("bfMode === 'held'")) got = true; else whiffs++; }
      wasP = p;
    }
    if (got) caught++;
  }
  assert.ok(pounces >= visits, pounces + ' pounces in ' + visits + ' visits: the cat has stopped trying');
  assert.ok(caught / visits >= 0.6, 'only ' + caught + ' of ' + visits + ' visits ended in a catch');
  assert.ok(whiffs >= 1, 'every single pounce connected: the jink is gone and it is no longer a game');
  assert.ok(earliest >= embargo, 'a pounce ' + earliest + 'ms into a visit, before the ' + embargo + 'ms of watching and swatting');
});

test('a Focus Guard busy signal sends a flying butterfly home', () => {
  const h = playing();
  step(h, 1000 + STEP);
  assert.notStrictEqual(h.run('bfMode'), 'out', 'the visit should be under way before the meeting starts');
  h.ipc('onFocus', { busy: true, reason: 'meeting' });
  step(h, 1000 + STEP * 2);
  assert.strictEqual(h.run('bfMode'), 'out', 'a meeting starting mid-visit should send the butterfly off, the way the work-mode toggle does');
});
