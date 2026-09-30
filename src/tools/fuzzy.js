// Subsequence fuzzy match for the launcher list. Every query letter must appear
// in order; the score rewards letters that start a word and runs of adjacent
// letters, and lightly penalises long titles, so "ka" ranks "Keep awake" first.

function score(needle, hay) {
  const q = String(needle || '').toLowerCase();
  const h = String(hay || '').toLowerCase();
  if (!q) return 0;
  // A whole-query substring beats any scattered match. Greedy letter matching
  // alone would pair the "n" of "note" with the "n" inside "Open".
  const sub = h.indexOf(q);
  if (sub >= 0) {
    const wordStart = sub === 0 || /[\s\-_/.]/.test(h[sub - 1]);
    return 20 * q.length + (wordStart ? 20 : 0) - h.length * 0.01;
  }
  let s = 0;
  let hi = 0;
  let prev = -2;
  for (const ch of q) {
    const at = h.indexOf(ch, hi);
    if (at < 0) return -1;
    const wordStart = at === 0 || /[\s\-_/.]/.test(h[at - 1]);
    s += 1 + (wordStart ? 8 : 0) + (at === prev + 1 ? 5 : 0);
    prev = at;
    hi = at + 1;
  }
  return s - h.length * 0.01;
}

function rank(items, query, keyOf) {
  return items
    .map((item, i) => ({ item, i, s: score(query, keyOf(item)) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}

module.exports = { score, rank };
