// Rolling history of the pet's own notifications, so the user can recap what
// they missed (tray "Recent notifications"). Persisted so it survives a restart.
const fs = require('fs');

const NOTIFY_HISTORY_MAX = 50;
const SAVE_DEBOUNCE_MS = 1500;

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
      if (Array.isArray(a)) items = a.slice(-NOTIFY_HISTORY_MAX);
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
      fs.writeFileSync(tmp, JSON.stringify(items.slice(-NOTIFY_HISTORY_MAX)));
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

/** "12s ago", "5m ago", "3h ago", "2d ago". */
function relTime(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

module.exports = { makeNotifyHistory, relTime, NOTIFY_HISTORY_MAX };
