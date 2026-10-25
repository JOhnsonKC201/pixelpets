// Rolling history of the pet's own notifications, so the user can recap what
// they missed (tray "Recent notifications"). Persisted so it survives a restart.
const fs = require('fs');
const { translator, FALLBACK } = require('../i18n');

const EN = translator(FALLBACK);
const NOTIFY_HISTORY_MAX = 50;
const SAVE_DEBOUNCE_MS = 1500;
// Entries from these carry other people's words (a sender and subject, a meeting
// title). They stay in the in-memory recap for this session but are never written:
// the logger keeps addresses off disk, and a history file must not undo that.
const MEMORY_ONLY = new Set(['email', 'calendar']);

/**
 * @param {object} deps
 * @param {() => string} deps.filePath  where the history lives (asked lazily: userData is only final after ready)
 * @param {() => void} [deps.onChange]  called after every record or clear, e.g. to rebuild the tray
 */
function makeNotifyHistory({ filePath, onChange = () => {} }) {
  let items = [];
  let saveTimer = null;

  function load() {
    try {
      const a = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
      // Filtered on the way in too, so a file written by an older version stops
      // carrying mail subjects the next time it is saved.
      if (Array.isArray(a)) items = a.filter((n) => n && !MEMORY_ONLY.has(n.source)).slice(-NOTIFY_HISTORY_MAX);
    } catch (e) { items = []; }
  }

  // Written the same tmp-then-rename way as settings.json (config.js) and
  // themes.json (themes.js), so a crash mid-write cannot leave a truncated file
  // behind. The loader already resets to [] on a parse failure, so the blast
  // radius is only a lost recap, but everything else here writes atomically too.
  function write() {
    const fp = filePath();
    try {
      const tmp = `${fp}.tmp`;
      const keep = items.slice(-NOTIFY_HISTORY_MAX).filter((n) => !MEMORY_ONLY.has(n.source));
      fs.writeFileSync(tmp, JSON.stringify(keep));
      fs.renameSync(tmp, fp);
    } catch (e) { /* best effort */ }
  }

  function saveSoon() {   // debounced: avoid a disk write per alert
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      write();
    }, SAVE_DEBOUNCE_MS);
  }

  function record(source, message) {
    items.push({ ts: Date.now(), source: source || '', message });
    if (items.length > NOTIFY_HISTORY_MAX) items = items.slice(-NOTIFY_HISTORY_MAX);
    saveSoon();
    onChange();
  }

  function clear() {
    items = [];
    saveSoon();
    onChange();
  }

  /** The newest `n` entries, newest first. */
  function recent(n) {
    return items.slice(-n).reverse();
  }

  /** On quit: write any pending change now, and cancel the debounce so it cannot fire mid-teardown. */
  function flush() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    write();
  }

  return { load, record, clear, recent, flush };
}

/** "12s ago", "5m ago", "3h ago", "2d ago", in the language of `t` (English without one). */
function relTime(ts, now = Date.now(), t = EN) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t('ago.s', { n: s });
  const m = Math.round(s / 60); if (m < 60) return t('ago.m', { n: m });
  const h = Math.round(m / 60); if (h < 24) return t('ago.h', { n: h });
  return t('ago.d', { n: Math.round(h / 24) });
}

module.exports = { makeNotifyHistory, relTime, NOTIFY_HISTORY_MAX };
