// The notify file is appended to by code we do not control, possibly many
// writers at once. These push the bridge the way a busy machine would: lots of
// writers, multi-byte text torn across appends, and one writer dumping far more
// than any sane message.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { makeLineReader, watchBridge, MAX_READ } = require('../src/main/bridge');

function tempBridge() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-bridge-load-'));
  const agentFile = path.join(dir, 'agent.state');
  const notifyFile = path.join(dir, 'notify.jsonl');
  fs.writeFileSync(agentFile, 'idle');
  fs.writeFileSync(notifyFile, '');
  return { dir, agentFile, notifyFile };
}

async function until(check, ms = 8000) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
}

test('a character torn across two reads still arrives whole', () => {
  const reader = makeLineReader();
  const bytes = Buffer.from('{"message":"paw \u{1F43E} done"}\n', 'utf8');
  const cut = bytes.indexOf(0xF0) + 2;   // inside the four-byte paw print
  assert.deepStrictEqual(reader.feed(bytes.subarray(0, cut)), []);
  const [rec] = reader.feed(bytes.subarray(cut));
  assert.equal(rec.message, 'paw \u{1F43E} done');
});

test('one huge append is read in bounded slices, not one giant buffer', async () => {
  const { agentFile, notifyFile } = tempBridge();
  const got = [];
  const bridge = watchBridge({
    isAlive: () => true, agentFile, notifyFile,
    onAgent: () => {}, onMessage: (m) => got.push(m),
  });
  assert.ok(Number.isInteger(MAX_READ) && MAX_READ > 0, 'the bridge exports its slice size');
  try {
    // Junk well past one slice, then a real message after it.
    const junk = 'x'.repeat(MAX_READ * 3) + '\n';
    fs.appendFileSync(notifyFile, junk + '{"message":"after the flood"}\n');
    await until(() => got.includes('after the flood'));
    assert.deepStrictEqual(got, ['after the flood']);
  } finally {
    bridge.stop();
  }
});

test('100 writers at once: every message arrives exactly once', async () => {
  const { agentFile, notifyFile } = tempBridge();
  const got = [];
  // The burst limit is off here: this measures the reader, not the policy.
  const bridge = watchBridge({
    isAlive: () => true, agentFile, notifyFile, burst: null,
    onAgent: () => {}, onMessage: (m) => got.push(m),
  });
  const WRITERS = 100, EACH = 5;
  // Separate processes, so the appends genuinely race at the OS level.
  const script = `
    const fs = require('fs');
    const [file, who, each] = process.argv.slice(1);
    for (let i = 0; i < Number(each); i += 1) {
      fs.appendFileSync(file, JSON.stringify({ id: who + '-' + i, message: 'user ' + who + ' msg ' + i }) + '\\n');
    }`;
  try {
    await Promise.all(Array.from({ length: WRITERS }, (_, w) => new Promise((done, fail) => {
      const p = spawn(process.execPath, ['-e', script, notifyFile, String(w), String(EACH)], { stdio: 'ignore' });
      p.on('exit', (code) => (code === 0 ? done() : fail(new Error(`writer ${w} exited ${code}`))));
      p.on('error', fail);
    })));
    await until(() => got.length >= WRITERS * EACH);
    assert.equal(got.length, WRITERS * EACH, 'nothing lost');
    assert.equal(new Set(got).size, WRITERS * EACH, 'nothing doubled');
  } finally {
    bridge.stop();
  }
});

test('a flood from tools becomes a few toasts and one summary, not a hundred', async () => {
  const { agentFile, notifyFile } = tempBridge();
  const got = [];
  const bridge = watchBridge({
    isAlive: () => true, agentFile, notifyFile, burst: { max: 5, windowMs: 60000 },
    onAgent: () => {}, onMessage: (m, opts) => got.push({ m, opts }),
  });
  try {
    const lines = Array.from({ length: 100 }, (_, i) => JSON.stringify({ id: `f${i}`, message: `build ${i} done` }));
    fs.appendFileSync(notifyFile, lines.join('\n') + '\n');
    await until(() => got.length >= 6);
    await new Promise((r) => setTimeout(r, 200));   // nothing else trickles in
    assert.equal(got.length, 6, got.map((g) => g.m).join(' | '));
    assert.deepStrictEqual(got.slice(0, 5).map((g) => g.m), ['build 0 done', 'build 1 done', 'build 2 done', 'build 3 done', 'build 4 done']);
    const summary = got[5];
    assert.match(summary.m, /more/i);
    assert.equal(summary.opts.sound, false, 'the summary is quiet');
  } finally {
    bridge.stop();
  }
});

test('the burst limiter refills once the window passes', () => {
  const { makeBurstLimiter } = require('../src/main/bridge');
  let t = 0;
  const lim = makeBurstLimiter({ max: 2, windowMs: 1000, now: () => t });
  assert.deepStrictEqual([lim.take(), lim.take(), lim.take()], ['ok', 'ok', 'first-drop']);
  assert.equal(lim.take(), 'drop');
  t = 1001;
  assert.equal(lim.take(), 'ok');
});
