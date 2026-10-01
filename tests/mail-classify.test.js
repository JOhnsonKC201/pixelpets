// What the Settings "Test" button says when the mail check fails.
const test = require('node:test');
const assert = require('node:assert');
const { classify } = require('../src/mail-worker');

test('a rejected login says so, though ImapFlow only reports "Command failed"', () => {
  // The shape Gmail produced for a wrong password on imapflow 1.7.7 and 2.1.2.
  const e = Object.assign(new Error('Command failed'), {
    authenticationFailed: true, serverResponseCode: 'AUTHENTICATIONFAILED', responseText: 'Invalid credentials (Failure)',
  });
  assert.match(classify(e), /^Authentication failed/);
  assert.match(classify(Object.assign(new Error('Command failed'), { serverResponseCode: 'AUTHENTICATIONFAILED' })), /^Authentication failed/);
});

test('the other failures keep their messages', () => {
  assert.match(classify(Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' })), /timed out/);
  assert.match(classify(new Error('getaddrinfo ENOTFOUND nonexistent.invalid')), /Could not reach the mail server/);
  assert.match(classify(new Error('self-signed certificate in chain')), /TLS/);
  assert.match(classify(new Error('Command failed')), /Could not connect to the mailbox/);
});
