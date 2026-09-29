// Clipboard history is opt-in and memory-only, but even in memory it should not
// collect the things people copy out of password managers and dashboards. These
// cases are the secret shapes that actually show up on a developer's clipboard,
// plus the everyday text that must still be kept.
const test = require('node:test');
const assert = require('node:assert');

const { isSecretLike, pushEntry, preview, MAX_ENTRIES } = require('../src/tools/clipboard');

// Token-shaped fixtures are assembled at runtime from a prefix and filler, so no
// literal in this file looks like a live credential to a secret scanner (GitHub
// push protection rightly blocks one). The filter still sees the full shape.
const fake = (prefix, body) => prefix + body;
const FILL = 'AbCdEfGhIjKlMnOpQrStUvWx0123456789';

test('secret-looking text is refused', () => {
  const secrets = [
    fake('-----BEGIN OPENSSH ', 'PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----'),
    fake('eyJ', 'hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + FILL),
    fake('AKIA', 'IOSFODNN7EXAMPLE'),
    fake('ghp_', FILL.slice(0, 30)),
    fake('github_', 'pat_11' + FILL + '_' + FILL),
    fake('sk-', 'proj-' + FILL),
    fake('sk-', 'ant-api03-' + FILL.slice(0, 16)),
    fake('xox', 'b-1234-5678-' + FILL),
    fake('AIza', 'Sy' + FILL.slice(0, 33)),
    'abcd efgh ijkl mnop',           // Google app-password shape
    'Tr0ub4dor&3xK9!qZ',             // a single high-entropy token
    'x'.repeat(4001),
    'https://calendar.google.com/calendar/ical/me%40gmail.com/private-3f9a1c2b7d8e4f60a1b2c3d4e5f60718/basic.ics',
    'https://example.com/hook?token=abc123',
    'https://s3.amazonaws.com/b/f.pdf?X-Amz-Signature=deadbeef',
  ];
  for (const s of secrets) assert.strictEqual(isSecretLike(s), true, s.slice(0, 30));
});

test('everyday text is kept', () => {
  const ok = [
    'Meeting moved to 3pm',
    'https://github.com/JOhnsonKC201/pixelpets/pull/50',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'npm run test',
    'C:\\Users\\me\\Documents\\report.docx',
    'hello',
    'The quick brown fox jumps over the lazy dog.',
    '12345',
    'const x = foo(bar);',
  ];
  for (const s of ok) assert.strictEqual(isSecretLike(s), false, s);
});

test('pushEntry moves a repeat to the front and caps the list', () => {
  let list = Object.freeze([]);
  for (let i = 0; i < MAX_ENTRIES + 5; i++) list = Object.freeze(pushEntry(list, `item ${i}`));
  assert.strictEqual(list.length, MAX_ENTRIES);
  assert.strictEqual(list[0], `item ${MAX_ENTRIES + 4}`);
  const again = pushEntry(list, 'item 10');
  assert.strictEqual(again[0], 'item 10');
  assert.strictEqual(again.filter((s) => s === 'item 10').length, 1);
  assert.strictEqual(again.length, MAX_ENTRIES);
});

test('pushEntry ignores blanks and secrets, and trims long entries', () => {
  assert.deepStrictEqual(pushEntry([], '   '), []);
  assert.deepStrictEqual(pushEntry([], fake('AKIA', 'IOSFODNN7EXAMPLE')), []);
  assert.strictEqual(pushEntry([], 'word '.repeat(200))[0].length, 500);
});

test('preview is one short line', () => {
  assert.strictEqual(preview('a\n\nb\tc'), 'a b c');
  assert.strictEqual(preview('y'.repeat(200)).length, 80);
});
