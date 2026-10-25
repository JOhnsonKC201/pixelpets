// Focus Guard: work out whether the human is too busy to be interrupted, and hold
// back the things that would interrupt them until they are free again.
//
// The app already had `workMode` - park the pet, hide the butterfly - but it is a
// switch you have to remember to flip, and nobody flips a switch on the way into a
// meeting they are already late for. So the pet never actually knew you were busy,
// and cheerfully meowed a "3 new emails" toast into the middle of a screen-share.
//
// Two rules shape everything here:
//
//   * Held back is NOT thrown away. A notification that arrives while you are busy
//     is queued and delivered as one quiet summary when you are free. Dropping it
//     would make the feature something you switch off after the first missed thing.
//   * Some things must still get through. A calendar nudge is the pet telling you
//     about the meeting you are about to miss - silencing that during the meeting
//     you are currently in is exactly backwards. See DEFERRABLE.
//
// Pure logic on purpose: no Electron, no timers, no I/O. main.js owns the clock and
// the delivery, this file only ever answers questions about the data it is handed,
// which is what makes the whole policy testable without booting an overlay.

const { inQuietHours } = require('./quiet-hours');

// Sources whose messages wait for you. Everything NOT listed here goes straight
// through, which is the safe default: a source nobody has thought about yet is far
// better shown late than silently swallowed.
//
//   email    - the classic interruption, and the whole reason this exists
//   reminder - your own note to yourself; it keeps until you look up
//   bridge   - scripts/agents poking the pet from outside (agent-hook.js)
//   tips     - first-run hints; never urgent by definition
//
// Deliberately absent: `calendar` (time-critical - it is telling you to LEAVE),
// `system` (render-crash and friends: the app reporting it is unwell), and `test`
// (you pressed the button, you want the answer now).
const DEFERRABLE = new Set(['email', 'reminder', 'bridge', 'tips']);

// An event this long is not a meeting. All-day "Vacation", "Q3", "On call" and
// birthdays all show up in a normal feed as multi-hour or multi-day VEVENTs, and
// treating one as "in a meeting" would silence the pet for the whole day - the
// single most likely way this feature turns into a bug report. Eight hours is
// comfortably longer than any real meeting and comfortably shorter than a day.
const MAX_MEETING_MS = 8 * 3600 * 1000;

function isDeferrable(source) { return DEFERRABLE.has(String(source || '')); }

// Is `now` inside a real meeting from `events` ([{ start, end, summary }])?
// Returns the one that ends LAST, so back-to-back and overlapping meetings read as
// one continuous busy stretch instead of releasing the queue in the gap between two
// calls - which would deliver the digest to someone who is still on camera.
function meetingNow(events, now) {
  if (!Array.isArray(events)) return null;
  let best = null;
  for (const ev of events) {
    if (!ev || !Number.isFinite(ev.start) || !Number.isFinite(ev.end)) continue;
    if (ev.free) continue;                                 // shown as "free" on the calendar
    if (ev.end - ev.start > MAX_MEETING_MS) continue;      // an all-day block, not a meeting
    if (ev.end <= ev.start) continue;                      // zero/negative length: not a window
    if (now < ev.start || now >= ev.end) continue;         // [start, end)
    if (!best || ev.end > best.end) best = ev;
  }
  return best;
}

// The single question main.js asks: should the pet hush right now, and why?
//
// Returns { busy, reason, until }. `until` is when this particular reason lapses
// (a meeting's end), or null when nothing can predict it (a manual toggle) - main
// uses it to wake up and deliver the digest at the right moment rather than poll.
//
// Order matters only for which reason gets reported; any one of them is enough to
// hush. Manual first, because a human who flipped the switch deserves to see their
// own reason back rather than "meeting".
function busyState({ cfg, events, now, manualWork }) {
  const c = cfg || {};
  const f = c.focus || {};
  const at = Number.isFinite(now) ? now : Date.now();

  if (manualWork || c.workMode) return { busy: true, reason: 'work', until: null };
  if (inQuietHours(c.quietHours, new Date(at))) return { busy: true, reason: 'quiet', until: null };

  // Everything below is the automatic part, and it is the only part the Focus
  // Guard toggle governs. Quiet hours and work mode are explicit user choices and
  // keep working whether or not the automatic guard is on.
  if (f.on === false) return { busy: false, reason: null, until: null };
  if (f.meetings !== false) {
    const m = meetingNow(events, at);
    if (m) return { busy: true, reason: 'meeting', until: m.end, title: m.summary || '' };
  }
  return { busy: false, reason: null, until: null };
}

// A bounded FIFO of everything held back. Bounded because a mail server that
// flaps for an hour must not grow this without limit; when it overflows the
// OLDEST go, since the newest are the ones still worth reading.
function makeQueue(max) {
  const cap = Math.max(1, Math.min(200, (max | 0) || 50));
  let items = [];
  return {
    push(item) { items.push(item); if (items.length > cap) items = items.slice(-cap); return items.length; },
    get size() { return items.length; },
    peek() { return items.slice(); },
    drain() { const out = items; items = []; return out; },
  };
}

// Turn what was held back into ONE line. The point of the whole feature is that
// coming out of a meeting costs you a single glance, so this never lists items
// individually - the tray's "Recent notifications" already keeps the detail, and
// notify() records every held message there even while it is holding it back.
//
// Returns null for an empty queue, so main can simply skip delivery.
function digest(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const counts = new Map();
  for (const it of items) {
    const k = String((it && it.source) || 'other');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const LABEL = {
    email: ['new email', 'new emails'],
    reminder: ['reminder', 'reminders'],
    bridge: ['message', 'messages'],
    tips: ['tip', 'tips'],
    other: ['notification', 'notifications'],
  };
  // Biggest group first: "3 new emails and 1 reminder" reads better than the
  // reverse, and puts the thing you most likely care about at the front.
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([src, n]) => {
      const l = LABEL[src] || LABEL.other;
      return `${n} ${n === 1 ? l[0] : l[1]}`;
    });
  const list = parts.length === 1 ? parts[0]
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  return `While you were busy: ${list}.`;
}

module.exports = { busyState, meetingNow, isDeferrable, makeQueue, digest, DEFERRABLE, MAX_MEETING_MS };
