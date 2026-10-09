// The unread-mail watcher silently does nothing when it has no usable password, so
// the credential path is where a broken setup hides. These drive src/mail.js's pure
// helpers directly - no Electron, no IMAP socket - because that is where the two
// real defects lived: an app-password mangled on the way in, and a "saved" tick that
// only ever checked whether a file existed.
const test = require('node:test');
const assert = require('node:assert');

const mail = require('../src/mail');

test('a Gmail app-password keeps its four groups but loses the spaces', () => {
  assert.strictEqual(mail.normalizePassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.strictEqual(mail.normalizePassword('  abcd efgh ijkl mnop  '), 'abcdefghijklmnop');
  assert.strictEqual(mail.normalizePassword('ABCD efgh IJKL mnop'), 'ABCDefghIJKLmnop');
});

test('a password already pasted without spaces is left alone', () => {
  assert.strictEqual(mail.normalizePassword('abcdefghijklmnop'), 'abcdefghijklmnop');
});

test('a passphrase that merely contains spaces is not silently rewritten', () => {
  // Only the exact 4x4 Gmail shape gets de-spaced; a custom IMAP server may well
  // want the spaces, and quietly deleting them would break a working login.
  assert.strictEqual(mail.normalizePassword('correct horse battery staple'), 'correct horse battery staple');
  assert.strictEqual(mail.normalizePassword('abcd efgh ijkl'), 'abcd efgh ijkl');
  assert.strictEqual(mail.normalizePassword('abc defg hijk lmno'), 'abc defg hijk lmno');
});

test('empty-ish input normalizes to the empty string that clears the credential', () => {
  assert.strictEqual(mail.normalizePassword(''), '');
  assert.strictEqual(mail.normalizePassword('   '), '');
  assert.strictEqual(mail.normalizePassword(null), '');
  assert.strictEqual(mail.normalizePassword(undefined), '');
});

// ---- VIP senders and what the pet actually says ------------------------------
// Focus Guard holds mail back while you are busy, so the VIP list is the escape
// hatch: the people you want to hear from mid-meeting. Substring matching is the
// whole design - no pattern syntax to get wrong - so the edges worth pinning are
// the ones where a naive `includes` would say yes when it should not.

test('a VIP entry matches a whole company or one person', () => {
  assert.strictEqual(mail.isVip('bob@acme.com', ['@acme.com']), true);
  assert.strictEqual(mail.isVip('boss@acme.com', ['boss@acme.com']), true);
  assert.strictEqual(mail.isVip('bob@other.com', ['@acme.com']), false);
});

test('VIP matching ignores case and surrounding space', () => {
  assert.strictEqual(mail.isVip('  BOSS@Acme.COM ', ['boss@acme.com']), true);
  assert.strictEqual(mail.isVip('boss@acme.com', ['  BOSS@ACME.COM  ']), true);
});

test('an empty or junk VIP list never matches', () => {
  // Costs nothing until it is used, and a blank entry must not whitelist everyone.
  assert.strictEqual(mail.isVip('anyone@anywhere.com', []), false);
  assert.strictEqual(mail.isVip('anyone@anywhere.com', ['', '   ']), false);
  assert.strictEqual(mail.isVip('anyone@anywhere.com', null), false);
  assert.strictEqual(mail.isVip('', ['@acme.com']), false);
  assert.strictEqual(mail.isVip(null, ['@acme.com']), false);
});

test('one new mail names the sender and the subject', () => {
  assert.strictEqual(
    mail.describe(1, { name: 'Alice', address: 'alice@x.com', subject: 'Budget review' }),
    'Alice: Budget review',
  );
  // No subject to show: still say who it is from rather than falling back to a count.
  assert.strictEqual(mail.describe(1, { name: 'Alice', address: 'alice@x.com', subject: '' }), 'New mail from Alice');
  // No display name: the address is the next best thing.
  assert.strictEqual(mail.describe(1, { name: '', address: 'alice@x.com', subject: '' }), 'New mail from alice@x.com');
});

test('several new mails name the most recent sender', () => {
  assert.strictEqual(
    mail.describe(3, { name: 'Alice', address: 'alice@x.com', subject: 'anything' }),
    '{count} new emails, latest from Alice',
  );
});

test('no envelope falls back to the plain count', () => {
  // The server may refuse the fetch, or the mailbox may not give us one. The count
  // is the contract; the detail is a bonus, and losing it must not lose the alert.
  assert.strictEqual(mail.describe(1, null), 'You have {count} new email.');
  assert.strictEqual(mail.describe(2, null), 'You have {count} new emails.');
  assert.strictEqual(mail.describe(2, { name: '', address: '', subject: '' }), 'You have {count} new emails.');
});

test('a Gmail account with a password that is not sixteen letters is called out', () => {
  const a = mail.passwordAdvice;
  assert.strictEqual(a(16, 'me@gmail.com', 'imap.gmail.com'), null, 'a real app password');
  assert.strictEqual(a(19, 'me@gmail.com', 'imap.gmail.com'), 'gmail-length', 'most likely the account password');
  assert.strictEqual(a(12, 'me@googlemail.com', ''), 'gmail-length', 'the host is inferred from the address');
  assert.strictEqual(a(19, 'me@gmail.com', 'www.gmail.com'), 'gmail-length', 'a web address still means Gmail');
  // Other providers issue other lengths, and a self-hosted server can use anything.
  assert.strictEqual(a(19, 'me@outlook.com', ''), null);
  assert.strictEqual(a(40, 'me@example.org', 'mail.example.org'), null);
  assert.strictEqual(a(0, 'me@gmail.com', 'imap.gmail.com'), null, 'nothing saved is not a wrong password');
  assert.strictEqual(mail.GMAIL_APP_PASSWORD_LEN, 16);
});

test('Settings turns that advice into a sentence, and asks about the account it is showing', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const ui = src('settings-renderer.js');
  assert.match(ui, /info\.advice === 'gmail-length'/);
  assert.match(ui, /myaccount\.google\.com\/apppasswords/);
  // The advice depends on the address and server, so main must be handed the config.
  assert.match(src(path.join('main', 'settings-ipc.js')), /passwordInfo\(getCfg\(\)\)/);
  // The sentence replaces 'Password saved' so it is not buried under it.
  assert.match(ui, /problem \|\| `Password saved/);
});
