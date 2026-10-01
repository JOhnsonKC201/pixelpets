// worker-host.js outside Electron falls back to child_process.fork, which is
// the path these tests drive. The utilityProcess path is the same protocol
// through process.parentPort (worker-port.js) and is exercised by a real launch.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runWorker } = require('../src/worker-host');

const WORKER = path.join(__dirname, 'fixtures', 'echo-worker.js');
const run = (job, timeoutMs = 5000) => new Promise((resolve) => {
  runWorker(WORKER, job, { timeoutMs, name: 'test', timeoutError: 'Timed out.' }, resolve);
});

test('the answer comes back', async () => {
  assert.deepStrictEqual(await run({ mode: 'echo', value: 42 }), { ok: true, echo: 42 });
});

test('a worker that never answers is stopped by the watchdog', async () => {
  const started = Date.now();
  assert.deepStrictEqual(await run({ mode: 'hang' }, 300), { ok: false, error: 'Timed out.' });
  assert.ok(Date.now() - started < 3000);
});

test('a worker that exits without answering is reported, not waited on', async () => {
  assert.deepStrictEqual(await run({ mode: 'silent-exit' }), { ok: false, error: 'Test worker exited.' });
});

test('a worker that cannot start is reported', async () => {
  const res = await new Promise((resolve) => {
    runWorker(path.join(__dirname, 'fixtures', 'no-such-worker.js'), {}, { timeoutMs: 5000, name: 'test', timeoutError: 'Timed out.' }, resolve);
  });
  assert.strictEqual(res.ok, false);
});
