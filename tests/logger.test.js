// The local log is what a person can attach to a bug report, so it has two jobs:
// keep enough to diagnose a crash, and never keep something the person would not
// want pasted into a public GitHub issue. Redaction is tested hardest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { redact, makeLogger } = require('../src/logger');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pixelpets-log-'));
const fake = (prefix, body) => prefix + body;

test('redact removes emails, URL paths and queries, secrets and home folders', () => {
  assert.strictEqual(redact('mail from alice@example.com failed'), 'mail from <email> failed');
  assert.strictEqual(redact('fetch https://calendar.google.com/calendar/ical/x/private-abc/basic.ics?x=1 failed'),
    'fetch https://calendar.google.com/<path> failed');
  assert.strictEqual(redact('GET http://localhost:3000/'), 'GET http://localhost:3000/');
  assert.strictEqual(redact(`token ${fake('ghp_', 'AbCdEfGhIjKlMnOpQrStUvWx0123')} leaked`), 'token <secret> leaked');
  assert.strictEqual(redact('C:\\Users\\johns\\AppData\\Roaming\\pixelpets\\x.json'), 'C:\\Users\\<user>\\AppData\\Roaming\\pixelpets\\x.json');
  assert.strictEqual(redact('/Users/jane/Library/Application Support/pixelpets'), '/Users/<user>/Library/Application Support/pixelpets');
  assert.strictEqual(redact('plain words stay'), 'plain words stay');
});

test('the user name is removed whatever shape the path arrives in', () => {
  const forms = [
    'C:\\Users\\johns\\x',                       // plain Windows
    JSON.stringify({ p: 'C:\\Users\\johns\\x' }),  // an object that was JSON-escaped on its way in
    'C:/Users/johns/x',                           // forward slashes
    '\\\\SERVER\\Users\\johns\\share',            // UNC roaming profile
    '/Users/johns/Library', '/home/johns/.config',
  ];
  for (const f of forms) assert.doesNotMatch(redact(f), /johns/, f);
});

test('a logged object is redacted after it is serialised', async () => {
  const dir = tmp();
  const log = makeLogger({ dir, echo: false });
  log.warn('settings write failed', { path: 'C:\\Users\\johns\\AppData\\Roaming\\pixelpets\\settings.json', who: 'bob@example.com' });
  await log.flush();
  const text = fs.readFileSync(path.join(dir, 'pixelpets.log'), 'utf8');
  assert.doesNotMatch(text, /johns|bob@example/);
});

test('redact caps very long messages', () => {
  assert.ok(redact('a '.repeat(5000)).length <= 2001);
});

test('lines are JSON with a level, and tail returns the newest lines', async () => {
  const dir = tmp();
  const log = makeLogger({ dir, echo: false });
  log.info('started', { version: '0.4.0' });
  log.warn('slow thing');
  log.error('boom', new Error('kaput at alice@example.com'));
  await log.flush();
  const lines = log.tail(10);
  assert.strictEqual(lines.length, 3);
  const last = JSON.parse(lines[2]);
  assert.strictEqual(last.l, 'error');
  assert.strictEqual(last.m, 'boom');
  assert.match(last.d, /kaput at <email>/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'pixelpets.log'), 'utf8'), /alice@example\.com/);
});

test('the log rotates at the size cap and keeps a bounded number of files', async () => {
  const dir = tmp();
  const log = makeLogger({ dir, maxBytes: 2000, keep: 2, echo: false });
  for (let i = 0; i < 200; i++) { log.info(`line ${i} ${'x'.repeat(40)}`); if (i % 20 === 0) await log.flush(); }
  await log.flush();
  const files = fs.readdirSync(dir).sort();
  assert.deepStrictEqual(files, ['pixelpets.1.log', 'pixelpets.2.log', 'pixelpets.log']);
  for (const f of files) assert.ok(fs.statSync(path.join(dir, f)).size <= 4000, f);
  assert.match(log.tail(1)[0], /line 199/);
});

test('a crash line logged during a rotation is the newest line in the report tail', () => {
  const dir = tmp();
  const log = makeLogger({ dir, maxBytes: 3000, keep: 2, echo: false });
  for (let i = 0; i < 30; i++) log.info(`line ${i} ${'x'.repeat(60)}`);
  log.flush();                 // the timer-style flush, NOT awaited
  log.error('URGENT crash line');
  log.flushSync();             // what quit and "Report a problem" do right after
  const tail = log.tail(5);
  assert.match(tail[tail.length - 1], /URGENT crash line/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'pixelpets.1.log'), 'utf8'), /URGENT/);
});

test('by default the log keeps three files: the current one and two rotated', async () => {
  const dir = tmp();
  const log = makeLogger({ dir, maxBytes: 1500, echo: false });
  for (let i = 0; i < 300; i++) { log.info(`line ${i} ${'z'.repeat(40)}`); if (i % 10 === 0) await log.flush(); }
  await log.flush();
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['pixelpets.1.log', 'pixelpets.2.log', 'pixelpets.log']);
});

test('a logger whose folder cannot be written never throws', async () => {
  const log = makeLogger({ dir: path.join(tmp(), 'nope', '\u0000bad'), echo: false });
  log.error('still fine');
  await log.flush();
  assert.deepStrictEqual(log.tail(5), []);
});

test('logger.js never talks to the network', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'logger.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"](https?|net|dgram|tls)['"]\)|fetch\(|XMLHttpRequest|WebSocket/);
});
