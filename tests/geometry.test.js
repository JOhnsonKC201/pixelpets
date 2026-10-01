const test = require('node:test');
const assert = require('node:assert');
const { floorGeometry } = require('../src/main/geometry');

const display = (x, y, width, height) => ({ x, y, width, height });

test('a bottom taskbar puts the floor on its top edge', () => {
  const g = floorGeometry(display(0, 0, 1920, 1080), display(0, 0, 1920, 1032));
  assert.deepStrictEqual(g, { bottomInset: 48, topInset: 0, leftInset: 0, rightInset: 0, bottomWorkY: 1032 });
});

test('a top menu bar (macOS) leaves the floor at the bottom', () => {
  const g = floorGeometry(display(0, 0, 1440, 900), display(0, 25, 1440, 875));
  assert.strictEqual(g.topInset, 25);
  assert.strictEqual(g.bottomInset, 0);
  assert.strictEqual(g.bottomWorkY, 900);
});

test('a side taskbar shows up as a side inset only', () => {
  const g = floorGeometry(display(0, 0, 1920, 1080), display(62, 0, 1858, 1080));
  assert.deepStrictEqual([g.leftInset, g.rightInset, g.bottomInset], [62, 0, 0]);
});

test('a primary display that is not at the origin still measures from its own top', () => {
  const g = floorGeometry(display(-1920, 200, 1920, 1080), display(-1920, 200, 1920, 1040));
  assert.strictEqual(g.bottomWorkY, 1040);
  assert.strictEqual(g.bottomInset, 40);
});

test('a work area larger than the display (auto-hide quirks) never gives a negative inset', () => {
  const g = floorGeometry(display(0, 0, 100, 100), display(-2, -2, 104, 104));
  assert.deepStrictEqual([g.topInset, g.leftInset, g.rightInset, g.bottomInset], [0, 0, 0, 0]);
});
