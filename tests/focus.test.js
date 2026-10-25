// Focus Guard decides when the pet is allowed to interrupt you. The failure modes
// that matter are the two opposite ones: hushing when it shouldn't (you miss the
// meeting you were being reminded about) and NOT hushing when it should (the whole
// point). These drive the pure policy in src/focus.js directly - no Electron, no
// clock of its own - because every decision it makes is a function of its inputs.
const test = require('node:test');
const assert = require('node:assert');

const focus = require('../src/focus');

const MIN = 60 * 1000;
const at = (h, m) => new Date(2026, 0, 5, h, m, 0, 0).getTime();   // a Monday
const ev = (startMs, lenMin, summary = 'Standup') => ({ start: startMs, end: startMs + lenMin * MIN, summary });

test('a meeting in progress makes you busy, and it ends when the meeting ends', () => {
  const events = [ev(at(10, 0), 30)];
  const cfg = {};
  const during = focus.busyState({ cfg, events, now: at(10, 15) });
  assert.strictEqual(during.busy, true);
  assert.strictEqual(during.reason, 'meeting');
  assert.strictEqual(during.until, at(10, 30));

  // [start, end): the moment the meeting ends you are free again.
  assert.strictEqual(focus.busyState({ cfg, events, now: at(10, 30) }).busy, false);
  assert.strictEqual(focus.busyState({ cfg, events, now: at(9, 59) }).busy, false);
});

test('back-to-back meetings never open a gap for the digest to escape through', () => {
  // The digest is delivered on the busy -> free edge, so what matters is that the
  // handover between two touching meetings never reads as "free" for even an instant.
  const events = [ev(at(10, 0), 30, 'One'), ev(at(10, 30), 30, 'Two')];
  const first = focus.busyState({ cfg: {}, events, now: at(10, 29) });
  assert.strictEqual(first.busy, true);
  assert.strictEqual(first.until, at(10, 30), 'the first meeting is the one running at 10:29');
  // At the seam the second has taken over, so we are still busy - no release.
  assert.strictEqual(focus.busyState({ cfg: {}, events, now: at(10, 30) }).busy, true);
  assert.strictEqual(focus.busyState({ cfg: {}, events, now: at(11, 0) }).busy, false);
});

test('when meetings overlap, busy lasts until the LAST one ends', () => {
  // Double-booked: a 30-min standup inside a 2-hour workshop. Releasing at the
  // standup's end would interrupt someone still in the workshop.
  const events = [ev(at(10, 0), 120, 'Workshop'), ev(at(10, 15), 30, 'Standup')];
  const st = focus.busyState({ cfg: {}, events, now: at(10, 20) });
  assert.strictEqual(st.busy, true);
  assert.strictEqual(st.until, at(12, 0));
});

test('an all-day block is not a meeting', () => {
  // The single most likely way this feature turns into a bug report: an all-day
  // "Vacation" or "On call" entry silencing the pet for the entire day.
  const allDay = [{ start: at(0, 0), end: at(0, 0) + 24 * 60 * MIN, summary: 'Vacation' }];
  assert.strictEqual(focus.busyState({ cfg: {}, events: allDay, now: at(13, 0) }).busy, false);

  // ...but a long-ish real meeting (under the 8h cap) still counts.
  const long = [ev(at(9, 0), 3 * 60, 'Workshop')];
  assert.strictEqual(focus.busyState({ cfg: {}, events: long, now: at(10, 0) }).busy, true);
});

test('malformed events never make you busy', () => {
  const bad = [
    { start: at(10, 0) },                                  // no end
    { start: at(10, 0), end: at(9, 0) },                   // ends before it starts
    { start: at(10, 0), end: at(10, 0) },                  // zero length
    { start: 'ten', end: 'eleven' },
    null,
  ];
  assert.strictEqual(focus.busyState({ cfg: {}, events: bad, now: at(10, 15) }).busy, false);
  assert.strictEqual(focus.busyState({ cfg: {}, events: null, now: at(10, 15) }).busy, false);
});

test('work mode and quiet hours hush regardless of the focus toggle', () => {
  // These are explicit user choices; turning the automatic guard off must not
  // quietly disable the switch the user flipped themselves.
  const off = { focus: { on: false } };
  assert.strictEqual(focus.busyState({ cfg: { ...off, workMode: true }, events: [], now: at(10, 0) }).reason, 'work');
  assert.strictEqual(
    focus.busyState({ cfg: { ...off, quietHours: { on: true, start: '22:00', end: '08:00' } }, events: [], now: at(23, 0) }).reason,
    'quiet',
  );
});

test('turning Focus Guard off stops meetings from hushing the pet', () => {
  const events = [ev(at(10, 0), 30)];
  assert.strictEqual(focus.busyState({ cfg: { focus: { on: false } }, events, now: at(10, 15) }).busy, false);
  assert.strictEqual(focus.busyState({ cfg: { focus: { on: true, meetings: false } }, events, now: at(10, 15) }).busy, false);
});

test('only the sources that can wait are held back', () => {
  // Calendar is the one that must ALWAYS get through: it is telling you to leave
  // for the next meeting, which is the opposite of an interruption.
  assert.strictEqual(focus.isDeferrable('email'), true);
  assert.strictEqual(focus.isDeferrable('reminder'), true);
  assert.strictEqual(focus.isDeferrable('bridge'), true);
  assert.strictEqual(focus.isDeferrable('calendar'), false);
  assert.strictEqual(focus.isDeferrable('system'), false);
  assert.strictEqual(focus.isDeferrable('test'), false);
  assert.strictEqual(focus.isDeferrable(''), false, 'an unknown source goes through rather than vanishing');
  assert.strictEqual(focus.isDeferrable(undefined), false);
});

test('the held queue is bounded and drops the OLDEST', () => {
  const q = focus.makeQueue(3);
  for (const n of [1, 2, 3, 4, 5]) q.push({ source: 'email', message: String(n) });
  assert.strictEqual(q.size, 3);
  assert.deepStrictEqual(q.peek().map((i) => i.message), ['3', '4', '5']);
  assert.strictEqual(q.drain().length, 3);
  assert.strictEqual(q.size, 0, 'draining empties it, so nothing is delivered twice');
});

test('the digest is one line, biggest group first', () => {
  assert.strictEqual(focus.digest([{ source: 'email' }]), 'While you were busy: 1 new email.');
  assert.strictEqual(
    focus.digest([{ source: 'reminder' }, { source: 'email' }, { source: 'email' }]),
    'While you were busy: 2 new emails and 1 reminder.',
  );
  assert.strictEqual(
    focus.digest([{ source: 'email' }, { source: 'email' }, { source: 'reminder' }, { source: 'bridge' }]),
    'While you were busy: 2 new emails, 1 message and 1 reminder.',
  );
  assert.strictEqual(focus.digest([]), null, 'nothing held back means nothing to deliver');
  assert.strictEqual(focus.digest(null), null);
});

test('an event marked free on the calendar is not a meeting', () => {
  const events = [{ ...ev(at(10, 0), 30, 'Lunch'), free: true }];
  assert.strictEqual(focus.busyState({ cfg: {}, events, now: at(10, 15) }).busy, false);
});
