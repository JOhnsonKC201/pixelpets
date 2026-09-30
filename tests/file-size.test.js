// Every source file stays small enough to read in one sitting (CONTRIBUTING.md,
// "Keep files small"). The overlay and main.js were split to meet it, and this
// keeps them from drifting back.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const MAX_LINES = 800;

function* jsFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

test(`no source file passes ${MAX_LINES} lines`, () => {
  const tooLong = [];
  for (const file of jsFiles(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    if (lines > MAX_LINES) tooLong.push(`${path.relative(SRC, file)} (${lines})`);
  }
  assert.deepStrictEqual(tooLong, [], 'split these before they grow further');
});
