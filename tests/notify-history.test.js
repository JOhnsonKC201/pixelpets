const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeNotifyHistory, relTime, NOTIFY_HISTORY_MAX } = require('../src/main/notify-history');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-history-'));
  return path.join(dir, 'notify-history.json');
}

test('records newest first, capped, and tells the tray', () => {
  let changes = 0;
  const h = makeNotifyHistory({ filePath: tempFile, onChange: () => { changes += 1; } });
  for (let i = 0; i < NOTIFY_HISTORY_MAX + 5; i++) h.record('test', `m${i}`);
  h.flush();
  const recent = h.recent(3).map((n) => n.message);
  assert.deepStrictEqual(recent, [`m${NOTIFY_HISTORY_MAX + 4}`, `m${NOTIFY_HISTORY_MAX + 3}`, `m${NOTIFY_HISTORY_MAX + 2}`]);
  assert.strictEqual(h.recent(1000).length, NOTIFY_HISTORY_MAX);
  assert.strictEqual(changes, NOTIFY_HISTORY_MAX + 5);
});

test('survives a restart through flush and load', () => {
  const file = tempFile();
  const a = makeNotifyHistory({ filePath: () => file });
  a.record('mail', '3 new emails');
  a.flush();
  assert.ok(!fs.existsSync(`${file}.tmp`), 'the temp file is renamed into place');

  const b = makeNotifyHistory({ filePath: () => file });
  b.load();
  assert.deepStrictEqual(b.recent(5).map((n) => [n.source, n.message]), [['mail', '3 new emails']]);
});

test('a corrupt or missing file loads as empty rather than throwing', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{not json');
  const h = makeNotifyHistory({ filePath: () => file });
  h.load();
  assert.deepStrictEqual(h.recent(5), []);
  const missing = makeNotifyHistory({ filePath: () => path.join(os.tmpdir(), 'nope', 'x.json') });
  missing.load();
  assert.deepStrictEqual(missing.recent(5), []);
});

test('flush with nothing pending writes nothing', () => {
  const file = tempFile();
  makeNotifyHistory({ filePath: () => file }).flush();
  assert.ok(!fs.existsSync(file));
});

test('clear empties the recap and persists that', () => {
  const file = tempFile();
  const h = makeNotifyHistory({ filePath: () => file });
  h.record('x', 'y');
  h.clear();
  h.flush();
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
});

test('relTime rounds into the largest sensible unit', () => {
  const now = 1_000_000_000;
  assert.strictEqual(relTime(now - 5_000, now), '5s ago');
  assert.strictEqual(relTime(now - 5 * 60_000, now), '5m ago');
  assert.strictEqual(relTime(now - 3 * 3_600_000, now), '3h ago');
  assert.strictEqual(relTime(now - 2 * 86_400_000, now), '2d ago');
  assert.strictEqual(relTime(now + 10_000, now), '0s ago');   // clock skew never goes negative
});
