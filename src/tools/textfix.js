// Fixers for the text you last copied ("upper", "plain", "one line", "count").
// Pure: text in, text or a count out. Reading and writing the clipboard is
// actions.js's job, and it happens only when you run one, so the launcher list
// never shows what is on the clipboard.

const MAX_LEN = 200000;   // a long chapter; past this it is a file, not a snippet

// Characters that look like nothing: built from code points so this file never
// contains one. A no-break space becomes a plain space, the rest are dropped.
const NBSP = new RegExp(String.fromCodePoint(0xa0), 'g');
const INVISIBLE = new RegExp(`[${[0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map((c) => String.fromCodePoint(c)).join('')}]`, 'g');

// A letter that starts a word. An apostrophe counts as inside the word, so
// "don't" becomes "Don't" and not "Don'T". So does a combining mark: an accent
// stored as its own character must not split "cafés" in two.
const WORD_START = /(^|[^\p{L}\p{M}\p{N}'’])(\p{L})/gu;

const FIXERS = {
  // Writing text back to the clipboard is what drops fonts, colours and links.
  plain: (s) => s.replace(NBSP, ' ').replace(INVISIBLE, '').replace(/[^\S\r\n]+(?=\r\n|\r|\n|$)/g, ''),
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => s.toLowerCase().replace(WORD_START, (m, before, letter) => before + letter.toUpperCase()),
  oneline: (s) => s.replace(/\s+/g, ' ').trim(),
};

function count(s) {
  return {
    words: (s.match(/\S+/g) || []).length,
    chars: [...s].length,
    // Copied text often ends in a line break; that is not one more line.
    lines: s.replace(/(\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/).length,
  };
}

const OPS = [...Object.keys(FIXERS), 'count'];

// { ok: true, text } for a fixer, { ok: true, stats } for count, and
// { ok: false, reason: 'none' | 'big' | 'unknown' } when there is nothing to do.
function apply(op, input) {
  const s = String(input == null ? '' : input);
  if (!OPS.includes(op)) return { ok: false, reason: 'unknown' };
  if (!s.trim()) return { ok: false, reason: 'none' };
  if (s.length > MAX_LEN) return { ok: false, reason: 'big' };
  return op === 'count' ? { ok: true, stats: count(s) } : { ok: true, text: FIXERS[op](s) };
}

module.exports = { apply, OPS, MAX_LEN };
