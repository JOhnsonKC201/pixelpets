// What a hostile network or a hostile sender can do to the mail check. The From
// header and the subject are written by whoever sent the mail, and on port 143 the
// network sits between us and the server before TLS is up.
const test = require('node:test');
const assert = require('node:assert');
const mail = require('../src/mail');
const { imapOptions, cleanText } = require('../src/mail-worker');

test('port 143 demands STARTTLS instead of falling back to plaintext', () => {
  // Opportunistic STARTTLS means a man in the middle who strips the capability
  // gets LOGIN with the app password in clear.
  const o = imapOptions({ host: 'imap.example.com', port: 143, secure: false, user: 'u', pass: 'p' });
  assert.equal(o.secure, false);
  assert.equal(o.doSTARTTLS, true);
});

test('implicit TLS on 993 is left alone (imapflow rejects both at once)', () => {
  const o = imapOptions({ host: 'imap.example.com', port: 993, user: 'u', pass: 'p' });
  assert.equal(o.secure, true);
  assert.equal(o.doSTARTTLS, undefined);
});

test('a company VIP entry matches that domain, not a lookalike', () => {
  assert.strictEqual(mail.isVip('bob@acme.com', ['@acme.com']), true);
  assert.strictEqual(mail.isVip('bob@eu.acme.com', ['@acme.com']), true, 'subdomains are the same company');
  assert.strictEqual(mail.isVip('x@acme.com.evil.net', ['@acme.com']), false);
  assert.strictEqual(mail.isVip('x@notacme.com', ['@acme.com']), false);
});

test('a person VIP entry matches that address only', () => {
  assert.strictEqual(mail.isVip('boss@acme.com', ['boss@acme.com']), true);
  assert.strictEqual(mail.isVip('notboss@acme.com', ['boss@acme.com']), false);
  assert.strictEqual(mail.isVip('boss@acme.com.evil.net', ['boss@acme.com']), false);
});

test('a bare domain entry works like an @domain entry', () => {
  assert.strictEqual(mail.isVip('bob@acme.com', ['acme.com']), true);
  assert.strictEqual(mail.isVip('bob@acme.com.evil.net', ['acme.com']), false);
});

test('sender and subject lose the characters that let a mail spoof itself', () => {
  // U+202E flips the rest of the line, so "moc.knab@" can render as "bank.com".
  const rlo = String.fromCodePoint(0x202E), zwsp = String.fromCodePoint(0x200B), bell = String.fromCodePoint(7);
  assert.equal(cleanText(`Invoice ${rlo}fdp.exe`, 120), 'Invoice fdp.exe');
  assert.equal(cleanText(`Pay${zwsp}Pal${bell}\r\n  now`, 120), 'PayPal now');
  assert.equal(cleanText('café \u{1F43E}', 120), 'café \u{1F43E}', 'ordinary text and emoji survive');
  assert.equal(cleanText('x'.repeat(500), 120).length, 120);
  assert.equal(cleanText(null, 10), '');
});
