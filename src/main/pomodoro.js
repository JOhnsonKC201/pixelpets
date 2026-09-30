// Pomodoro: focus/break loops.
//
// Main owns the phase clock (the overlay may throttle or pause); the overlay
// just draws a countdown from { on, phase, endsAt }. Phase flips ride existing
// reactions: focus -> break is the stretch break, break -> focus is a "back to
// focus" bubble.

const MINUTE = 60000;
const MIN_WAIT_MS = 250;
// How late a flip may be before the scheduler's tick flips it by hand, e.g.
// after the machine slept through the timer.
const CATCH_UP_GRACE_MS = 1000;

/**
 * @param {object} d
 * @param {() => object|null} d.getCfg
 * @param {(state: { on: boolean, phase: string, endsAt: number }) => void} d.send
 * @param {() => void} d.onBreak    focus ended
 * @param {() => void} d.onFocus    break ended
 * @param {() => number} [d.now]
 * @param {Function} [d.setTimer]
 * @param {Function} [d.clearTimer]
 */
function makePomodoro({ getCfg, send, onBreak, onFocus, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let phase = 'focus', endsAt = 0, timer = null;
  const settings = () => { const c = getCfg(); return c && c.pomodoro && c.pomodoro.on ? c.pomodoro : null; };

  function publish() {
    send({ on: !!settings(), phase, endsAt });
  }
  function arm() {
    if (timer) { clearTimer(timer); timer = null; }
    if (!settings()) return;
    timer = setTimer(flip, Math.max(MIN_WAIT_MS, endsAt - now()));
  }
  function flip() {
    const p = settings();
    if (!p) return;
    if (phase === 'focus') {
      phase = 'break'; endsAt = now() + p.breakMin * MINUTE;
      onBreak();
    } else {
      phase = 'focus'; endsAt = now() + p.focusMin * MINUTE;
      onFocus();
    }
    publish(); arm();
  }
  // (Re)start or stop the loop whenever the pomodoro settings change.
  function sync() {
    const p = settings();
    if (p) { phase = 'focus'; endsAt = now() + p.focusMin * MINUTE; }
    else endsAt = 0;
    publish(); arm();
  }
  // Called from the minute scheduler: a timer that fired late (sleep, a busy
  // event loop) must not leave the countdown stuck at zero.
  function catchUp() {
    if (settings() && endsAt && now() > endsAt + CATCH_UP_GRACE_MS) flip();
  }
  function stop() {
    if (timer) { clearTimer(timer); timer = null; }
  }

  return { publish, sync, catchUp, stop, state: () => ({ phase, endsAt }) };
}

module.exports = { makePomodoro };
