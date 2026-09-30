// "Report a problem" builds a prefilled GitHub bug form. The user reads every
// word before anything leaves the machine, and nothing is sent by the app, so the
// tests pin what goes in (diagnostics, redacted log tail) and the URL size limit.
const test = require('node:test');
const assert = require('node:assert');

const { buildIssue, enabledFeatures, formatLogLine, MAX_URL } = require('../src/report');

const info = {
  version: '0.5.0', platform: 'win32', osRelease: '10.0.26200', arch: 'x64', electron: '44.1.0',
  features: ['quick tools', 'work mode'],
};

test('the issue opens the bug form with version and diagnostics prefilled', () => {
  const { url, title, body } = buildIssue({ ...info, logLines: ['{"l":"error","m":"boom"}'] });
  const u = new URL(url);
  assert.strictEqual(u.origin + u.pathname, 'https://github.com/JOhnsonKC201/pixelpets/issues/new');
  assert.strictEqual(u.searchParams.get('template'), 'bug_report.yml');
  assert.strictEqual(u.searchParams.get('version'), '0.5.0');
  assert.match(u.searchParams.get('context'), /Windows 10\.0\.26200 \(x64\)/);
  assert.match(u.searchParams.get('context'), /error boom/);
  assert.strictEqual(u.searchParams.get('title'), title);
  assert.match(body, /Electron 44\.1\.0/);
  assert.match(body, /quick tools, work mode/);
});

test('the URL stays under the size GitHub accepts, dropping the oldest log lines first', () => {
  const logLines = Array.from({ length: 400 }, (_, i) => `{"m":"line ${i} ${'y'.repeat(60)}"}`);
  const { url, body } = buildIssue({ ...info, logLines });
  assert.ok(url.length <= MAX_URL, `${url.length}`);
  assert.match(body, /line 399/);
  assert.doesNotMatch(body, /line 0 /);
  assert.match(body, /older lines left out/);
});

test('enabledFeatures lists switches only, never values', () => {
  const cfg = {
    workMode: true, soundOn: false, name: 'Alice', pomodoro: { on: true, focusMin: 25 },
    email: { on: true, user: 'alice@example.com', host: 'imap.x' }, calendar: { on: false, icsUrl: 'https://secret' },
    tools: { clipboard: true, eyeRest: false, shortcuts: [{ target: 'C:\\secret' }] },
  };
  const f = enabledFeatures(cfg);
  assert.deepStrictEqual(f, ['work mode', 'pomodoro', 'mail alerts', 'clipboard history']);
  assert.doesNotMatch(JSON.stringify(f), /alice|secret|imap/i);
});

test('log lines are shown as readable text', () => {
  assert.strictEqual(formatLogLine('{"t":"2026-09-29T03:17:24.060Z","l":"info","m":"started","d":"{\\"v\\":1}"}'),
    '03:17:24 info  started {"v":1}');
  assert.strictEqual(formatLogLine('not json'), 'not json');
});
