// The terminal server is a shell on the network, so it has to survive whatever a
// client sends: a malformed body, absurd sizes, a crowd of tabs, a reader that
// stops reading, and a hundred people hammering it at once. The shell here is node
// itself, so these run the same on Windows and posix and never need a real shell.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const srv = require('../tools/ipad-terminal/server.js');
const SERVER = path.join(__dirname, '..', 'tools', 'ipad-terminal', 'server.js');
const TOKEN = 'abuse-suite-token';
const auth = { 'x-term-token': TOKEN };

// Ask the OS for a port nobody holds, so one test never talks to the previous
// test's server while that one is still shutting down.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = require('node:net').createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

// The "shell" is node itself: given no arguments it reads stdin as a script and
// stays alive until stdin closes, the same on every platform. `shell` overrides it.
async function withServer(fn, { shell = process.execPath } = {}) {
  const port = await freePort();
  const args = [SERVER, `--port=${port}`, `--token=${TOKEN}`, '--idle=5', `--shell=${shell}`];
  const proc = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  const exited = new Promise((r) => proc.on('exit', (code) => r(code)));
  const base = `http://127.0.0.1:${port}`;
  const alive = async () => (await fetch(`${base}/?t=${TOKEN}`)).status === 200;
  try {
    for (let i = 0; ; i += 1) {
      try { if (await alive()) break; } catch { /* not up yet */ }
      if (i > 60) throw new Error(`server never came up: ${stderr}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    await fn(base, { alive, stderr: () => stderr, exited });
  } finally {
    proc.kill();
    await exited;
  }
}

const post = (base, route, body) => fetch(`${base}${route}`, { method: 'POST', headers: auth, body });

test('line-mode flags follow the shell, not the operating system', () => {
  // Git Bash on Windows exports SHELL=/usr/bin/bash; PowerShell's flags kill it.
  assert.deepStrictEqual(srv.lineArgs('C:\\Program Files\\Git\\bin\\bash.exe'), []);
  assert.deepStrictEqual(srv.lineArgs('/bin/zsh'), []);
  assert.deepStrictEqual(srv.lineArgs('powershell.exe'), ['-NoLogo', '-NoProfile', '-Command', '-']);
  assert.deepStrictEqual(srv.lineArgs('C:\\Program Files\\PowerShell\\7\\pwsh.exe'), ['-NoLogo', '-NoProfile', '-Command', '-']);
  assert.deepStrictEqual(srv.lineArgs('C:\\Windows\\System32\\cmd.exe'), ['/Q']);
});

test('sizes from the client are clamped before they reach a pty', () => {
  assert.deepStrictEqual(srv.clampSize(1e9, -5), { cols: 500, rows: 5 });
  assert.deepStrictEqual(srv.clampSize('abc', undefined), { cols: 80, rows: 24 });
  assert.deepStrictEqual(srv.clampSize(120, 40), { cols: 120, rows: 40 });
});

test('a reader that stops reading is dropped, not buffered forever', () => {
  // destroy, not end: end() on a socket that is not draining never closes it, so
  // the queued megabyte stays and the next heartbeat writes after end, which
  // throws ERR_STREAM_WRITE_AFTER_END with nobody listening.
  let destroyed = 0;
  const stuck = { writableLength: srv.MAX_PENDING + 1, write() {}, destroy() { destroyed += 1; } };
  const fine = { writableLength: 0, frames: 0, write() { this.frames += 1; }, destroy() {} };
  const sess = { chunks: [], bytes: 0, base: 0, offset: 0, clients: new Set([stuck, fine]) };
  srv.pushOut(sess, Buffer.from('hello'));
  assert.equal(destroyed, 1, 'the stalled stream was torn down; it can reconnect and replay');
  assert.ok(!sess.clients.has(stuck));
  assert.equal(fine.frames, 1, 'a healthy reader still got the output');
});

test('a body of "null" is a bad request, not a dead server', async () => {
  await withServer(async (base, { alive }) => {
    const res = await post(base, '/api/session', 'null');
    assert.ok(res.status < 500, `got ${res.status}`);
    assert.ok(await alive(), 'the server is still answering');
  });
});

test('one session cannot be watched by an unbounded crowd of streams', async () => {
  await withServer(async (base) => {
    const { id } = await (await post(base, '/api/session', '{}')).json();
    const stop = new AbortController();
    const codes = await Promise.all(Array.from({ length: srv.MAX_CLIENTS + 3 }, () =>
      fetch(`${base}/api/stream?id=${id}`, { headers: auth, signal: stop.signal })
        .then((r) => r.status).catch(() => 0)));
    stop.abort();
    const open = codes.filter((c) => c === 200).length;
    assert.ok(open <= srv.MAX_CLIENTS, `${open} streams were let in`);
    assert.ok(codes.includes(429), `codes: ${codes.join(',')}`);
  });
});

test('a request target URL cannot parse is a 400, not a crash', async () => {
  await withServer(async (base, { alive }) => {
    const { port } = new URL(base);
    const reply = await new Promise((resolve, reject) => {
      const sock = require('node:net').connect(Number(port), '127.0.0.1', () => {
        sock.end('GET http://[ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
      });
      let got = '';
      sock.on('data', (d) => { got += d; });
      sock.on('end', () => resolve(got));
      sock.on('error', reject);
    });
    assert.ok(!/^HTTP\/1\.1 2/.test(reply), reply.split('\r\n')[0]);
    assert.ok(await alive(), 'the server survived the malformed target');
  });
});

test('100 users at once: bad tokens, sessions, input; the server stays up', async () => {
  await withServer(async (base, { alive }) => {
    const users = Array.from({ length: 100 }, (_, i) => async () => {
      switch (i % 4) {
        case 0: return (await fetch(`${base}/?t=guess-${i}`)).status;
        case 1: return (await post(base, '/api/session', JSON.stringify({ cols: i * 1e6, rows: -i }))).status;
        case 2: return (await post(base, '/api/input?id=nope', 'x'.repeat(1000))).status;
        default: return (await post(base, '/api/session', i % 8 ? 'null' : '{oops')).status;
      }
    });
    const codes = await Promise.all(users.map((u) => u().catch((e) => `error:${e.message}`)));
    assert.ok(!codes.some((c) => typeof c === 'string'), `requests failed: ${codes.filter((c) => typeof c === 'string')[0]}`);
    assert.ok(!codes.some((c) => c >= 500), `server errors: ${codes.join(',')}`);
    assert.ok(codes.filter((c) => c === 200).length <= 4, 'never more than MAX_SESSIONS shells');
    // 25 bad guesses from one address trip the lockout, so the answer now is a
    // deliberate 429 for this address, which proves the server is up and judging.
    const after = (await fetch(`${base}/?t=${TOKEN}`)).status;
    assert.equal(after, 429, 'the guessing address is locked out, and the server is answering');
  });
});

test('typing into a shell that just died does not take the server down', async () => {
  await withServer(async (base, { alive }) => {
    // A shell that does not exist fails to start, so input races its death.
    for (let round = 0; round < 5; round += 1) {
      const res = await post(base, '/api/session', '{}');
      if (res.status !== 200) continue;
      const { id } = await res.json();
      await Promise.all(Array.from({ length: 20 }, () => post(base, `/api/input?id=${id}`, 'echo hi\n').catch(() => null)));
    }
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(await alive());
  }, { shell: path.join(__dirname, 'no-such-shell-here') });
});

test('a stalled viewer on a real socket is cut loose without killing the server', async () => {
  // In process, with a real http response: a client that opens the stream and then
  // never reads. Output piles up until the viewer is dropped, and the heartbeat
  // keeps firing at it afterwards. Any write after end would surface here.
  const crashes = [];
  const onCrash = (e) => crashes.push(e);
  process.on('uncaughtException', onCrash);
  // exited is set so the server's reaper (a 120 s timer) is never armed here.
  const sess = { chunks: [], bytes: 0, base: 0, offset: 0, clients: new Set(), reaper: null, exited: 0 };
  const server = require('node:http').createServer((req, res) => srv.attachStream(sess, req, res, 0, 20));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const sock = require('node:net').connect(server.address().port, '127.0.0.1');
  try {
    await new Promise((r) => sock.once('connect', r));
    sock.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    sock.pause();   // never read: the server's queue for us only grows
    for (let i = 0; i < 50 && !sess.clients.size; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(sess.clients.size, 1, 'the viewer attached');
    const chunk = Buffer.alloc(256 * 1024, 'x');
    for (let i = 0; i < 400 && sess.clients.size; i += 1) {
      srv.pushOut(sess, chunk);
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(sess.clients.size, 0, 'the stalled viewer was dropped');
    await new Promise((r) => setTimeout(r, 200));   // ten heartbeats past the drop
    assert.deepStrictEqual(crashes.map((e) => e.code || e.message), []);
  } finally {
    process.off('uncaughtException', onCrash);
    sock.destroy();
    await new Promise((r) => server.close(r));
  }
});
