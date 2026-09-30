// Calendar nudges (main process). Periodically fetches a secret .ics feed in a
// forked worker (cal-worker.js), then arms a one-shot timer per upcoming event to
// nudge you leadMin before it starts (bubble + toast + meow via notify()). A
// bounded set of fired keys prevents re-firing the same occurrence across re-fetches.
const { runWorker } = require('./worker-host');
const path = require('path');

let pollTimer = null;
const fireTimers = new Map();   // event key -> pending setTimeout
const firedKeys = new Set();    // already-nudged occurrences
let notifyFn = null;
let getCfg = null;
// The most recent fetch, kept so Focus Guard can ask whether a meeting is running
// RIGHT NOW. The nudge timers above only ever look forward; knowing you are busy
// needs the events themselves, with their end times (see cal-worker durationOf).
let lastEvents = [];

function spawnWorker(url, timeoutMs, cb) {
  runWorker(path.join(__dirname, 'cal-worker.js'), { url },
    { timeoutMs: timeoutMs || 20000, name: 'calendar', timeoutError: 'Timed out loading the calendar.' }, cb);
}

// Event titles come from someone else's calendar, so unlike reminders (80 chars)
// and the pinned note (80) they arrive with no length bound at all - a meeting
// called "Weekly sync: platform, infra, and the Q3 migration follow-ups (bring
// notes)" is entirely normal. The bubble wraps now, but a Windows toast still gets
// the raw string, so cap it here at the source and mark that it was cut.
const CAL_TITLE_MAX = 72;
function eventTitle(summary) {
  const s = String(summary == null ? '' : summary).replace(/\s+/g, ' ').trim();
  if (!s) return 'Event';
  return s.length <= CAL_TITLE_MAX ? s : s.slice(0, CAL_TITLE_MAX - 1).trimEnd() + '…';
}

function arm(events, leadMin) {
  const now = Date.now();
  for (const ev of events) {
    const key = ev.uid;
    if (firedKeys.has(key) || fireTimers.has(key)) continue;
    const delay = (ev.start - leadMin * 60000) - now;
    if (delay < -60000) continue;          // lead already passed by > 1 min: skip
    const tm = setTimeout(() => {
      fireTimers.delete(key);
      firedKeys.add(key);
      if (firedKeys.size > 500) { for (const k of firedKeys) { firedKeys.delete(k); if (firedKeys.size <= 250) break; } }
      const mins = Math.max(0, Math.round((ev.start - Date.now()) / 60000));
      const when = mins <= 0 ? 'now' : ('in ' + mins + ' min');
      if (notifyFn) notifyFn(eventTitle(ev.summary) + ' ' + when, { source: 'calendar', dedupeKey: 'cal:' + key, title: 'Calendar' });
    }, Math.max(0, delay));
    fireTimers.set(key, tm);
  }
}

function leadOf(cfg) { return Math.max(0, Math.min(1440, (cfg.calendar.leadMin | 0))); }

function poll() {
  const cfg = getCfg && getCfg();
  if (!cfg || !cfg.calendar || !cfg.calendar.on || !cfg.calendar.icsUrl) return;
  spawnWorker(cfg.calendar.icsUrl, 25000, (res) => {
    if (res && res.ok && Array.isArray(res.events)) { lastEvents = res.events; arm(res.events, leadOf(cfg)); }
  });
}

function clearTimers() { for (const t of fireTimers.values()) clearTimeout(t); fireTimers.clear(); }

// Everything the last poll returned, for Focus Guard. A copy, so a caller cannot
// mutate the list the nudge timers are working from.
function events() { return lastEvents.slice(); }

// (Re)start or stop the poll loop when the calendar config changes.
function sync(cfg) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  clearTimers();
  lastEvents = [];   // a calendar just turned off must not leave you permanently "in a meeting"
  if (cfg && cfg.calendar && cfg.calendar.on && cfg.calendar.icsUrl) {
    const everyMin = 10;   // fixed refresh cadence; per-event one-shot timers (arm) do the precise firing
    poll();
    pollTimer = setInterval(poll, everyMin * 60000);
  }
}

// One-shot test (Settings "Test"): load the feed and report the next event.
function test(cfg) {
  return new Promise((resolve) => {
    const url = cfg && cfg.calendar ? cfg.calendar.icsUrl : '';
    if (!url) { resolve({ ok: false, error: 'Paste your calendar .ics URL first.' }); return; }
    spawnWorker(url, 20000, (res) => {
      if (res && res.ok) { const n = (res.events || [])[0]; resolve({ ok: true, next: n ? n.summary : null }); }
      else resolve({ ok: false, error: (res && res.error) || 'Could not load the calendar.' });
    });
  });
}

function init(notify_, getCfg_) { notifyFn = notify_; getCfg = getCfg_; }
function stop() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } clearTimers(); lastEvents = []; }

module.exports = { init, sync, test, stop, eventTitle, events };
