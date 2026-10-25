// A browser terminal you can drive from an iPad.
//
// iPadOS sandboxes every app, so nothing running *on* the tablet can reach into other
// iPad apps. What the iPad can do is reach this machine over the network. So the shell
// lives here - on the computer pixelpets actually runs on - and Safari is only the
// screen and the keyboard. Point the iPad at the URL this prints and you get a real
// terminal, on the machine where a terminal is worth having.
//
//   node tools/ipad-terminal/server.js         # loopback only (this machine)
//   node tools/ipad-terminal/server.js --lan   # reachable from the iPad on your Wi-Fi
//
// Downstream is Server-Sent Events, upstream is POST, rather than one WebSocket: node
// ships no WebSocket *server*, and hand-rolling RFC 6455 framing is a lot of surface
// area for something whose whole job is shuttling a few hundred bytes per keypress
// across a LAN. This way the tool stays dependency-free and starts with plain `node`.
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PUBLIC = path.join(__dirname, 'public');
// Enough scrollback that backgrounding Safari and coming back re-paints a full screen
// of context instead of dropping you into a blank buffer mid-command.
const SCROLLBACK = 256 * 1024;
const MAX_SESSIONS = 4;
// A phone, a tablet and a couple of stale tabs; more watchers than this on one
// shell is a leak or a flood, and each one holds a socket open.
const MAX_CLIENTS = 8;
// Bytes a stream may have queued and unsent. A reader that stops reading (a frozen
// tab, a dead Wi-Fi link the OS has not noticed yet) is cut loose at this point
// instead of growing the queue without bound; it reconnects and replays the gap.
const MAX_PENDING = 1024 * 1024;
const MAX_FAILURE_IPS = 1000;
const MAX_BODY = 64 * 1024;
const HEARTBEAT_MS = 15000;

// Line mode feeds the shell commands on stdin, and how to ask for that depends on
// which shell it is, not on the OS: Git Bash on Windows exports SHELL=bash, and
// PowerShell's flags make bash print its usage and exit before the first prompt.
function lineArgs(shell) {
  // Split on both separators: path.basename on posix leaves a Windows path whole.
  const name = String(shell).split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
  if (name === 'powershell' || name === 'pwsh') return ['-NoLogo', '-NoProfile', '-Command', '-'];
  if (name === 'cmd') return ['/Q'];
  return [];
}

// Terminal sizes come from the client; a pty asked for a billion columns throws.
function clampSize(cols, rows) {
  return {
    cols: Math.max(20, Math.min(500, Math.round(Number(cols)) || 80)),
    rows: Math.max(5, Math.min(200, Math.round(Number(rows)) || 24)),
  };
}

// ---------------------------------------------------------------- options

function parseArgs(argv) {
  const opt = {
    host: '127.0.0.1', port: 7681, lan: false, token: '',
    shell: '', idle: 120, allowHost: [],
  };
  for (const arg of argv) {
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const val = eq === -1 ? '' : arg.slice(eq + 1);
    switch (key) {
      case '--lan': opt.lan = true; break;
      case '--host': opt.host = val; break;
      case '--port': opt.port = Number(val) || opt.port; break;
      case '--token': opt.token = val; break;
      case '--shell': opt.shell = val; break;
      // Seconds a disconnected session's shell survives. iPad Safari suspends
      // background tabs aggressively, so "you tabbed away" must not mean "your
      // build got killed" - reconnecting inside this window resumes the same shell.
      case '--idle': opt.idle = Number(val) || opt.idle; break;
      // Only needed when you reach the box by a DNS name (a tunnel, an mDNS alias).
      case '--allow-host': if (val) opt.allowHost.push(val.toLowerCase()); break;
      case '--help': case '-h': opt.help = true; break;
      default: if (arg.startsWith('-')) { opt.bad = arg; }
    }
  }
  if (opt.lan && opt.host === '127.0.0.1') opt.host = '0.0.0.0';
  return opt;
}

const opt = parseArgs(process.argv.slice(2));

const TOKEN = opt.token || crypto.randomBytes(16).toString('hex');
const IS_WIN = process.platform === 'win32';
const SHELL = opt.shell || process.env.SHELL || (IS_WIN ? 'powershell.exe' : '/bin/bash');

// node-pty is optional and native. With it you get a true terminal - vim, top, tab
// completion, job control. Without it we fall back to piping a shell, which can still
// run commands but has no tty, so the browser does the line editing instead.
let pty = null;
try { pty = require('node-pty'); } catch { /* line mode */ }
const MODE = pty ? 'pty' : 'line';

// ---------------------------------------------------------------- auth

const TOKEN_BUF = Buffer.from(TOKEN);
const failures = new Map(); // ip -> { count, until }

const COOKIE = 'ppterm';

function cookieToken(req) {
  const jar = String(req.headers.cookie || '');
  const hit = jar.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : '';
}

// `allowCookie` is deliberately not the default. The page and its stylesheet/script
// tags have no way to send a header - a <script src> is a plain browser fetch - so
// those requests authenticate by cookie. The API does not: a cookie is something a
// hostile page could try to ride, and SameSite=Strict already blocks that, but the
// shell endpoints should not depend on getting SameSite right in every browser.
function tokenOk(req, url, allowCookie) {
  const given = req.headers['x-term-token'] || url.searchParams.get('t')
    || (allowCookie ? cookieToken(req) : '') || '';
  const buf = Buffer.from(String(given));
  // timingSafeEqual throws on a length mismatch, which would itself leak length,
  // so compare a fixed-size digest of each instead of the raw bytes.
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(buf).digest(),
    crypto.createHash('sha256').update(TOKEN_BUF).digest());
}

function throttled(ip) {
  const rec = failures.get(ip);
  return !!(rec && rec.until > Date.now());
}

function noteFailure(ip) {
  const rec = failures.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  // A handful of fat-fingered URLs is normal; a hundred is someone walking the space.
  if (rec.count >= 10) { rec.until = Date.now() + 60000; rec.count = 0; }
  failures.set(ip, rec);
  // Every new source address adds an entry; keep the table from growing forever by
  // forgetting the ones that are not currently locked out.
  if (failures.size > MAX_FAILURE_IPS) {
    const now = Date.now();
    for (const [key, val] of failures) if (val.until <= now && key !== ip) failures.delete(key);
  }
}

// A browser on some other site can't read our responses, but it *can* make the
// request - and if it reaches us via a hostname that resolves to this box, the
// request carries no token and fails anyway. The Host check exists so a rebound
// DNS name can't be used to probe the port at all. IP literals are always fine.
function hostOk(req) {
  const raw = String(req.headers.host || '');
  const name = raw.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!name) return false;
  if (name === 'localhost' || name.endsWith('.local')) return true;
  if (opt.allowHost.includes(name)) return true;
  return /^[\d.]+$/.test(name) || name.includes(':');
}

// ---------------------------------------------------------------- sessions

const sessions = new Map();

function newSession(wantCols, wantRows) {
  if (sessions.size >= MAX_SESSIONS) return null;
  const { cols, rows } = clampSize(wantCols, wantRows);
  const id = crypto.randomBytes(9).toString('hex');
  const sess = {
    id, chunks: [], bytes: 0, base: 0, offset: 0,
    clients: new Set(), reaper: null, exited: null, proc: null,
  };

  if (pty) {
    sess.proc = pty.spawn(SHELL, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    sess.proc.onData((d) => pushOut(sess, Buffer.from(d, 'utf8')));
    sess.proc.onExit(({ exitCode }) => endSession(sess, exitCode));
  } else {
    sess.proc = spawn(SHELL, lineArgs(SHELL), {
      cwd: process.env.HOME || process.cwd(),
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    sess.proc.stdout.on('data', (d) => pushOut(sess, d));
    // stderr is folded into the same stream: a terminal shows one interleaved
    // transcript, and splitting them here would only reorder the output.
    sess.proc.stderr.on('data', (d) => pushOut(sess, d));
    // Input that lands after the shell has gone fails with EPIPE on stdin. With no
    // listener that error is thrown, and it takes the whole server down with it.
    sess.proc.stdin.on('error', () => { /* the exit handler reports the end */ });
    sess.proc.on('exit', (code) => endSession(sess, code == null ? -1 : code));
    sess.proc.on('error', (err) => {
      pushOut(sess, Buffer.from(`\r\ncould not start ${SHELL}: ${err.message}\r\n`));
      endSession(sess, -1);
    });
  }

  sessions.set(id, sess);
  // Arm the reaper before anyone attaches. A session that is created and then never
  // streamed to - a page that loaded and got closed, a probe, a client that died
  // during the handshake - would otherwise hold a live shell open forever, since
  // until now only a *disconnecting* client scheduled the cleanup.
  sess.reaper = setTimeout(() => killSession(sess), opt.idle * 1000);
  return sess;
}

function pushOut(sess, buf) {
  if (!buf || !buf.length) return;
  sess.chunks.push(buf);
  sess.bytes += buf.length;
  sess.offset += buf.length;
  while (sess.bytes > SCROLLBACK && sess.chunks.length > 1) {
    const dropped = sess.chunks.shift();
    sess.bytes -= dropped.length;
    sess.base += dropped.length;
  }
  const frame = `event: out\ndata: ${buf.toString('base64')}\n\n`;
  for (const res of sess.clients) {
    if (res.writableLength > MAX_PENDING) {
      sess.clients.delete(res);
      // destroy, not end: end() waits for a flush that a stalled reader never
      // allows, so the socket and its queued megabyte would stay.
      try { res.destroy(); } catch { /* already torn down */ }
      continue;
    }
    res.write(frame);
  }
}

function endSession(sess, code) {
  if (sess.exited !== null) return;
  sess.exited = code;
  const frame = `event: exit\ndata: ${JSON.stringify({ code })}\n\n`;
  for (const res of sess.clients) { res.write(frame); res.end(); }
  sess.clients.clear();
  if (sess.reaper) clearTimeout(sess.reaper);
  sessions.delete(sess.id);
}

function killSession(sess) {
  if (sess.exited !== null) return;
  try { sess.proc.kill(); } catch { /* already gone */ }
  endSession(sess, -1);
}

// Replay is what makes a dropped connection a non-event. The client tells us the
// byte offset it last rendered; we send whatever of the ring buffer sits past it.
function replay(sess, res, from) {
  let skip = Math.max(0, from - sess.base);
  const out = [];
  for (const chunk of sess.chunks) {
    if (skip >= chunk.length) { skip -= chunk.length; continue; }
    out.push(skip > 0 ? chunk.subarray(skip) : chunk);
    skip = 0;
  }
  if (out.length) res.write(`event: out\ndata: ${Buffer.concat(out).toString('base64')}\n\n`);
}

// One SSE viewer on a session: headers, the hello frame, the replay of what it
// missed, a heartbeat, and the cleanup when it goes.
function attachStream(sess, req, res, from, beatMs = HEARTBEAT_MS) {
  res.socket.setNoDelay(true);
  res.socket.setKeepAlive(true);
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  if (sess.reaper) { clearTimeout(sess.reaper); sess.reaper = null; }
  sess.clients.add(res);
  res.write(`event: hello\ndata: ${JSON.stringify({ mode: MODE, offset: sess.offset, base: sess.base })}\n\n`);
  replay(sess, res, from);
  // A response that was ended or torn down (a dropped slow reader, a session that
  // exited) must not be written to: write-after-end is an 'error' nobody listens
  // for, and that is an uncaught exception that ends the server.
  const beat = setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write(': beat\n\n'); }, beatMs);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    clearInterval(beat);
    sess.clients.delete(res);
    // Don't reap while another tab is still watching, and give a suspended
    // Safari a window to come back before the shell dies with it.
    if (!sess.clients.size && sess.exited === null && !sess.reaper) {
      sess.reaper = setTimeout(() => killSession(sess), opt.idle * 1000);
    }
  };
  req.on('close', done);
  req.on('error', done);
  res.on('close', done);
  res.on('error', done);
}

// ---------------------------------------------------------------- http

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function send(res, code, type, body, extra) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(body);
}

function readBody(req, cb) {
  const parts = [];
  let size = 0;
  req.on('data', (d) => {
    size += d.length;
    if (size > MAX_BODY) { req.destroy(); return; }
    parts.push(d);
  });
  req.on('end', () => cb(Buffer.concat(parts)));
  req.on('error', () => cb(Buffer.alloc(0)));
}

// xterm.js is served from node_modules when it's installed next to this tool, and
// from jsdelivr (integrity-pinned) otherwise, so the very first run needs no install
// and a later `npm install` here makes the whole thing work with no internet at all.
const VENDOR = {
  '/vendor/xterm.css': ['@xterm/xterm', 'css/xterm.css'],
  '/vendor/xterm.js': ['@xterm/xterm', 'lib/xterm.js'],
  '/vendor/addon-fit.js': ['@xterm/addon-fit', 'lib/addon-fit.js'],
};

function vendorPath(key) {
  const [pkg, rel] = VENDOR[key];
  try { return require.resolve(`${pkg}/${rel}`, { paths: [__dirname] }); } catch { return null; }
}

const server = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress || '?';
  // An absolute-form target with a broken authority ("GET http://[ HTTP/1.1") makes
  // URL throw, and a throw here is an uncaught exception that ends the server.
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return send(res, 400, 'text/plain', 'bad request\n'); }
  const route = url.pathname;

  if (!hostOk(req)) return send(res, 421, 'text/plain', 'bad Host header\n');
  if (throttled(ip)) return send(res, 429, 'text/plain', 'too many bad tokens; wait a minute\n');
  const isPage = route === '/' || route === '/index.html' || route.startsWith('/vendor/')
    || route === '/icon.png' || route === '/favicon.ico';
  if (!tokenOk(req, url, isPage)) {
    noteFailure(ip);
    return send(res, 401, 'text/plain', 'bad or missing token\n');
  }

  if (route === '/' || route === '/index.html') {
    let html;
    try { html = fs.readFileSync(path.join(PUBLIC, 'index.html')); } catch { return send(res, 500, 'text/plain', 'index.html missing\n'); }
    const local = Object.keys(VENDOR).every((k) => vendorPath(k));
    return send(res, 200, MIME['.html'], String(html).replace('__VENDOR__', local ? 'local' : 'cdn'), {
      // Hands the tab a credential its <script>/<link> tags can actually present, so
      // the token can leave the address bar without the page failing to load itself.
      'set-cookie': `${COOKIE}=${encodeURIComponent(TOKEN)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      // No frames, no referrer leaking the token to whatever we might link to.
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
  }

  // Add to Home Screen wants a real image, and Safari probes /favicon.ico on its own -
  // without this both come back 401 and the home-screen tile is a page screenshot.
  if (route === '/icon.png' || route === '/favicon.ico') {
    const icon = path.join(__dirname, '..', '..', 'assets', 'icon-512.png');
    if (!fs.existsSync(icon)) return send(res, 404, 'text/plain', 'no icon\n');
    return send(res, 200, 'image/png', fs.readFileSync(icon), { 'cache-control': 'max-age=86400' });
  }

  if (VENDOR[route]) {
    const file = vendorPath(route);
    if (!file) return send(res, 404, 'text/plain', 'not installed locally\n');
    return send(res, 200, MIME[path.extname(route)] || 'application/octet-stream', fs.readFileSync(file));
  }

  if (route === '/api/session' && req.method === 'POST') {
    return readBody(req, (body) => {
      let want = {};
      try { want = JSON.parse(body.toString() || '{}'); } catch { /* defaults */ }
      // JSON.parse('null') succeeds, and null.cols would throw out of this callback.
      if (!want || typeof want !== 'object') want = {};
      let sess;
      try { sess = newSession(want.cols, want.rows); } catch (err) {
        return send(res, 500, 'application/json', JSON.stringify({ error: `could not start ${SHELL}: ${err.message}` }));
      }
      if (!sess) return send(res, 429, 'application/json', JSON.stringify({ error: 'too many sessions' }));
      send(res, 200, 'application/json', JSON.stringify({ id: sess.id, mode: MODE, shell: SHELL, host: os.hostname() }));
    });
  }

  const sess = sessions.get(url.searchParams.get('id') || '');

  if (route === '/api/stream') {
    if (!sess) return send(res, 404, 'text/plain', 'no such session\n');
    if (sess.clients.size >= MAX_CLIENTS) return send(res, 429, 'text/plain', 'too many viewers on this session\n');
    attachStream(sess, req, res, Number(url.searchParams.get('from') || 0));
    return undefined;
  }

  if (route === '/api/input' && req.method === 'POST') {
    if (!sess) return send(res, 404, 'text/plain', 'no such session\n');
    return readBody(req, (body) => {
      try {
        if (pty) sess.proc.write(body.toString('utf8'));
        else sess.proc.stdin.write(body);
      } catch { /* raced with exit */ }
      send(res, 204, 'text/plain', '');
    });
  }

  if (route === '/api/resize' && req.method === 'POST') {
    if (!sess) return send(res, 404, 'text/plain', 'no such session\n');
    const { cols, rows } = clampSize(url.searchParams.get('cols'), url.searchParams.get('rows'));
    if (pty) { try { sess.proc.resize(cols, rows); } catch { /* raced with exit */ } }
    return send(res, 204, 'text/plain', '');
  }

  // Line mode has no tty, so Ctrl-C can't arrive as a 0x03 byte the shell will act on.
  if (route === '/api/signal' && req.method === 'POST') {
    if (!sess) return send(res, 404, 'text/plain', 'no such session\n');
    try { sess.proc.kill('SIGINT'); } catch { /* already gone */ }
    return send(res, 204, 'text/plain', '');
  }

  if (route === '/api/bye' && req.method === 'POST') {
    if (sess) killSession(sess);
    return send(res, 204, 'text/plain', '');
  }

  return send(res, 404, 'text/plain', 'not found\n');
});

// ---------------------------------------------------------------- boot

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const nic of list || []) {
      if (nic.family === 'IPv4' && !nic.internal) out.push(nic.address);
    }
  }
  return out;
}

// Requiring this file (the tests do) must not open a port or take over SIGINT;
// only running it directly should stand a terminal up.
if (require.main === module) {
  if (opt.help) {
    process.stdout.write([
      'pixelpets ipad-terminal - a browser terminal for this machine',
      '',
      '  --lan              bind 0.0.0.0 so the iPad can reach it over Wi-Fi',
      '  --host=ADDR        bind a specific address (default 127.0.0.1)',
      '  --port=N           default 7681',
      '  --token=STR        fixed token (default: a fresh random one each run)',
      '  --shell=PATH       shell to run (default $SHELL, or powershell.exe on Windows)',
      '  --idle=SECONDS     keep a disconnected shell alive this long (default 120)',
      '  --allow-host=NAME  permit this Host header (needed only behind a named tunnel)',
      '',
    ].join('\n'));
    process.exit(0);
  }
  if (opt.bad) {
    console.error(`unknown option ${opt.bad} (try --help)`);
    process.exit(2);
  }

  server.listen(opt.port, opt.host, () => {
    const where = opt.host === '0.0.0.0' ? lanAddresses() : [opt.host];
    const lines = [
      '',
      `  pixelpets terminal  -  ${MODE === 'pty' ? 'full tty' : 'line mode (install node-pty for a real tty)'}`,
      `  shell: ${SHELL}`,
    ];
    // Better to say this now than to let the iPad find out: the page cannot render at
    // all without xterm, and the fix is on this machine rather than on the tablet.
    if (!Object.keys(VENDOR).every((k) => vendorPath(k))) {
      lines.push('  xterm.js: from the CDN - `npm install` in tools/ipad-terminal to serve it locally');
    }
    lines.push('', '  open this on the iPad:');
    for (const addr of where.length ? where : ['127.0.0.1']) {
      lines.push(`    http://${addr}:${opt.port}/?t=${TOKEN}`);
    }
    if (opt.host === '0.0.0.0') {
      lines.push('', '  reachable by anything on this network that has the token.',
        '  it is a shell as you - stop it when you are done (ctrl-c).');
    } else {
      lines.push('', '  loopback only: pass --lan to let the iPad reach it.');
    }
    lines.push('');
    process.stdout.write(lines.join('\n') + '\n');
  });

  const shutdown = () => {
    for (const sess of [...sessions.values()]) killSession(sess);
    server.close(() => process.exit(0));
    // Nothing should take a second to close, and a wedged socket must not keep a
    // terminal server alive after you have asked it to stop.
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { parseArgs, hostOk, pushOut, replay, clampSize, lineArgs, attachStream, SCROLLBACK, MAX_CLIENTS, MAX_PENDING };
