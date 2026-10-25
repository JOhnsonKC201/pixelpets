// Whiskers are the one part of the cat that was not on the pixel grid. They were
// stroked as 1px anti-aliased lines on the sprite's native canvas, which is then
// scaled up nearest-neighbour, so the soft edge pixels were magnified into a grey
// blur next to an otherwise crisp sprite. They are now laid down as whole pixels.
const test = require('node:test');
const assert = require('node:assert');
const { pixelLine } = require('../src/cat-sprite.js');
const { loadOverlay } = require('../scripts/overlay-vm.js');

// A 2D context that records what is drawn instead of drawing it.
function recorder() {
  const rects = [], strokes = [];
  return {
    rects, strokes,
    fillRect(x, y, w, h) { rects.push([x, y, w, h]); },
    stroke() { strokes.push(1); },
    beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
  };
}

test('pixelLine lays down whole, touching pixels from end to end', () => {
  const g = recorder();
  pixelLine(g, 2, 3, 15, 7);
  const px = g.rects;
  for (const [x, y, w, h] of px) {
    assert.ok(Number.isInteger(x) && Number.isInteger(y), `off-grid pixel at ${x},${y}`);
    assert.deepStrictEqual([w, h], [1, 1]);
  }
  assert.deepStrictEqual(px[0].slice(0, 2), [2, 3], 'starts at the start');
  assert.deepStrictEqual(px[px.length - 1].slice(0, 2), [15, 7], 'ends at the end');
  for (let i = 1; i < px.length; i++) {
    const dx = Math.abs(px[i][0] - px[i - 1][0]), dy = Math.abs(px[i][1] - px[i - 1][1]);
    assert.ok(dx <= 1 && dy <= 1 && dx + dy > 0, `gap between pixel ${i - 1} and ${i}`);
  }
  assert.equal(px.length, 14, 'one pixel per column on a shallow line, no doubled stairs');
});

test('pixelLine rounds fractional ends, as an animated whisker tip has', () => {
  const g = recorder();
  pixelLine(g, 10.4, 20.6, 4.2, 22.49);
  assert.deepStrictEqual(g.rects[0].slice(0, 2), [10, 21]);
  assert.deepStrictEqual(g.rects[g.rects.length - 1].slice(0, 2), [4, 22]);
});

test('where whiskers cross, the pixel is painted once, not doubled into a bright dot', () => {
  const { drawWhiskers } = require('../src/cat-sprite.js');
  const g = recorder();
  for (const t of [null, 0, 2600, 5100]) {
    g.rects.length = 0;
    drawWhiskers(g, { muzzle: { x: 48, y: 70 } }, 0, t);
    const keys = g.rects.map(([x, y]) => `${x},${y}`);
    assert.equal(new Set(keys).size, keys.length, `t=${t}: a pixel was painted twice`);
    assert.ok(keys.length > 30, 'six whiskers worth of pixels');
  }
});

test('the overlay draws a cat\'s whiskers as pixels, never as a smoothed stroke', () => {
  const h = loadOverlay();
  h.run('setSpecies("cat")');
  const out = h.run(`(() => {
    const rects = [], strokes = [];
    const g = new Proxy({}, {
      get(_t, k) {
        if (k === 'fillRect') return (x, y, w, hh) => rects.push([x, y, w, hh]);
        if (k === 'stroke') return () => strokes.push(1);
        return () => {};
      },
      set() { return true; },
    });
    const sp = sprites[0];
    const p = PATTERNS[0];
    const pal = { O: toRgb(p.outline), C: toRgb(p.coat), K: toRgb(p.mark), W: toRgb(p.white), X: toRgb(p.patch),
      I: toRgb(p.inner), N: toRgb(p.nose), E: toRgb(p.eye), H: toRgb(HALO) };
    drawCat(g, sp, 1234, pal, { bob: 0, eyeMode: 'open' });
    return { strokes: strokes.length, offGrid: rects.filter(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y)).length };
  })()`);
  assert.equal(out.strokes, 0, 'an open-eyed cat strokes nothing; whiskers are filled pixels');
  assert.equal(out.offGrid, 0, 'every pixel lands on a whole coordinate, even mid-twitch');
});
