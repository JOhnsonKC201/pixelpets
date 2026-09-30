const test = require('node:test');
const assert = require('node:assert');
const { makePomodoro } = require('../src/main/pomodoro');

const MIN = 60000;

// A pomodoro on a hand-driven clock. `advance(ms)` moves time and fires any
// timer that came due, the way the event loop would.
function setup(pomo) {
  const clock = { t: 1_000_000 };
  let cfg = { pomodoro: pomo };
  let pending = null;
  const sent = [], events = [];
  const p = makePomodoro({
    getCfg: () => cfg,
    send: (s) => sent.push(s),
    onBreak: () => events.push('break'),
    onFocus: () => events.push('focus'),
    now: () => clock.t,
    setTimer: (fn, ms) => { pending = { fn, at: clock.t + ms }; return pending; },
    clearTimer: (h) => { if (pending === h) pending = null; },
  });
  const advance = (ms) => {
    clock.t += ms;
    while (pending && pending.at <= clock.t) { const { fn } = pending; pending = null; fn(); }
  };
  return { p, clock, sent, events, advance, setCfg: (c) => { cfg = c; }, pending: () => pending };
}

test('turning it on starts a focus block and tells the overlay', () => {
  const { p, clock, sent } = setup({ on: true, focusMin: 25, breakMin: 5 });
  p.sync();
  assert.deepStrictEqual(sent.at(-1), { on: true, phase: 'focus', endsAt: clock.t + 25 * MIN });
});

test('focus flips to break, and break back to focus', () => {
  const { p, sent, events, advance } = setup({ on: true, focusMin: 25, breakMin: 5 });
  p.sync();
  advance(25 * MIN);
  assert.deepStrictEqual(events, ['break']);
  assert.strictEqual(sent.at(-1).phase, 'break');
  advance(5 * MIN);
  assert.deepStrictEqual(events, ['break', 'focus']);
  assert.strictEqual(sent.at(-1).phase, 'focus');
});

test('turning it off stops the loop and clears the countdown', () => {
  const { p, sent, events, advance, setCfg, pending } = setup({ on: true, focusMin: 25, breakMin: 5 });
  p.sync();
  setCfg({ pomodoro: { on: false, focusMin: 25, breakMin: 5 } });
  p.sync();
  assert.strictEqual(pending(), null);
  assert.deepStrictEqual(sent.at(-1), { on: false, phase: 'focus', endsAt: 0 });
  advance(60 * MIN);
  assert.deepStrictEqual(events, []);
});

test('a flip the timer missed is caught up by the scheduler', () => {
  const { p, clock, events } = setup({ on: true, focusMin: 25, breakMin: 5 });
  p.sync();
  p.stop();                        // the timer never fires, as if the machine slept
  clock.t += 25 * MIN + 500;
  p.catchUp();
  assert.deepStrictEqual(events, [], 'inside the grace period nothing happens yet');
  clock.t += 1000;
  p.catchUp();
  assert.deepStrictEqual(events, ['break']);
});

test('catch-up does nothing while it is off', () => {
  const { p, clock, events } = setup(undefined);
  p.sync();
  clock.t += 10 * 60 * MIN;
  p.catchUp();
  assert.deepStrictEqual(events, []);
});
