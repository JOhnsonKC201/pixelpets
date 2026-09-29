// Pinned shortcuts are the one launcher feature that opens things chosen by a
// config file, so the allowlist is the security boundary: web and mail links, or
// an absolute local path. Everything that can run code or reach across the
// network by itself (javascript:, file:, ms-* handlers, UNC shares) is refused.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { validateTarget, normalizeShortcuts, MAX_SHORTCUTS } = require('../src/tools/shortcuts');

test('web and mail links are accepted', () => {
  assert.deepStrictEqual(validateTarget('https://mail.google.com/'), { kind: 'url', value: 'https://mail.google.com/' });
  assert.deepStrictEqual(validateTarget('http://localhost:3000'), { kind: 'url', value: 'http://localhost:3000/' });
  assert.strictEqual(validateTarget('mailto:me@example.com').kind, 'url');
  assert.deepStrictEqual(validateTarget('github.com/JOhnsonKC201'), { kind: 'url', value: 'https://github.com/JOhnsonKC201' });
});

test('dangerous schemes are refused', () => {
  for (const t of ['javascript:alert(1)', 'file:///C:/Windows/System32/calc.exe', 'ms-settings:privacy',
    'vbscript:msgbox', 'data:text/html,<script>', 'smb://host/share', 'JAVASCRIPT:alert(1)']) {
    assert.strictEqual(validateTarget(t), null, t);
  }
});

test('absolute local paths are accepted, relative and UNC paths are not', () => {
  assert.deepStrictEqual(validateTarget('C:\\Users\\me\\Downloads', path.win32), { kind: 'path', value: 'C:\\Users\\me\\Downloads' });
  assert.deepStrictEqual(validateTarget('/Applications/Safari.app', path.posix), { kind: 'path', value: '/Applications/Safari.app' });
  for (const t of ['Downloads', '.\\thing.exe', '\\\\server\\share\\x.exe', '//server/share', 'C:\\a\u0000b']) {
    assert.strictEqual(validateTarget(t, path.win32), null, JSON.stringify(t));
  }
  assert.strictEqual(validateTarget('//server/share', path.posix), null);
});

test('internet-shortcut files are refused, app shortcuts are not', () => {
  for (const t of ['C:\\Users\\me\\Desktop\\site.url', 'C:\\x\\a.website', 'C:\\x\\cmd.scf']) {
    assert.strictEqual(validateTarget(t, path.win32), null, t);
  }
  assert.strictEqual(validateTarget('/Users/me/Desktop/site.webloc', path.posix), null);
  assert.strictEqual(validateTarget('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Code.lnk', path.win32).kind, 'path');
});

test('normalizeShortcuts drops bad rows, fills labels and caps the list', () => {
  const rows = [
    { id: 's1', label: 'Mail', target: 'https://mail.google.com/' },
    { label: '', target: 'C:\\Projects' },
    { label: 'bad', target: 'javascript:alert(1)' },
    'junk',
    null,
  ];
  const out = normalizeShortcuts(rows, path.win32);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].label, 'mail.google.com', 'labels come from the target, never the file');
  assert.strictEqual(out[1].label, 'Projects');
  assert.ok(/^s[a-z0-9]+$/.test(out[1].id));
  const many = Array.from({ length: 50 }, (_, i) => ({ label: `x${i}`, target: `https://example.com/${i}` }));
  assert.strictEqual(normalizeShortcuts(many).length, MAX_SHORTCUTS);
});

test('a stored label cannot disguise the target, and ids are de-duplicated', () => {
  const out = normalizeShortcuts([
    { id: 's1', label: 'Notepad', target: 'C:\\Users\\me\\evil.bat' },
    { id: 's1', label: 'b', target: 'https://b.com' },
  ], path.win32);
  assert.strictEqual(out[0].label, 'evil.bat');
  assert.notStrictEqual(out[0].id, out[1].id);
});
