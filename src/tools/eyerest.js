// The 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20
// seconds. Off by default. It never interrupts while Focus Guard says you are
// busy, and it skips while you are away from the machine (idle), because nobody
// needs an eye break from a screen they are not looking at.

const EYE_REST_MS = 20 * 60 * 1000;

function eyeRestDue({ lastAt, now, busy, idle }) {
  if (busy || idle) return false;
  return now - lastAt >= EYE_REST_MS;
}

module.exports = { eyeRestDue, EYE_REST_MS };
