// The two ambient Quick Tools alerts: low battery and the 20-20-20 eye-rest
// nudge. Both are rules about WHEN to speak, and both get annoying fast if they
// fire twice, so the tests are about edges and repeats rather than the happy path.
const test = require('node:test');
const assert = require('node:assert');

const { batteryEdge } = require('../src/tools/battery');
const { eyeRestDue, EYE_REST_MS } = require('../src/tools/eyerest');

test('battery alerts once on the way down and re-arms only after charging or recovering', () => {
  let armed = true;
  const step = (level, charging = false) => {
    const r = batteryEdge(armed, { level, charging });
    armed = r.armed;
    return r.alert;
  };
  assert.strictEqual(step(0.5), false);
  assert.strictEqual(step(0.21), false);
  assert.strictEqual(step(0.2), true);
  assert.strictEqual(step(0.19), false);   // no repeat while still low
  assert.strictEqual(step(0.12), false);
  assert.strictEqual(step(0.22), false);   // not yet re-armed (hysteresis)
  assert.strictEqual(step(0.1), false);
  assert.strictEqual(step(0.1, true), false);  // plugged in: re-arms, never alerts
  assert.strictEqual(step(0.15), true);        // unplugged while low: alert again
});

test('battery ignores junk readings', () => {
  for (const b of [{ level: NaN }, { level: -1 }, { level: 2 }, {}, null]) {
    assert.deepStrictEqual(batteryEdge(true, b), { alert: false, armed: true });
  }
});

test('eye rest is due every 20 minutes, never while busy or away', () => {
  assert.strictEqual(eyeRestDue({ lastAt: 0, now: EYE_REST_MS - 1, busy: false }), false);
  assert.strictEqual(eyeRestDue({ lastAt: 0, now: EYE_REST_MS, busy: false }), true);
  assert.strictEqual(eyeRestDue({ lastAt: 0, now: EYE_REST_MS * 3, busy: true }), false);
  assert.strictEqual(eyeRestDue({ lastAt: 0, now: EYE_REST_MS * 3, busy: false, idle: true }), false);
});
