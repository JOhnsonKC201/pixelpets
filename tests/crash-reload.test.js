const test = require('node:test');
const assert = require('node:assert');
const { onRendererGone, MAX_RELOADS } = require('../src/main/crash-reload');

test('a crash loop backs off, then gives up instead of reloading forever', () => {
  let state = { crashes: 0, lastAt: 0 };
  const waits = [];
  let t = 1_000_000;
  for (let i = 0; i < MAX_RELOADS + 1; i++) {
    const r = onRendererGone(state, t);
    state = r.state;
    if (r.giveUp) { waits.push('give up'); break; }
    waits.push(r.reloadIn);
    t += r.reloadIn + 50;   // crashes again right after each reload
  }
  assert.deepStrictEqual(waits, [400, 800, 1600, 3200, 6400, 'give up']);
});

test('the wait is capped', () => {
  const r = onRendererGone({ crashes: 40, lastAt: 0 }, 1000);
  assert.ok(r.giveUp);
  const capped = onRendererGone({ crashes: 4, lastAt: 1000 }, 2000);
  assert.ok(capped.reloadIn <= 15000);
});

test('a renderer that stayed up a minute starts the count over', () => {
  const r = onRendererGone({ crashes: MAX_RELOADS, lastAt: 0 }, 60_001);
  assert.strictEqual(r.state.crashes, 1);
  assert.strictEqual(r.reloadIn, 400);
});
