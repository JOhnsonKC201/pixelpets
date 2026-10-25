// Anyone who can get an invite onto the feed (Google adds them on its own) writes
// these events. The ones that do not take up your time must not make Focus Guard
// hold your reminders, and their titles must not be able to spoof a toast.
const test = require('node:test');
const assert = require('node:assert');
const ical = require('node-ical');
const { eventsFrom } = require('../src/cal-worker.js');

const NOW = Date.parse('2026-03-02T09:00:00Z');

function feed(...events) {
  const body = events.map((e, i) => [
    'BEGIN:VEVENT', `UID:e${i}@test`, 'DTSTAMP:20260301T000000Z',
    'DTSTART:20260302T100000Z', 'DTEND:20260302T110000Z', ...e, 'END:VEVENT',
  ].join('\r\n')).join('\r\n');
  return ical.sync.parseICS(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//t//EN\r\n${body}\r\nEND:VCALENDAR\r\n`);
}

test('a normal event comes through', () => {
  const out = eventsFrom(feed(['SUMMARY:Standup']), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].summary, 'Standup');
});

test('a cancelled event is not a meeting', () => {
  assert.deepStrictEqual(eventsFrom(feed(['SUMMARY:Gone', 'STATUS:CANCELLED']), NOW), []);
});

test('an event marked free still gets its reminder, flagged so Focus Guard skips it', () => {
  const out = eventsFrom(feed(['SUMMARY:Lunch', 'TRANSP:TRANSPARENT']), NOW);
  assert.equal(out.length, 1, 'the "in 10 min" nudge still has something to fire on');
  assert.equal(out[0].free, true);
  assert.equal(eventsFrom(feed(['SUMMARY:Standup']), NOW)[0].free, false);
});

test('an occurrence removed from a recurring meeting does not come back', () => {
  // Daily at 10:00 from 2 March; the 3 March one is excluded.
  const out = eventsFrom(feed(['SUMMARY:Daily', 'RRULE:FREQ=DAILY;COUNT=5', 'EXDATE:20260303T100000Z']), NOW);
  assert.deepStrictEqual(out.map((e) => new Date(e.start).toISOString()), ['2026-03-02T10:00:00.000Z']);
});

test('one cancelled occurrence of a recurring meeting is dropped, the rest stay', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//t//EN',
    'BEGIN:VEVENT', 'UID:daily@test', 'DTSTAMP:20260301T000000Z', 'SUMMARY:Daily',
    'DTSTART:20260302T100000Z', 'DTEND:20260302T103000Z', 'RRULE:FREQ=DAILY;COUNT=5', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:daily@test', 'DTSTAMP:20260301T000000Z', 'SUMMARY:Daily',
    'RECURRENCE-ID:20260302T100000Z', 'DTSTART:20260302T100000Z', 'DTEND:20260302T103000Z',
    'STATUS:CANCELLED', 'END:VEVENT',
    'END:VCALENDAR', '',
  ].join('\r\n');
  const out = eventsFrom(ical.sync.parseICS(ics), NOW);
  assert.deepStrictEqual(out.map((e) => new Date(e.start).toISOString()), ['2026-03-03T10:00:00.000Z']);
});

test('a title loses bidi overrides and control characters', () => {
  const rlo = String.fromCodePoint(0x202E);
  const [ev] = eventsFrom(feed([`SUMMARY:Pay ${rlo}lanigiro`]), NOW);
  assert.equal(ev.summary, 'Pay lanigiro');
});
