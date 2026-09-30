// Forked calendar worker. Receives { url } once, fetches + parses the .ics feed
// (node-ical), and reports upcoming events within a ~26h window back to the parent,
// then exits. Runs in its own process so a slow/large feed can't stall the overlay.
// The .ics URL is a secret (it grants read access to the calendar) - never logged.
const http = require('http'), https = require('https'), dnsp = require('dns').promises, net = require('net');
const MAX_ICS_BYTES = 5 * 1024 * 1024;   // refuse feeds larger than 5 MB
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT = 20000;             // ms per hop

function classify(e) {
  const m = String((e && e.message) || e || '').toLowerCase();
  if (m.includes('blocked')) return 'That calendar address is not allowed.';
  if (m.includes('too large')) return 'The calendar feed is too large.';
  if (m.includes('enotfound') || m.includes('getaddrinfo') || m.includes('econnrefused')) return 'Could not reach the calendar URL.';
  if (m.includes('timeout') || m.includes('timed out')) return 'The calendar took too long to load.';
  if (m.includes('404') || m.includes('403') || m.includes('401') || m.includes('http ')) return 'The calendar URL was rejected (check the secret address).';
  return 'Could not read the calendar feed.';
}

// --- SSRF guard: only fetch public http(s) hosts. Blocks loopback, private,
// link-local (incl. cloud metadata 169.254.169.254), CGNAT, and reserved ranges,
// and re-checks the target on every redirect hop. ---------------------------
function isBlockedIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 127 || p[0] === 10) return true;
    if (p[0] === 169 && p[1] === 254) return true;                 // link-local + metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;     // private
    if (p[0] === 192 && p[1] === 168) return true;                 // private
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;    // CGNAT
    if (p[0] >= 224) return true;                                  // multicast/reserved
    return false;
  }
  if (v === 6) {
    const a = ip.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('::ffff:')) return isBlockedIp(a.slice(7));    // IPv4-mapped
    if (a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true;
    return false;
  }
  return true;   // not a resolvable IP -> block
}

async function assertSafeUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('blocked: scheme');
  const { address } = await dnsp.lookup(url.hostname);
  if (isBlockedIp(address)) throw new Error('blocked: host');
  return { url, address };
}

function fetchOnce(url, address) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;
    // Connect straight to the IP we already vetted in assertSafeUrl (no re-resolution), so a
    // rebinding host can't swap in a private/metadata IP between the DNS check and the connect
    // (TOCTOU). The Host header + TLS SNI still carry the real hostname, so vhosts and cert
    // validation keep working against the pinned address.
    const opts = {
      host: address,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      timeout: FETCH_TIMEOUT,
      headers: { 'user-agent': 'pixelpets-cal', accept: 'text/calendar,*/*', host: url.host },
    };
    if (isHttps) opts.servername = url.hostname;   // TLS SNI + cert validation against the real hostname
    const req = mod.get(opts, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); resolve({ redirect: new URL(res.headers.location, url).toString() }); return; }
      if (status !== 200) { res.resume(); reject(new Error('http ' + status)); return; }
      let len = 0; const chunks = [];
      res.on('data', (c) => { len += c.length; if (len > MAX_ICS_BYTES) req.destroy(new Error('too large')); else chunks.push(c); });
      res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchIcsSafely(start) {
  let current = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { url, address } = await assertSafeUrl(current);   // re-validate + re-pin every hop
    const r = await fetchOnce(url, address);
    if (r.body != null) return r.body;
    if (r.redirect) { current = r.redirect; continue; }
    throw new Error('no body');
  }
  throw new Error('blocked: too many redirects');
}

// Only run the fork protocol when launched as the forked entry point; when this file
// How long a parsed VEVENT lasts, in ms. Used to give every emitted occurrence an
// end time. Falls back to 30 minutes when DTEND (and any DURATION node-ical has
// resolved into it) is missing or nonsensical, and clamps to a day so one broken
// feed entry cannot claim to run for a decade.
const DEFAULT_EVENT_MS = 30 * 60 * 1000;
const MAX_EVENT_MS = 24 * 3600 * 1000;
function durationOf(ev) {
  const s = ev && ev.start ? new Date(ev.start).getTime() : NaN;
  const e = ev && ev.end ? new Date(ev.end).getTime() : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return DEFAULT_EVENT_MS;
  const d = e - s;
  if (!Number.isFinite(d) || d <= 0) return DEFAULT_EVENT_MS;
  return Math.min(d, MAX_EVENT_MS);
}

// is require()'d (e.g. from a unit test) just expose the pure functions below.
if (require.main === module || process.parentPort) {
const { onJob, reply, exitSoon } = require('./worker-port');
onJob(async (msg) => {
  const send = reply;
  try {
    const url = String((msg && msg.url) || '');
    if (!url) { send({ ok: false, error: 'No calendar URL.' }); exitSoon(); return; }
    const ical = require('node-ical');
    const text = await fetchIcsSafely(url);            // SSRF-guarded fetch (scheme + IP allowlist, size cap, redirects re-checked)
    const data = await ical.async.parseICS(text);
    const now = Date.now();
    const horizon = now + 26 * 3600 * 1000;
    const floor = now - 60 * 1000;   // allow a 1-min grace for just-passed leads
    const out = [];
    for (const k in data) {
      const ev = data[k];
      if (!ev || ev.type !== 'VEVENT') continue;
      const summary = String(ev.summary || 'Event').slice(0, 80);
      const uid = String(ev.uid || k);
      // How long the event runs, carried onto every occurrence. Focus Guard needs an
      // END to answer "am I in a meeting right now?" - a start alone only ever says
      // "one began at some point". A VEVENT may legitimately carry no DTEND, so fall
      // back to the 30 minutes that is the overwhelmingly common default meeting.
      const lenMs = durationOf(ev);
      if (ev.rrule) {
        let occ = [];
        try { occ = ev.rrule.between(new Date(floor), new Date(horizon), true) || []; } catch (e) { occ = []; }
        for (const d of occ) {
          const t = d.getTime();
          if (t >= floor && t <= horizon) out.push({ uid: uid + ':' + t, start: t, end: t + lenMs, summary });
        }
      } else if (ev.start) {
        const t = new Date(ev.start).getTime();
        if (Number.isFinite(t) && t >= floor && t <= horizon) out.push({ uid, start: t, end: t + lenMs, summary });
      }
    }
    out.sort((a, b) => a.start - b.start);
    send({ ok: true, events: out.slice(0, 100) });
  } catch (e) {
    send({ ok: false, error: classify(e) });
  } finally {
    exitSoon();
  }
});

// Safety: never hang if no message arrives.
setTimeout(() => process.exit(0), 30000);
}

module.exports = { isBlockedIp, assertSafeUrl, fetchIcsSafely, durationOf, DEFAULT_EVENT_MS, MAX_EVENT_MS };
