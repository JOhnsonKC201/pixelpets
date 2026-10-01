const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sanitizeRecord, makeLineReader, watchBridge } = require('../src/main/bridge');

test('a record without a message is dropped', () => {
  assert.strictEqual(sanitizeRecord(null), null);
  assert.strictEqual(sanitizeRecord('text'), null);
  assert.strictEqual(sanitizeRecord({ title: 'no message' }), null);
});

test('untrusted fields are clamped before they reach a toast', () => {
  const rec = sanitizeRecord({ message: 'x'.repeat(1000), title: 't'.repeat(200), level: 'shout', ttl: 10 ** 9, sound: 'yes' });
  assert.strictEqual(rec.message.length, 300);
  assert.strictEqual(rec.opts.title.length, 80);
  assert.strictEqual(rec.opts.level, 'info');
  assert.strictEqual(rec.opts.ttl, 30000);
  assert.strictEqual(rec.opts.sound, true);
  assert.strictEqual(rec.opts.source, 'bridge');
});

test('ttl has a floor and a default', () => {
  assert.strictEqual(sanitizeRecord({ message: 'a', ttl: 1 }).opts.ttl, 500);
  assert.strictEqual(sanitizeRecord({ message: 'a' }).opts.ttl, 5000);
  assert.strictEqual(sanitizeRecord({ message: 'a', ttl: 'soon' }).opts.ttl, 5000);
});

test('only explicit false silences a message', () => {
  assert.strictEqual(sanitizeRecord({ message: 'a', sound: false }).opts.sound, false);
  assert.strictEqual(sanitizeRecord({ message: 'a', sound: 0 }).opts.sound, true);
});

test('the reader waits for a whole line and skips junk', () => {
  const r = makeLineReader();
  assert.deepStrictEqual(r.feed('{"message":"hel'), []);
  const out = r.feed('lo"}\nnot json\n\n{"message":"two"}\n');
  assert.deepStrictEqual(out.map((x) => x.message), ['hello', 'two']);
});

test('the same record is delivered once', () => {
  const r = makeLineReader();
  const line = '{"id":"build-42","message":"green"}\n';
  assert.strictEqual(r.feed(line).length, 1);
  assert.strictEqual(r.feed(line).length, 0);
});

test('a writer that never sends a newline cannot grow memory', () => {
  const r = makeLineReader();
  r.feed('x'.repeat(70000));
  // the oversized partial line was thrown away, so the next line parses on its own
  assert.deepStrictEqual(r.feed('\n{"message":"after"}\n').map((x) => x.message), ['after']);
});

test('the watcher forwards new lines and agent changes, not the backlog', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-bridge-'));
  const agentFile = path.join(dir, 'agent.state');
  const notifyFile = path.join(dir, 'notify.jsonl');
  fs.writeFileSync(notifyFile, '{"message":"from before launch"}\n');
  fs.writeFileSync(agentFile, 'idle');

  const messages = [], agents = [];
  const bridge = watchBridge({
    isAlive: () => true, agentFile, notifyFile,
    onAgent: (s) => agents.push(s),
    onMessage: (m) => messages.push(m),
  });
  try {
    fs.appendFileSync(notifyFile, '{"message":"fresh"}\n');
    fs.writeFileSync(agentFile, 'thinking');
    const deadline = Date.now() + 3000;
    while ((messages.length < 1 || !agents.includes('thinking')) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 25));
    }
    assert.deepStrictEqual(messages, ['fresh']);
    assert.ok(agents.includes('thinking'), `agent states seen: ${agents.join(', ')}`);
  } finally {
    bridge.stop();
  }
});
