// What to do when the overlay's renderer dies.
//
// For the live pet, recover by reloading, so a transparent-overlay GPU crash
// never leaves a dead, invisible window. Backed off and capped: a transparent
// always-on-top compositor meets every consumer GPU driver in the wild, and a
// driver that crashes the renderer on load would otherwise reload every 400ms
// forever, burning CPU, spamming the log and flickering the overlay with no way
// for the user to see why. After MAX_RELOADS crashes in a row it stops and says
// so, rather than retrying into the same wall in silence.

const MAX_RELOADS = 5;             // consecutive reloads before giving up
const RECOVERED_AFTER_MS = 60000;  // uptime that counts as recovered
const FIRST_WAIT_MS = 400;
const MAX_WAIT_MS = 15000;

/**
 * Pure decision. Returns the next state and either `{ reloadIn: ms }` or
 * `{ giveUp: true }`.
 * @param {{ crashes: number, lastAt: number }} state
 * @param {number} now
 */
function onRendererGone(state, now) {
  // A renderer that stayed up a while is a fresh fault, not a crash loop.
  const crashes = (now - state.lastAt > RECOVERED_AFTER_MS ? 0 : state.crashes) + 1;
  const next = { crashes, lastAt: now };
  if (crashes > MAX_RELOADS) return { state: next, giveUp: true };
  return { state: next, reloadIn: Math.min(FIRST_WAIT_MS * 2 ** (crashes - 1), MAX_WAIT_MS) };
}

module.exports = { onRendererGone, MAX_RELOADS };
