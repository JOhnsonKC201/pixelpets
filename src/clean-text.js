// Text written by strangers (a mail's sender and subject, a calendar invite's
// title) ends up in a bubble and an OS toast. Control characters, bidi overrides
// and zero-width marks can make it read as something it is not ("fdp.exe" shown
// as "exe.pdf", a hidden break inside "PayPal"), so they go before display.
const SPOOF_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
// The two joiners are format characters too, but real text needs them: emoji
// sequences (families, flags), Persian and Arabic word shapes, Indic conjuncts.
// Between two plain ASCII characters they shape nothing and only hide a break.
const JOINERS = new Set([0x200C, 0x200D].map((c) => String.fromCodePoint(c)));
const isAscii = (ch) => ch !== undefined && ch.codePointAt(0) < 0x80;

function cleanText(s, max) {
  const chars = [...String(s == null ? '' : s)];
  const out = chars.map((c, i) => {
    if (JOINERS.has(c)) return isAscii(chars[i - 1]) && isAscii(chars[i + 1]) ? '' : c;
    return c.replace(SPOOF_CHARS, (x) => (/\s/.test(x) ? ' ' : ''));
  }).join('').replace(/\s+/g, ' ').trim();
  // Cut by code point, so a limit landing inside an emoji cannot leave half of it.
  return [...out].slice(0, max).join('');
}

module.exports = { cleanText };
