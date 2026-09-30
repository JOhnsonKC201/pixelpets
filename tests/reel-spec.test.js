// The reel (scripts/make-reel.js) films the REAL renderer by forcing it into a pose
// and by reaching into the overlay variables by name. Every coupling below has the
// same failure shape: nothing throws, a frame still renders, and what comes out is
// an ordinary sitting cat underneath a label confidently describing something else.
// That is the worst kind of break for a marketing asset, because the only thing
// that catches it is a human watching all ten clips and knowing what to expect.
//
// So pin the pairs. Same approach as tests/shot-window.test.js: the overlay is a
// browser script that cannot be required under `node --test`, so its constants are
// parsed out of source, while the reel's own move table is a plain CommonJS module
// and is required directly.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const reel = require('../scripts/make-reel.js');
const renderer = require('../src/overlay/parts').readOverlaySource();

test('every pose the reel forces is a pose the overlay still honours', () => {
  for (const m of reel.MOVES.filter((x) => x.state)) {
    assert.ok(
      renderer.includes(`FORCED_STATE === '${m.state}'`),
      `reel move "${m.id}" forces state=${m.state}, which the overlay no longer branches on. `
      + 'The capture would silently fall through to an idle sit under the label '
      + `"${m.label}".`,
    );
  }
});

test('the drag driver still names variables that exist in the overlay (src/overlay/)', () => {
  // The mochi clip cannot use --state=mochi (that branch pins the springs, giving a
  // frozen pose), so it drives a real drag by assigning the overlay's own top-level
  // `let`s. Renaming any of them turns the clip back into a cat sitting still.
  const main = read(path.join('src', 'main.js'));
  const driver = main.match(/const DRAG_DRIVER = `([\s\S]*?)`;/);
  assert.ok(driver, 'src/main.js no longer defines DRAG_DRIVER');

  for (const name of ['grabbing', 'cursor', 'petBurstUntil', 'petTouchUntil']) {
    assert.match(driver[1], new RegExp(`\\b${name}\\b`), `DRAG_DRIVER stopped using ${name}`);
    assert.match(renderer, new RegExp(`^let [^;\\n]*\\b${name}\\b`, 'm'),
      `DRAG_DRIVER assigns ${name}, but the overlay no longer declares it at top level`);
  }
});

test('the reel frames the pet using the numbers the overlay actually uses', () => {
  // LEFT and TOP are derived from the SHOT canvas and the pet's anchor inside it.
  // If either drifts, the pet slides off the wallpaper or off the frame entirely,
  // and the capture still succeeds.
  const canvas = renderer.match(/viewW\s*=\s*(\d+)\s*;\s*viewH\s*=\s*(\d+)\s*;\s*viewDpr\s*=\s*1/);
  assert.ok(canvas, 'could not find the SHOT canvas size in the overlay (src/overlay/)');
  assert.strictEqual(Number(canvas[1]), 260, 'SHOT canvas width changed; recompute LEFT in make-reel.js');
  assert.strictEqual(Number(canvas[2]), 320, 'SHOT canvas height changed; recompute TOP in make-reel.js');

  const anchor = renderer.match(/if \(SHOT\) pos = \{ x: (\d+), y: (\d+) \}/);
  assert.ok(anchor, 'the overlay no longer pins the pet position under SHOT');
  assert.strictEqual(Number(anchor[1]), 130, 'SHOT pet x moved; LEFT no longer centres the pet');
  assert.strictEqual(Number(anchor[2]), 250, 'SHOT pet y moved; TOP no longer lands its feet on the taskbar');

  // Every shot is framed from the pose's measured `reach` so the pet clears the
  // label band. This is the invariant the first cut broke: at one shared scale the
  // rope climb ran straight into the caption and the compact poses sat 400px below
  // it, which is what made the whole thing look like a screenshot with text on it.
  for (const m of reel.MOVES) {
    const f = reel.frameFor(m);
    const gap = f.petTop - reel.LABEL_BOTTOM;
    assert.ok(gap >= reel.PET_CLEARANCE,
      `move "${m.id}" (reach ${m.reach}, scale ${m.scale}) leaves only ${gap}px under the label, `
      + `needs ${reel.PET_CLEARANCE}. Lower its scale or re-measure its reach.`);
    assert.ok(f.petTop < reel.FEET,
      `move "${m.id}" is framed so its top is below its own feet, which cannot be right`);
  }
});

test('the reel coat has the painted climb art the scroll clip promises', () => {
  // Only some coats ship painted rope-climb frames; the rest fall back to swiping at
  // a leaf, which does not read as climbing and makes the label wrong.
  const skip = renderer.match(/CLIMB_FRAME_SKIP = new Set\(\[([^\]]*)\]\)/);
  assert.ok(skip, 'the overlay no longer declares CLIMB_FRAME_SKIP');
  assert.ok(!skip[1].includes(`'${reel.COAT}'`), `the reel coat "${reel.COAT}" is excluded from painted climb frames`);

  for (const frame of ['idle', 'up1', 'up2', 'down1', 'down2']) {
    const p = path.join(ROOT, 'assets', 'climb', reel.COAT, `${frame}.png`);
    assert.ok(fs.existsSync(p), `missing painted climb art: assets/climb/${reel.COAT}/${frame}.png`);
  }
});

test('labels are safe to hand to ffmpeg and safe to publish', () => {
  const seen = new Set();
  for (const m of reel.MOVES) {
    // drawtext splits options on ':' and quotes on '\''. Keeping labels to plain
    // capitals and spaces means the filtergraph never needs escaping to be correct,
    // rather than needing it to be correct AND right.
    assert.match(m.label, /^[A-Z ]+$/, `label for "${m.id}" has characters drawtext would need escaped: ${m.label}`);
    assert.ok(!/[–—]/.test(m.label), `label for "${m.id}" contains an en or em dash`);
    assert.ok(m.label.length <= 42, `label for "${m.id}" is ${m.label.length} chars and will crowd the frame`);
    assert.ok(!seen.has(m.label), `two moves share the label "${m.label}"`);
    seen.add(m.label);
  }
});
