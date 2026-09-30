// Speech-bubble text layout: word wrapping, line capping and screen-edge clamping.
//
// This lives outside the overlay because it is the one part of the bubble that is
// pure arithmetic, and it was the part that was wrong. The old drawBubble capped
// the PANEL at 260px but still handed the whole string to fillText, so anything
// past ~44 characters was painted straight onto the wallpaper on both sides of the
// box - white text on whatever your desktop happens to be, i.e. unreadable. An
// 80-char pinned note (the length config.js already allows) drew ~440px wide into
// a 260px panel. Reminders, calendar nudges, mail alerts and notify.js all feed
// this same function, so they all overflowed the same way.
//
// Kept measure-injected (rather than reaching for a canvas) so the wrapping can be
// unit-tested with a deterministic width function and no browser.
//
// Loaded as a classic <script> by index.html so the overlay can call
// these as bare globals, and required as a CommonJS module by the tests. In a
// browser classic script `module` is undefined, so the export at the bottom is
// skipped and the declarations stay in the shared global scope.

// Defaults chosen to keep a ONE-LINE bubble pixel-identical to the old one:
// lineH 14 + padY 3 top and bottom = the previous hard-coded height of 20.
const BUBBLE_MAX_W = 260;     // widest the panel may grow
const BUBBLE_MIN_W = 34;      // never narrower than the tail plus a little padding
const BUBBLE_MAX_LINES = 4;   // past this it stops being a speech bubble and starts being a wall
const BUBBLE_PAD_X = 8;
const BUBBLE_PAD_Y = 3;
const BUBBLE_LINE_H = 14;
const BUBBLE_MARGIN = 6;      // keep-out from the screen edges
const BUBBLE_TAIL_INSET = 8;  // how close the tail may sit to a corner of the box

// Trim `word` down until it plus `suffix` fits `innerW`. Returns '' when not even
// one character fits, so callers can bail instead of looping forever.
function fitToWidth(word, suffix, measure, innerW) {
  let s = String(word == null ? '' : word);
  while (s.length > 0 && measure(s + suffix) > innerW) s = s.slice(0, -1);
  return s;
}

// Wrap `text` to at most `maxLines` lines no wider than `innerW`. Honours explicit
// newlines, collapses other whitespace, hard-breaks any single word too wide to fit
// (a URL, a pasted path, someone leaning on a key), and marks the last line with an
// ellipsis when text was actually dropped.
function wrapBubbleText(text, measure, innerW, maxLines) {
  const src = String(text == null ? '' : text);
  const cap = Math.max(1, maxLines || BUBBLE_MAX_LINES);
  const lines = [];
  let overflow = false;

  // Returns false once the cap is reached, which is also the signal that whatever
  // we were about to add has been dropped - i.e. the text really is truncated.
  const push = (s) => {
    if (lines.length < cap) { lines.push(s); return true; }
    overflow = true;
    return false;
  };

  for (const para of src.split(/\r?\n/)) {
    if (overflow) break;
    const words = para.split(/[ \t]+/).filter(Boolean);
    let line = '';
    for (let w of words) {
      if (measure(w) > innerW) {                      // over-wide word: flush, then chop it up
        if (line && !push(line)) break;
        line = '';
        let stopped = false;
        while (w && measure(w) > innerW) {
          const head = fitToWidth(w, '', measure, innerW);
          if (!head) { w = ''; break; }               // innerW cannot hold one glyph
          if (!push(head)) { stopped = true; break; }
          w = w.slice(head.length);
        }
        if (stopped) break;
        line = w;
        continue;
      }
      const next = line ? line + ' ' + w : w;
      if (line && measure(next) > innerW) {
        if (!push(line)) break;
        line = w;
      } else {
        line = next;
      }
    }
    if (overflow) break;
    if (line) push(line);
  }

  if (overflow) {
    const last = lines[lines.length - 1] || '';
    const cut = fitToWidth(last, '…', measure, innerW);
    lines[lines.length - 1] = (cut || last.slice(0, 1)) + '…';
  }
  if (!lines.length) lines.push('');
  return lines;
}

// Full box geometry for a bubble whose tail should point at (cx, topY).
//
// `viewW`/`viewH` clamp the panel into the screen: the pet's default home is a
// screen CORNER, so a centred box (x = cx - w/2) hung off the edge for the most
// common resting position there is. The tail stays anchored on the pet even when
// the box slides away from it, which is what keeps an edge-clamped bubble reading
// as belonging to this pet.
// The widest the PANEL may be on this screen. It has to fit the viewport as well as
// its own maximum: clamping only the box position is not enough, because on a
// viewport no wider than BUBBLE_MAX_W the box gets pinned to the left margin and
// then runs off the right edge - exactly what the --note QA capture showed on the
// 260px preview canvas.
function bubbleMaxW(viewW, maxW, margin) {
  const cap = maxW || BUBBLE_MAX_W;
  const m = margin == null ? BUBBLE_MARGIN : margin;
  return viewW ? Math.min(cap, Math.max(BUBBLE_MIN_W, viewW - m * 2)) : cap;
}
// The width TEXT gets, inside that panel. Callers that cache a wrap must key it on
// this, so exposing it keeps the derivation in exactly one place.
function bubbleInnerW(viewW, maxW, margin, padX) {
  return Math.max(1, bubbleMaxW(viewW, maxW, margin) - (padX == null ? BUBBLE_PAD_X : padX) * 2);
}

function layoutBubble(o) {
  const measure = o.measure;
  const padX = o.padX == null ? BUBBLE_PAD_X : o.padX;
  const padY = o.padY == null ? BUBBLE_PAD_Y : o.padY;
  const lineH = o.lineH || BUBBLE_LINE_H;
  const margin = o.margin == null ? BUBBLE_MARGIN : o.margin;
  const maxW = bubbleMaxW(o.viewW, o.maxW, margin);
  const innerW = Math.max(1, maxW - padX * 2);

  // `lines`/`widest` may be supplied pre-computed. The wrap is the only costly part
  // here (a measure per word) and it depends on nothing that changes between frames,
  // whereas a pinned note is re-drawn on every frame for as long as it is pinned -
  // so the caller is allowed to cache it. See wrapFor() in the overlay.
  const lines = o.lines || wrapBubbleText(o.text, measure, innerW, o.maxLines || BUBBLE_MAX_LINES);
  let widest = o.widest;
  if (widest == null) { widest = 0; for (const l of lines) widest = Math.max(widest, measure(l)); }

  const w = Math.round(Math.max(BUBBLE_MIN_W, Math.min(maxW, widest + padX * 2)));
  const h = Math.round(lines.length * lineH + padY * 2);

  let x = Math.round(o.cx - w / 2);
  if (o.viewW) x = Math.min(x, o.viewW - w - margin);
  if (x < margin) x = margin;                    // also covers a screen narrower than the box

  let y = Math.round(o.topY - h);
  if (o.viewH) y = Math.min(y, o.viewH - margin - h);
  if (y < margin) y = margin;                    // dragged to the ceiling: sit just under the top edge

  // Keep the tail inside the panel body so it never floats off a corner.
  const tailX = Math.max(x + BUBBLE_TAIL_INSET, Math.min(o.cx, x + w - BUBBLE_TAIL_INSET));

  return { lines, x, y, w, h, tailX, lineH, padY };
}

// Exported inline rather than via a named object: the overlay loads this as a
// classic <script> into the SAME global scope as pets.js, which already declares
// a top-level `api`, and a second one is a hard SyntaxError at load.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    wrapBubbleText, layoutBubble, fitToWidth, bubbleMaxW, bubbleInnerW,
    BUBBLE_MAX_W, BUBBLE_MIN_W, BUBBLE_MAX_LINES,
    BUBBLE_PAD_X, BUBBLE_PAD_Y, BUBBLE_LINE_H, BUBBLE_MARGIN, BUBBLE_TAIL_INSET,
  };
}
