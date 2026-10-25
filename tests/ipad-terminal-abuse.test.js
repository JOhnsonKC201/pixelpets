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

// `realShell` keeps the platform's own shell, for a test that needs a session to
// stay alive; otherwise the "shell" is node, which exits as soon as it starts.
// Ask the OS for a port nobody holds, so one test never talks to the previous
// test's server while that one is still shutting down.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = require('node:net').createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

async function withServer(fn, { realShell = false } = {}) {
  const port = await freePort();
  const args = [SERVER, `--port=${port}`, `--token=${TOKEN}`, '--idle=5'];
  if (!realShell) args.push(`--shell=${process.execPath}`);
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
  let ended = 0;
  const stuck = { writableLength: srv.MAX_PENDING + 1, write() {}, end() { ended += 1; } };
  const fine = { writableLength: 0, frames: 0, write() { this.frames += 1; }, end() {} };
  const sess = { chunks: [], bytes: 0, base: 0, offset: 0, clients: new Set([stuck, fine]) };
  srv.pushOut(sess, Buffer.from('hello'));
  assert.equal(ended, 1, 'the stalled stream was closed; it can reconnect and replay');
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
