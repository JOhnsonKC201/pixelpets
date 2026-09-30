// The --shot preview window has to cover the preview canvas.
//
// the overlay's SHOT branch sizes the canvas itself; main.js builds the window that
// gets screen-captured. Those two numbers lived in different files with nothing
// tying them together, and the window was 20px narrower than the canvas - so every
// --shot capture silently cropped the right-hand edge, and the missing pixels read
// as a rendering bug in whatever was being previewed rather than as a window that
// was too small. Neither file is wrong on its own, which is why it went unnoticed;
// only the pair is wrong. Pin them.
//
// Parsed from source rather than imported: main.js pulls in Electron at require
// time, which is not available under `node --test`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the --shot window covers the canvas the overlay draws into', () => {
  const renderer = require('../src/overlay/parts').readOverlaySource();
  const main = read(path.join('src', 'main.js'));

  // the overlay: `viewW = 260; viewH = 320; viewDpr = 1;` inside `if (SHOT) {`
  const canvas = renderer.match(/viewW\s*=\s*(\d+)\s*;\s*viewH\s*=\s*(\d+)\s*;\s*viewDpr\s*=\s*1/);
  assert.ok(canvas, 'could not find the SHOT canvas size in the overlay (src/overlay/) - update this test with it');
  const cw = Number(canvas[1]), chh = Number(canvas[2]);

  // main.js: the shared constant the preview window is built from.
  const declared = main.match(/SHOT_CANVAS\s*=\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+)\s*\}/);
  assert.ok(declared, 'main.js no longer declares SHOT_CANVAS');
  assert.strictEqual(Number(declared[1]), cw, 'main.js SHOT_CANVAS.w drifted from the canvas the overlay creates');
  assert.strictEqual(Number(declared[2]), chh, 'main.js SHOT_CANVAS.h drifted from the canvas the overlay creates');

  // ...and the window is actually built from it, not from a second hard-coded pair.
  assert.match(main, /width:\s*SHOT_CANVAS\.w/, 'the preview window width should come from SHOT_CANVAS');
  assert.match(main, /height:\s*SHOT_CANVAS\.h/, 'the preview window height should come from SHOT_CANVAS');
});
