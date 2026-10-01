// The overlay's own classic scripts, in the order index.html loads them.
//
// They share one global scope, so a later part can read what an earlier one
// declared. index.html, scripts/overlay-vm.js, the lint config and the tests
// that read the overlay's source all take the order from here, and
// tests/overlay-parts.test.js fails if index.html drifts from it.
//
// Node only: the browser never loads this file.
const fs = require('fs');
const path = require('path');

const OVERLAY_PARTS = [
  'poses.js',
  'species.js',
  'body.js',
  'state.js',
  'play.js',
  'climb.js',
  'visitors.js',
  'frame.js',
  'input.js',
];

/** Paths relative to src/, as index.html writes them. */
const OVERLAY_SRC = OVERLAY_PARTS.map((name) => `overlay/${name}`);

/** Absolute paths, in load order. */
function overlayPartPaths() {
  return OVERLAY_PARTS.map((name) => path.join(__dirname, name));
}

/** The whole overlay as one string, in load order, for tests that pin its source. */
function readOverlaySource() {
  return overlayPartPaths().map((p) => fs.readFileSync(p, 'utf8')).join('\n');
}

module.exports = { OVERLAY_PARTS, OVERLAY_SRC, overlayPartPaths, readOverlaySource };
