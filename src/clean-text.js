// Text written by strangers (a mail's sender and subject, a calendar invite's
// title) ends up in a bubble and an OS toast. Control characters, bidi overrides
// and zero-width marks can make it read as something it is not ("fdp.exe" shown
// as "exe.pdf", a hidden break inside "PayPal"), so they go before display.
const SPOOF_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

function cleanText(s, max) {
  return String(s == null ? '' : s).replace(SPOOF_CHARS, (c) => (/\s/.test(c) ? ' ' : ''))
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = { cleanText };
