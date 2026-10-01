const test = require('node:test');
const assert = require('node:assert');
const { parseCli } = require('../src/main/cli');

test('a normal launch forces nothing', () => {
  const cli = parseCli(['electron', '.']);
  assert.strictEqual(cli.SHOT, false);
  assert.strictEqual(cli.SHEET, false);
  assert.strictEqual(cli.REEL, false);
  assert.strictEqual(cli.stateArg, '');
  assert.strictEqual(cli.noteArg, '');
  assert.strictEqual(cli.shotAtMs, 700);
});

test('preview flags are read from --name=value', () => {
  const cli = parseCli(['--shot', '--state=hunt', '--pattern=tuxedo', '--dir=up', '--species=dog', '--at=1200']);
  assert.strictEqual(cli.SHOT, true);
  assert.strictEqual(cli.stateArg, 'hunt');
  assert.strictEqual(cli.patternArg, 'tuxedo');
  assert.strictEqual(cli.dirArg, 'up');
  assert.strictEqual(cli.speciesArg, 'dog');
  assert.strictEqual(cli.shotAtMs, 1200);
});

test('a note keeps every = after the first', () => {
  assert.strictEqual(parseCli(['--note=2+2=4']).noteArg, '2+2=4');
});

test('--at of zero, junk or a negative falls back to a sane delay', () => {
  assert.strictEqual(parseCli(['--at=0']).shotAtMs, 700);
  assert.strictEqual(parseCli(['--at=soon']).shotAtMs, 700);
  assert.strictEqual(parseCli(['--at=-50']).shotAtMs, 0);
});

test('boolean props accept both --treat and --treat=1', () => {
  const cli = parseCli(['--treat=1', '--bfly']);
  assert.strictEqual(cli.hasFlag('treat'), true);
  assert.strictEqual(cli.hasFlag('bfly'), true);
  assert.strictEqual(cli.hasFlag('ball'), false);
  // a prefix is not a match
  assert.strictEqual(parseCli(['--treats']).hasFlag('treat'), false);
});

test('reel knobs default when absent and parse when given', () => {
  const dflt = parseCli(['--reel']).reel;
  assert.deepStrictEqual(
    { w: dflt.w, h: dflt.h, scale: dflt.scale, frames: dflt.frames, fps: dflt.fps, every: dflt.every, drag: dflt.drag },
    { w: 1920, h: 1080, scale: 3, frames: 48, fps: 20, every: 1, drag: false },
  );
  const set = parseCli(['--reel', '--out=C:\\frames', '--w=1280', '--every=3', '--drag']).reel;
  assert.strictEqual(set.out, 'C:\\frames');
  assert.strictEqual(set.w, 1280);
  assert.strictEqual(set.every, 3);
  assert.strictEqual(set.drag, true);
});

test('--every never drops below one paint kept per paint rendered', () => {
  assert.strictEqual(parseCli(['--every=0']).reel.every, 1);
});
