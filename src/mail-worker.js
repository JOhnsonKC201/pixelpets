// Forked IMAP worker. Receives { host, port, user, pass, secure } once over the
// process channel, connects, counts unseen messages in INBOX, reports back, and
// exits. Runs in its own process so a hung socket or library crash can never
// freeze the overlay. The password is used in-memory only - never logged.
const { ImapFlow } = require('imapflow');

// Turn an ImapFlow error into a sentence the Settings window can show.
function classify(e) {
  // A rejected login comes back as the generic message "Command failed" with
  // the reason in flags, not in the text (checked against Gmail on imapflow
  // 1.7 and 2.1), so the text search below never saw it.
  if (e && (e.authenticationFailed || e.serverResponseCode === 'AUTHENTICATIONFAILED')) {
    return 'Authentication failed - check your email and app-password.';
  }
  const code = String((e && e.code) || '').toLowerCase();
  const m = String((e && e.message) || e || '').toLowerCase();
  // timeouts first: ImapFlow's connect/greeting timeout uses code CONNECT_TIMEOUT and
  // the message "...establish connection in required time" (no literal "timeout").
  if (code.includes('timeout') || m.includes('timeout') || m.includes('timed out') || m.includes('required time')) {
    return 'Connection timed out - check the server and port.';
  }
  if (m.includes('auth') || m.includes('credential') || m.includes('login') || m.includes('password')) {
    return 'Authentication failed - check your email and app-password.';
  }
  if (m.includes('enotfound') || m.includes('getaddrinfo') || m.includes('econnrefused') || m.includes('ehostunreach')) {
    return 'Could not reach the mail server - check host and port.';
  }
  if (m.includes('certificate') || m.includes('self-signed') || m.includes('tls')) return 'TLS/certificate problem connecting to the server.';
  return 'Could not connect to the mailbox.';
}

// Only when started as a worker. Required from a test, just expose classify.
if (require.main === module || process.parentPort) {
const { onJob, reply, exitSoon } = require('./worker-port');
onJob(async (creds) => {
  const send = reply;
  let client = null;
  try {
    client = new ImapFlow({
      host: String((creds && creds.host) || ''),
      port: Number(creds && creds.port) || 993,
      secure: !creds || creds.secure !== false,
      auth: { user: String((creds && creds.user) || ''), pass: String((creds && creds.pass) || '') },
      logger: false,
      emitLogs: false,
      // fail fast on a wrong/unreachable host instead of hanging the test forever
      connectionTimeout: 12000,
      greetingTimeout: 8000,
      socketTimeout: 30000,
    });
    await client.connect();
    const status = await client.status('INBOX', { unseen: true });
    const unread = (status && status.unseen) | 0;
    // Who it is from and what it is about. A bare count ("3 new emails") still
    // makes you go and look, which is the interruption it was meant to save you;
    // a sender and a subject let you decide from the bubble whether to care - and
    // it is what the VIP list upstream matches against. Best-effort on purpose:
    // any failure here must still report the count rather than the whole poll.
    let latest = null;
    if (unread > 0) {
      try {
        const lock = await client.getMailboxLock('INBOX');
        try {
          const uids = await client.search({ seen: false }, { uid: true });
          if (uids && uids.length) {
            const msg = await client.fetchOne(String(uids[uids.length - 1]), { envelope: true }, { uid: true });
            const env = msg && msg.envelope;
            const from = env && Array.isArray(env.from) ? env.from[0] : null;
            if (env) {
              latest = {
                address: String((from && from.address) || '').slice(0, 160),
                name: String((from && from.name) || '').slice(0, 80),
                subject: String(env.subject || '').replace(/\s+/g, ' ').trim().slice(0, 120),
              };
            }
          }
        } finally { lock.release(); }
      } catch (e) { latest = null; }   // the count is the contract; the detail is a bonus
    }
    send({ ok: true, unread, latest });
  } catch (e) {
    send({ ok: false, error: classify(e) });
  } finally {
    try { if (client) await client.logout(); } catch (e) { /* ignore */ }
    exitSoon();
  }
});

// Safety: if no creds arrive, don't hang forever.
setTimeout(() => process.exit(0), 30000);
}

module.exports = { classify };
