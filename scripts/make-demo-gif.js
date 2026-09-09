// Renders the README media - short looping clips that show what the desktop pet
// DOES: it sits and follows your cursor, naps when idle, taps its paws when you
// type, pounces to hunt, and purrs when you pet it. Pure JS, no browser / no
// native deps: the sprite geometry comes from src/cat-sprite.js (single source of
// truth) plus the pose composers copied from renderer.js, all rasterised by hand
// into RGBA frames and encoded with gifenc.
//   Run:  node scripts/make-demo-gif.js [demo|hero|gallery|carousel|all] [mp4]
//         npm run demo:all   # the three the README embeds
const fs = require('fs');
const path = require('path');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const S = require('../src/cat-sprite.js');

// ---- grid machinery (own copy so the renderer poses share ONE grid) ---------
let G, GC, GR;
const inb = (c, r) => c >= 0 && c < GC && r >= 0 && r < GR;
function setCell(c, r, role) { if (inb(c, r)) G[r][c] = role; }
function ellipse(cx, cy, rx, ry, role, onlyOn) {
  for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++)
    for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
      const dx = (c - cx) / rx, dy = (r - cy) / ry;
      if (dx * dx + dy * dy <= 1 && inb(c, r)) { if (!onlyOn || onlyOn.includes(G[r][c])) G[r][c] = role; }
    }
}
function triangle(ax, ay, bx, by, cx2, cy2, role) {
  const minc = Math.floor(Math.min(ax, bx, cx2)), maxc = Math.ceil(Math.max(ax, bx, cx2));
  const minr = Math.floor(Math.min(ay, by, cy2)), maxr = Math.ceil(Math.max(ay, by, cy2));
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  for (let r = minr; r <= maxr; r++) for (let c = minc; c <= maxc; c++) {
    const d1 = sign(c, r, ax, ay, bx, by), d2 = sign(c, r, bx, by, cx2, cy2), d3 = sign(c, r, cx2, cy2, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) setCell(c, r, role);
  }
}
function outlineHalo() {
  const solid = (c, r) => inb(c, r) && G[r][c] !== '.' && G[r][c] !== 'O' && G[r][c] !== 'H';
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
    if (G[r][c] !== '.') continue;
    if (solid(c - 1, r) || solid(c + 1, r) || solid(c, r - 1) || solid(c, r + 1)) G[r][c] = 'O';
  }
  const isO = (c, r) => inb(c, r) && G[r][c] === 'O';
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
    if (G[r][c] !== '.') continue;
    if (isO(c - 1, r) || isO(c + 1, r) || isO(c, r - 1) || isO(c, r + 1)) G[r][c] = 'H';
  }
}
function eyeBox(side) {
  let minC = 999, maxC = -1, minR = 999, maxR = -1;
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
    if (G[r][c] !== 'E') continue;
    if (side === 'L' ? c >= GC / 2 : c < GC / 2) continue;
    minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  if (maxC < 0) return { c: -1 };
  return { c: (minC + maxC + 1) / 2, r: (minR + maxR + 1) / 2, w: maxC - minC + 1, h: maxR - minR + 1 };
}
function muzzlePt() {
  let sx = 0, sy = 0, n = 0;
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) if (G[r][c] === 'N') { sx += c; sy += r; n++; }
  n = n || 1; return { c: sx / n + 0.5, r: sy / n + 0.5 };
}
function buildSprite(cols, rows, compose) {
  G = Array.from({ length: rows }, () => Array(cols).fill('.')); GC = cols; GR = rows;
  compose(); outlineHalo();
  return { grid: G, COLS: cols, ROWS: rows, eyes: [eyeBox('L'), eyeBox('R')], muzzle: muzzlePt() };
}

// ---- pose composers (sit from cat-sprite; the rest copied from renderer.js) --
function composeSit(B) {
  B = B || {};
  const CX = 12, bw = B.bodyW || 1;
  const headRx = B.headRx || 6.3, headRy = B.headRy || 5.8;
  const earY = B.earApexY == null ? 1 : B.earApexY, ew = B.earW || 2.4, eo = B.earOut || 4;
  const eRx = B.eyeRx || 2, eRy = B.eyeRy || 2.4, fluff = !!B.fluff, cheek = B.cheek || 0;
  ellipse(CX, 24, 7.6 * bw, 5 + (fluff ? 0.4 : 0), 'C');
  ellipse(CX, 16, 5.2 * bw, 7.5, 'C');
  ellipse(CX, 8, headRx, headRy, 'C');
  if (cheek) { ellipse(CX - headRx * 0.7, 9.6, 1.7, 2.2, 'C'); ellipse(CX + headRx * 0.7, 9.6, 1.7, 2.2, 'C'); }
  if (fluff) { ellipse(5.4, 10.4, 1.9, 2.4, 'C'); ellipse(18.6, 10.4, 1.9, 2.4, 'C'); }
  triangle(CX - eo - 0.5, earY, CX - eo - ew, 7.6, CX - eo + ew, 6.4, 'K');
  triangle(CX + eo + 0.5, earY, CX + eo + ew, 7.6, CX + eo - ew, 6.4, 'K');
  const iw = ew * 0.55;
  triangle(CX - eo - 0.3, earY + 2, CX - eo - iw, 7.2, CX - eo + iw, 6.6, 'I');
  triangle(CX + eo + 0.3, earY + 2, CX + eo + iw, 7.2, CX + eo - iw, 6.6, 'I');
  if (fluff) { ellipse(CX - eo, 6.0, 0.9, 1.4, 'W', ['C', 'K']); ellipse(CX + eo, 6.0, 0.9, 1.4, 'W', ['C', 'K']); }
  ellipse(CX, 12, 3, 2, 'W', ['C']); ellipse(CX, 17, fluff ? 3.4 : 2.7, 7, 'W', ['C']);
  ellipse(10, 23, 1.6, 5.2, 'C'); ellipse(14, 23, 1.6, 5.2, 'C');
  ellipse(10, 27.4, 2, 1.7, 'W', ['C']); ellipse(14, 27.4, 2, 1.7, 'W', ['C']);
  ellipse(9, 8.2, eRx, eRy, 'E'); ellipse(15, 8.2, eRx, eRy, 'E');
  setCell(12, 11, 'N'); setCell(11, 11, 'N');
  if (B.tabby) {
    [[11, 6], [12, 7], [13, 6]].forEach(([c, r]) => { if (G[r][c] === 'C') setCell(c, r, 'K'); });
    for (let r = 0; r < GR; r++) for (let c = 17; c < GC; c++) if (G[r][c] === 'C' && r % 2 === 0) G[r][c] = 'K';
    [8, 10, 14, 16].forEach((sc) => { for (let r = 13; r < 26; r += 2) { if (G[r][sc] === 'C') setCell(sc, r, 'K'); } });
  }
  ellipse(8, 19, 2.2, 3, 'X', ['C', 'K']); ellipse(15, 23, 2.2, 2.3, 'X', ['C', 'K']);
  for (let r = 19; r <= 28; r++) setCell(12, r, '.');
  for (let r = 22; r <= 28; r++) { setCell(8, r, '.'); setCell(16, r, '.'); }
}
function composeHunt() {
  const CX = 15;
  ellipse(CX, 12, 11, 5.4, 'C');
  ellipse(CX, 8, 6.2, 5, 'C');
  triangle(9, 4, 6, 8, 13, 7, 'K'); triangle(21, 4, 17, 7, 24, 8, 'K');
  triangle(9, 5, 8, 8, 12, 7, 'I'); triangle(21, 5, 18, 7, 22, 8, 'I');
  [[26, 13], [27, 11]].forEach(([c, r]) => ellipse(c, r, 1.6, 1.6, 'C'));
  ellipse(CX, 12, 2.6, 1.7, 'W', ['C']);
  ellipse(CX, 15, 3.2, 2.4, 'W', ['C']);
  ellipse(13, 17, 1.8, 1.5, 'W', ['C']); ellipse(17, 17, 1.8, 1.5, 'W', ['C']);
  ellipse(27, 11, 1.2, 1.2, 'W', ['C']);
  ellipse(12, 8, 2.2, 2.4, 'E'); ellipse(18, 8, 2.2, 2.4, 'E');
  setCell(15, 11, 'N'); setCell(14, 11, 'N');
  [[13, 5], [14, 6], [15, 5], [16, 6], [17, 5]].forEach(([c, r]) => { if (G[r][c] === 'C') setCell(c, r, 'K'); });
  for (let r = 10; r < 16; r += 2) for (let c = 4; c < GC; c++) if (G[r][c] === 'C' && c % 2 === 0) G[r][c] = 'K';
  ellipse(9, 12, 2.4, 2.4, 'X', ['C', 'K']); ellipse(21, 13, 2.2, 2.2, 'X', ['C', 'K']);
}
// front-facing "keyboard kneading" (the app's real typing pose): faces the viewer
// and leans over two keycaps. Forelegs are NOT baked - drawn live pressing the keys.
function composeTypeFront(B) {
  B = B || {};
  const CX = 12, fluff = !!B.fluff;
  [[20.5, 20.4], [22.2, 20.9], [23.2, 21.8], [22.6, 22.8]].forEach(([c, r]) => ellipse(c, r, 1.5, 1.5, 'C'));
  ellipse(21.8, 23.2, 1.0, 1.0, 'W', ['C']);               // tail tip
  ellipse(CX, 16, 6.0, 5.4, 'C');                          // shoulders / chest
  ellipse(6.6, 20.2, 3.4, 3.2, 'C'); ellipse(17.4, 20.2, 3.4, 3.2, 'C');   // haunches
  ellipse(CX, 8.5, 6.3, 5.6, 'C');                         // head (forward lean)
  if (fluff) { ellipse(5.6, 10.8, 1.9, 2.3, 'C'); ellipse(18.4, 10.8, 1.9, 2.3, 'C'); }
  triangle(CX - 4.5, 1.2, CX - 6.4, 6.8, CX - 1.8, 5.6, 'K');
  triangle(CX + 4.5, 1.2, CX + 6.4, 6.8, CX + 1.8, 5.6, 'K');
  triangle(CX - 4.3, 3.0, CX - 5.4, 6.3, CX - 2.8, 5.6, 'I');
  triangle(CX + 4.3, 3.0, CX + 5.4, 6.3, CX + 2.8, 5.6, 'I');
  if (fluff) { ellipse(CX - 4.5, 5.6, 0.9, 1.3, 'W', ['C', 'K']); ellipse(CX + 4.5, 5.6, 0.9, 1.3, 'W', ['C', 'K']); }
  ellipse(9, 8.7, 2.0, 2.4, 'E'); ellipse(15, 8.7, 2.0, 2.4, 'E');   // eyes look down at the keys
  ellipse(CX, 12.2, 3, 2, 'W', ['C']);
  setCell(12, 11, 'N'); setCell(11, 11, 'N');
  ellipse(CX, 17.8, 2.1, 3.2, 'W', ['C']);                 // narrow chest bib
  if (B.tabby) {
    [[11, 5], [12, 6], [13, 5]].forEach(([c, r]) => { if (G[r] && G[r][c] === 'C') setCell(c, r, 'K'); });
    for (let r = 13; r < 22; r += 2) for (let c = 3; c < 21; c++) if (G[r] && G[r][c] === 'C' && c % 2 === 0) setCell(c, r, 'K');
  }
  ellipse(7.5, 17.5, 2.2, 2.6, 'X', ['C', 'K']); ellipse(16.5, 20, 2.0, 2.0, 'X', ['C', 'K']);
}
function composeSleepCurl() {
  ellipse(13, 11, 9.6, 8, 'C');
  ellipse(6.6, 13.6, 4.5, 3.9, 'C');
  triangle(3.6, 10.6, 2.3, 13.2, 5.5, 12.7, 'K');
  triangle(8.4, 10.4, 7.0, 13.0, 10.0, 12.8, 'K');
  triangle(3.8, 11.2, 3.0, 12.9, 4.9, 12.6, 'I');
  triangle(8.3, 11.0, 7.5, 12.7, 9.2, 12.6, 'I');
  // wrapped tail sweeping around the front, resting by the nose
  [[20, 18], [17, 19], [13, 19.4], [9, 19], [6, 18], [4, 16], [3.4, 14]].forEach(([c, r]) => ellipse(c, r, 1.5, 1.4, 'K', ['C', '.']));
  ellipse(5.2, 15.2, 2.0, 1.5, 'W', ['C']);
  ellipse(5.9, 13.3, 1.1, 0.9, 'E');
  setCell(4, 14, 'N');
  ellipse(15, 11.5, 2.6, 2.4, 'X', ['C']);
}

// ---- palette (swappable per coat, so the carousel can cycle all 14) ----------
const rgb = (h) => S.hexToRgb(h);
function paletteFor(P) {
  return { O: rgb(P.outline), C: rgb(P.coat), K: rgb(P.mark), W: rgb(P.white),
    X: rgb(P.patch), I: rgb(P.inner), N: rgb(P.nose), E: rgb(P.eye), H: rgb(S.HALO) };
}
let PAL = paletteFor(S.PATTERNS[0]);    // Orange Tabby - the default "my cat"
const BODY = new Set(['C', 'K', 'W', 'X', 'I']);

// build the four pose sprites for a coat index (build archetype + tabby flag come
// from cat-sprite) so hero/gallery can wear any coat and the carousel can cycle them.
function buildFor(i) { return Object.assign({}, S.BUILDS[S.PATTERN_BUILD[i]], { tabby: S.TABBY[i] }); }
function buildPoses(i) {
  const Bi = buildFor(i);
  return {
    sit: buildSprite(24, 30, () => composeSit(Bi)),
    sleep: buildSprite(24, 20, composeSleepCurl),
    hunt: buildSprite(30, 20, composeHunt),
    typeFront: buildSprite(24, 24, () => composeTypeFront(Bi)),
  };
}
function sitFor(i) { return buildSprite(24, 30, () => composeSit(buildFor(i))); }
let SP = buildPoses(0);   // default: Orange Tabby (the demo recipe)
// The hero/gallery coat: Tuxedo, which is what the launch reel (scripts/make-reel.js) and
// the marketing site (site/cat-live.js) already star. The README media was the odd one out,
// so the storefront advertised a different cat depending on which page you landed on. Tuxedo
// ships painted rope-climb art, which the scroll clip depends on, and it is the pet the
// author actually runs. It is deliberately NOT the out-of-box coat (that is Mackerel Tabby,
// see src/config.js), so the README says which coat it shows and how to change it.
const TUX = Math.max(0, S.PATTERNS.findIndex((p) => p.name === 'Tuxedo'));

// ---- canvas + raster helpers ------------------------------------------------
let W = 480, H = 340, PX = 6;            // output size (mutable per recipe); PX = output px per grid cell
const BG_TOP = [34, 37, 48], BG_BOT = [22, 24, 32];
function newFrame() {
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / H, r = BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t, g = BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t, b = BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t;
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; }
  }
  return buf;
}
function blend(buf, x, y, c, a) {
  x = x | 0; y = y | 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4, ia = 1 - a;
  buf[i] = c[0] * a + buf[i] * ia; buf[i + 1] = c[1] * a + buf[i + 1] * ia; buf[i + 2] = c[2] * a + buf[i + 2] * ia;
}
function fillRect(buf, x, y, w, h, c, a = 1) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) blend(buf, x + xx, y + yy, c, a); }
function fillEllipse(buf, cx, cy, rx, ry, c, a) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) blend(buf, x, y, c, a);
  }
}
function shade(c, f) { return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]; }

// draw a sprite's grid (cells) at output origin ox,oy. eyeFill=false renders the
// 'E' cells as coat (for closed/happy eyes) instead of the eye colour.
function drawCells(buf, sp, ox, oy, eyeFill) {
  const grid = sp.grid, ROWS = sp.ROWS, COLS = sp.COLS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    let ch = grid[r][c]; if (ch === '.') continue;
    if (ch === 'E' && !eyeFill) ch = 'C';
    const base = PAL[ch]; if (!base) continue;
    const col = BODY.has(ch) ? shade(base, 1.12 - (r / ROWS) * 0.34) : base;
    fillRect(buf, ox + c * PX, oy + r * PX, PX, PX, col);
  }
}
function drawWhiskers(buf, sp, ox, oy) {
  const m = sp.muzzle, my = oy + m.r * PX;
  const cl = ox + (m.c - 4.0) * PX, cr = ox + (m.c + 4.0) * PX, col = [245, 245, 245];
  for (const [sx, dir] of [[cl, -1], [cr, 1]]) for (let i = 0; i < 3; i++) {
    const y0 = my + (i - 1) * 4;
    for (let t = 0; t <= 14; t++) blend(buf, sx + dir * t, y0 + (i - 1) * t * 0.18, col, 0.5);
  }
}
// eyes overlay. mode: open | blink | happy ; look = pupil offset in output px
function drawEyes(buf, sp, ox, oy, mode, look) {
  for (const e of sp.eyes) {
    if (e.c < 0) continue;
    const cx = ox + e.c * PX, cy = oy + e.r * PX, ew = e.w * PX, eh = e.h * PX;
    if (mode === 'blink') { fillRect(buf, cx - ew / 2, cy - 1, ew, 2, [40, 42, 50]); continue; }
    if (mode === 'happy') { // ^_^ closed-arc
      for (let t = -3; t <= 3; t++) blend(buf, cx + t, cy - Math.abs(t) * 0.7 + 1, [40, 42, 50], 0.9);
      continue;
    }
    const pw = Math.max(4, ew * 0.5), ph = Math.max(5, eh * 0.72);
    const px = cx - pw / 2 + look, py = cy - ph / 2;
    fillRect(buf, px, py + 1, pw, ph - 2, [34, 36, 43]);
    fillRect(buf, px + 1, py, pw - 2, ph, [34, 36, 43]);
    fillRect(buf, px + pw - 2, py + 1, 2, 2, [255, 255, 255]); // sparkle
  }
}
function shadowAndPlace(buf, sp, baseY, dx, dy, opts) {
  const w = sp.COLS * PX, h = sp.ROWS * PX;
  const ox = Math.round((W - w) / 2 + dx), oy = Math.round(baseY - h + dy);
  fillEllipse(buf, W / 2 + dx, baseY + 4, w * 0.42, 7, [0, 0, 0], 0.22); // ground shadow
  drawCells(buf, sp, ox, oy, opts.eyeFill);
  drawWhiskers(buf, sp, ox, oy);
  drawEyes(buf, sp, ox, oy, opts.eyeMode, opts.look || 0);
  return { ox, oy, w, h };
}

// ---- tiny 3x5 caption font --------------------------------------------------
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 6, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [5, 7, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], ' ': [0, 0, 0, 0, 0],
};
function drawText(buf, text, cy, scale, col) {
  const adv = 4 * scale, total = text.length * adv - scale;
  let x = Math.round((W - total) / 2), y = Math.round(cy);
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r] & (1 << (2 - c))) fillRect(buf, x + c * scale, y + r * scale, scale, scale, col);
    x += adv;
  }
}

// ---- floating effects (z's, hearts, key taps) -------------------------------
function drawZ(buf, x, y, s, col, a) {
  for (let i = 0; i <= s; i++) { blend(buf, x + i, y, col, a); blend(buf, x + s - i, y + i, col, a); blend(buf, x + i, y + s, col, a); }
}
function drawHeart(buf, x, y, s, col, a) {
  for (let yy = 0; yy < s; yy++) for (let xx = -s; xx <= s; xx++) {
    const fx = Math.abs(xx) / s, fy = yy / s;
    if (yy < s * 0.55 ? (Math.abs(Math.abs(xx) - s * 0.45) < s * 0.45) : (fx + fy < 1.05)) blend(buf, x + xx, y + yy, col, a);
  }
}

// ---- timeline scenes --------------------------------------------------------
// Each scene pushes a self-contained LOOPING run of frames into `frames`, so a
// scene can stand alone as a micro-GIF or be strung together into the demo/hero.
let BASE_Y = 250;            // ground line (mutable per recipe)
const CAP = [150, 156, 170]; // caption grey
const push = (frames, buf, delay) => frames.push({ buf, delay });
function blinkAt(i, period, openMode) { return (i % period) < 2 ? 'blink' : openMode; }
function caption(buf, text, scale) { if (text) drawText(buf, text, H - 40, scale, CAP); }

// sits and watches you (pupils sweep to "follow the cursor"); optional big title
function sceneIntro(frames, o = {}) {
  const n = o.n || 26;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    if (o.title) drawText(buf, 'PIXELPETS', Math.round(H * 0.115), o.titleScale || 5, [255, 196, 92]);
    caption(buf, o.caption, o.capScale || 2);
    const bob = Math.round(Math.sin(i / 4) * 2);
    const look = Math.round(Math.sin(i / 5) * 3);
    shadowAndPlace(buf, SP.sit, BASE_Y, 0, bob, { eyeFill: true, eyeMode: blinkAt(i, 13, 'open'), look });
    push(frames, buf, 95);
  }
}
// naps when idle (floating z's)
function sceneNap(frames, o = {}) {
  const n = o.n || 24;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 3);
    const bob = Math.round(Math.sin(i / 6) * 1.5);
    const p = shadowAndPlace(buf, SP.sleep, BASE_Y, 0, bob, { eyeFill: false, eyeMode: 'happy' });
    for (let k = 0; k < 3; k++) { const ph = (i / n + k / 3) % 1; drawZ(buf, p.ox + p.w - 8 + k * 9, p.oy - 6 - ph * 34, 4 + k, [220, 224, 235], 1 - ph * 0.8); }
    push(frames, buf, 110);
  }
}
// a big keyboard key the cat presses (ported from renderer.drawKey; `lit` = pressed)
function drawKeyR(buf, cx, topY, w, h, lit) {
  const x0 = Math.round(cx - w / 2), y = Math.round(topY);
  fillEllipse(buf, cx, y + h + 4, w / 2 + 2, 4, [0, 0, 0], 0.18);
  fillRect(buf, x0, y + h - 3, w, 7, [86, 92, 106], 1);
  fillRect(buf, x0, y, w, h - 2, lit ? [242, 244, 248] : [207, 211, 218], 1);
  fillRect(buf, x0 + 2, y, w - 4, 3, lit ? [255, 255, 255] : [231, 234, 239], 1);
  fillRect(buf, x0 - 1, y, 1, h + 4, [58, 63, 72], 1);
  fillRect(buf, x0 + w, y, 1, h + 4, [58, 63, 72], 1);
  fillRect(buf, x0, y - 1, w, 1, [58, 63, 72], 1);
}
// the two forelegs kneading the keys, drawn live (ported from renderer.drawKneadPaws)
function drawKneadPawsR(buf, lcx, rcx, keyTop, lp, rp, shY, s) {
  const O = PAL.O, C = PAL.C, Wc = PAL.W, BEAN = [255, 143, 163];
  const rect = (x, y, w, h, col) => fillRect(buf, Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), col, 1);
  const paw = (kx, side, press) => {
    const lift = Math.round((1 - press) * 2) * 2.5 * s;
    const cx = kx + (lift >= 2 * s ? side * 2 * s : 0);
    const capTop = keyTop + Math.round(press * 3 * s);
    const pwW = 13 * s, pwH = 7 * s, pY = capTop - pwH + 2 * s - lift, pX = cx - pwW / 2;
    const ax = cx - side * 2 * s - 6 * s, aw = 11 * s, top = Math.round(shY), aH = pY - top + 3 * s;
    rect(ax, top, aw, aH, O);                       // leg outline slab
    rect(ax + 2.5 * s, top, aw - 5 * s, aH, C);     // leg coat core
    rect(pX - 2 * s, pY - 2 * s, pwW + 4 * s, pwH + 4 * s, O);   // paw outline
    rect(pX, pY, pwW, pwH, Wc);                     // white mitt
    if (lift >= 2 * s) {                            // lifted: pink toe beans
      rect(cx - 3 * s, pY + 3.5 * s, 6 * s, 3 * s, BEAN);
      rect(cx - 6.5 * s, pY + 0.5 * s, 3 * s, 3 * s, BEAN); rect(cx - 1.5 * s, pY, 3 * s, 3 * s, BEAN); rect(cx + 3.5 * s, pY + 0.5 * s, 3 * s, 3 * s, BEAN);
    } else {
      rect(cx - 1 * s, pY + 2 * s, 2 * s, pwH - 2 * s, O);   // planted: toe split
    }
  };
  paw(lcx, -1, lp); paw(rcx, 1, rp);
}
// kneads the keyboard when you type: front-facing, leaning over two keycaps, its
// forelegs pressing them alternately (ported from renderer.renderTypeFront).
function sceneType(frames, o = {}) {
  const n = o.n || 16, s = PX / S.CELL, T = Math.PI * 2 * 60;   // one full knead period (sin(t/60))
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const t = i * (T / n), wave = Math.sin(t / 60), snap = (v) => Math.pow(Math.max(0, v), 0.6);
    const lp = snap(wave), rp = snap(-wave), dip = (lp + rp) * 1.6 * s;
    const look = Math.round((rp - lp) * 1.4);
    shadowAndPlace(buf, SP.typeFront, BASE_Y, 0, Math.round(dip), { eyeFill: true, eyeMode: blinkAt(i, 22, 'open'), look });
    const cxc = W / 2, lcx = cxc - 15 * s, rcx = cxc + 15 * s, keyTop = BASE_Y - 12 * s;
    drawKeyR(buf, lcx, keyTop + Math.round(lp * 3 * s), 24 * s, 11 * s, lp > 0.6);
    drawKeyR(buf, rcx, keyTop + Math.round(rp * 3 * s), 24 * s, 11 * s, rp > 0.6);
    drawKneadPawsR(buf, lcx, rcx, keyTop, lp, rp, BASE_Y - 29 * s + dip, s);
    push(frames, buf, 75);
  }
}
// pounces to hunt the cursor (crouch-wiggle, then lunge)
function sceneHunt(frames, o = {}) {
  const n = o.n || 24;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 3);
    const wig = Math.round(Math.sin(i / 2) * 3);
    const lunge = (i % 12) >= 9 ? (i % 12 - 8) * 6 : 0;
    const p = shadowAndPlace(buf, SP.hunt, BASE_Y, wig + lunge, 0, { eyeFill: true, eyeMode: 'open', look: 2 });
    fillEllipse(buf, p.ox + p.w + 16 + lunge, BASE_Y - 6, 3, 3, [120, 200, 255], 0.9); // the "cursor" target
    push(frames, buf, 85);
  }
}
// purrs when you pet it (happy eyes + floating hearts)
function scenePet(frames, o = {}) {
  const n = o.n || 26;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const bob = Math.round(Math.sin(i / 3) * 2);
    const p = shadowAndPlace(buf, SP.sit, BASE_Y, 0, bob, { eyeFill: false, eyeMode: 'happy' });
    for (let k = 0; k < 3; k++) { const ph = (i / n + k / 3) % 1; drawHeart(buf, p.ox + p.w * 0.5 - 10 + k * 14, p.oy - 4 - ph * 40, 4, [255, 110, 140], 1 - ph * 0.85); }
    push(frames, buf, 95);
  }
}
// stretches like mochi when you drag it: a 3-band taffy stretch that matches the
// app - the head and feet stay solid while ONLY the middle elongates and thins.
function drawMochi(buf, sp, baseY, lift, thin) {
  const HEAD_END = 10, FEET_START = 22, COLS = sp.COLS, ROWS = sp.ROWS, cxCell = COLS / 2;
  const naturalTop = baseY - ROWS * PX, headTopY = naturalTop - lift;
  const headBottomY = headTopY + HEAD_END * PX, feetTopY = baseY - (ROWS - FEET_START) * PX;
  const midRows = FEET_START - HEAD_END, rowH = Math.ceil((feetTopY - headBottomY) / midRows) + 1;
  fillEllipse(buf, W / 2, baseY + 4, COLS * PX * 0.42 * (1 - thin * 0.8), 7, [0, 0, 0], 0.22);   // shadow widens on squash
  for (let r = 0; r < ROWS; r++) {
    let oy, xs, hh;
    if (r < HEAD_END) { oy = headTopY + r * PX; xs = 1; hh = PX + 1; }                            // rigid head (rides up)
    else if (r >= FEET_START) { oy = baseY - (ROWS - r) * PX; xs = 1; hh = PX + 1; }              // rigid feet (planted)
    else { const u = (r - HEAD_END) / midRows; oy = headBottomY + u * (feetTopY - headBottomY); xs = 1 - thin * Math.sin(u * Math.PI); hh = rowH; }   // middle: stretch + thin
    for (let c = 0; c < COLS; c++) {
      const ch = sp.grid[r][c]; if (ch === '.') continue;
      const base = PAL[ch]; if (!base) continue;
      const col = BODY.has(ch) ? shade(base, 1.12 - (r / ROWS) * 0.34) : base;
      fillRect(buf, Math.round(W / 2 + (c - cxCell) * PX * xs), Math.round(oy), Math.ceil(PX * xs) + 1, hh, col);
    }
  }
}
function sceneMochi(frames, o = {}) {
  const n = o.n || 30;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const t = i / n;
    let sy;
    if (t < 0.40) sy = 1 + 0.55 * Math.sin((t / 0.40) * Math.PI / 2);          // grab & stretch up
    else if (t < 0.55) sy = 1.55 - ((t - 0.40) / 0.15) * 0.75;                 // release, squash
    else sy = 1 - 0.20 * Math.exp(-(t - 0.55) * 7) * Math.cos((t - 0.55) * 26); // damped bounce back
    const lift = (sy - 1) * 73, thin = (sy - 1) * 0.85;   // stretch pulls the head up + thins the middle
    drawMochi(buf, SP.sit, BASE_Y, lift, thin);
    if (lift > 6) fillEllipse(buf, W / 2, Math.round(BASE_Y - SP.sit.ROWS * PX - lift) - 8, 3, 3, [120, 200, 255], 0.9);   // the "hand" lifting it
    push(frames, buf, 80);
  }
}

// ---- painted raster climb (the app's own hand-painted per-coat frames) ------
// The scroll clip blits the SAME painted frames the app uses, which is why this
// pure-Node script needs a PNG decoder. Coats without painted art swipe at a leaf
// instead, and that pose is composed in renderer.js (a browser script this cannot
// import) - so the clip stars a painted coat, which is also the default coat.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Tiny PNG decoder (zlib inflate + un-filter) so this pure-Node script can blit
// the painterly climb frames that the app itself uses for the scroll rope-climb.
function decodePng(file) {
  const zlib = require('zlib');
  const b = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, colorType = 6; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1, stride = w * ch;
  const out = new Uint8ClampedArray(w * h * 4);
  let cur = Buffer.alloc(stride), prev = Buffer.alloc(stride), rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rb = raw[rp++], a = x >= ch ? cur[x - ch] : 0, bb = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v;
      if (f === 1) v = rb + a; else if (f === 2) v = rb + bb; else if (f === 3) v = rb + ((a + bb) >> 1);
      else if (f === 4) { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c); }
      else v = rb;
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const si = x * ch, di = (y * w + x) * 4;
      out[di] = cur[si]; out[di + 1] = ch >= 3 ? cur[si + 1] : cur[si]; out[di + 2] = ch >= 3 ? cur[si + 2] : cur[si]; out[di + 3] = ch === 4 ? cur[si + 3] : 255;
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return { width: w, height: h, data: out };
}
function blitImage(buf, img, dx, dy, dw, dh) {
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(img.height - 1, (y * img.height / dh) | 0);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(img.width - 1, (x * img.width / dw) | 0), si = (sy * img.width + sx) * 4, a = img.data[si + 3] / 255;
      if (a > 0.004) blend(buf, dx + x, dy + y, [img.data[si], img.data[si + 1], img.data[si + 2]], a);
    }
  }
}
let _climb = null;
function climbFrames() {
  if (_climb) return _climb;
  // Painted raster art, so this one cannot be recoloured from the palette like every other
  // clip: it has to be the folder matching the TUX coat above, or the scroll clip stars a
  // different cat than the rest of the media. Only four coats have painted climb art.
  const dir = path.join(__dirname, '..', 'assets', 'climb', 'tuxedo');
  _climb = {};
  for (const n of ['idle', 'up1', 'up2', 'down1', 'down2']) _climb[n] = decodePng(path.join(dir, `${n}.png`));
  return _climb;
}

// ---- extra interaction scenes (climb / butterfly / eat / sing) --------------
// pixel-buffer triangle fill (fish tail)
function fillTri(buf, ax, ay, bx, by, cx, cy, col, a) {
  const minx = Math.floor(Math.min(ax, bx, cx)), maxx = Math.ceil(Math.max(ax, bx, cx));
  const miny = Math.floor(Math.min(ay, by, cy)), maxy = Math.ceil(Math.max(ay, by, cy));
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) blend(buf, x, y, col, a);
  }
}
// a little fish treat (ported from renderer.drawTreat)
function drawFish(buf, x, y) {
  const OUT = [90, 53, 20], BODY = [232, 148, 60], EW = [247, 241, 230], PUP = [58, 47, 38];
  fillTri(buf, x + 7, y, x + 16, y - 6, x + 16, y + 6, OUT, 1);
  fillTri(buf, x + 7, y, x + 15, y - 4.5, x + 15, y + 4.5, BODY, 1);
  fillEllipse(buf, x, y, 11, 6.5, OUT, 1);
  fillEllipse(buf, x, y, 9.6, 5.3, BODY, 1);
  fillEllipse(buf, x - 4, y - 1.5, 1.7, 1.7, EW, 1);
  fillEllipse(buf, x - 4, y - 1.5, 0.9, 0.9, PUP, 1);
}
// monarch butterfly (ported from renderer.drawButterfly; upright, no ctx transform)
function drawButterfly(buf, bx, by, sc, flap) {
  const open = 0.30 + 0.70 * Math.abs(Math.cos(flap));
  const main = [232, 148, 60], core = [181, 100, 29], halo = [255, 230, 204], body = [28, 20, 12], dots = [255, 246, 232];
  fillEllipse(buf, bx, by - sc, (12 * open + 4) * sc, 11 * sc, halo, 0.14);
  for (const side of [-1, 1]) {
    const ux = bx + side * 7 * open * sc, lx = bx + side * 5.5 * open * sc;
    fillEllipse(buf, ux, by - 3 * sc, (6.2 * open + 1) * sc, 6.6 * sc, halo, 0.55);
    fillEllipse(buf, ux, by - 3 * sc, 6.0 * open * sc, 6.2 * sc, main, 1);
    fillEllipse(buf, ux, by - 3.6 * sc, 4.0 * open * sc, 4.4 * sc, core, 1);
    fillEllipse(buf, lx, by + 5 * sc, 4.4 * open * sc, 4.6 * sc, main, 1);
    fillEllipse(buf, lx, by + 5 * sc, 2.8 * open * sc, 3.0 * sc, core, 1);
    fillEllipse(buf, bx + side * 9 * open * sc, by - 6 * sc, 0.9 * sc, 0.9 * sc, dots, 1);
  }
  fillEllipse(buf, bx, by, 1.5 * sc, 8 * sc, body, 1);
  fillEllipse(buf, bx, by - 7 * sc, 1.7 * sc, 1.9 * sc, body, 1);
  for (const s2 of [-1, 1]) for (let k = 0; k <= 5; k++) blend(buf, bx + s2 * k * 0.55 * sc, by - (8 + k) * sc, body, 0.85);
}
// a rising, fading music note (head + stem + flag)
function drawNote(buf, x, y, col, a) {
  fillEllipse(buf, x, y, 2.8, 2.1, col, a);
  fillRect(buf, x + 2, y - 10, 1.8, 10, col, a);
  fillRect(buf, x + 2, y - 10, 4.5, 2, col, a);
}

// scroll rope-climb: cycle the painterly per-coat frames (hang -> up x3 -> down x3)
function sceneClimb(frames, o = {}) {
  const F = climbFrames();
  const order = ['idle', 'idle'];
  for (let k = 0; k < 3; k++) order.push('up1', 'up2');
  order.push('idle', 'idle');
  for (let k = 0; k < 3; k++) order.push('down1', 'down2');
  const scale = (H - 22) / F.idle.height;
  for (const name of order) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const img = F[name], dw = Math.round(img.width * scale), dh = Math.round(img.height * scale);
    blitImage(buf, img, Math.round((W - dw) / 2), Math.round(H - dh - 8), dw, dh);
    push(frames, buf, 150);
  }
}
// plays with a butterfly: it loops overhead, the cat's eyes track it
function sceneButterfly(frames, o = {}) {
  const n = o.n || 34;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const t = i / n;
    const bx = W / 2 + Math.sin(t * Math.PI * 2) * 92, by = BASE_Y - 150 + Math.sin(t * Math.PI * 4) * 20;
    const look = clamp(Math.round((bx - W / 2) / 18), -3, 3);
    shadowAndPlace(buf, SP.sit, BASE_Y, 0, 0, { eyeFill: true, eyeMode: blinkAt(i, 15, 'open'), look });
    drawButterfly(buf, bx, by, 1.7, i * 0.7);
    push(frames, buf, 80);
  }
}
// noms a treat: a fish beside it, the cat leans down, happy eyes + hearts
function sceneEat(frames, o = {}) {
  const n = o.n || 30;
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const t = i / n, dip = Math.round(Math.sin(clamp(t * 1.5, 0, 1) * Math.PI) * 5), happy = t > 0.30;
    const p = shadowAndPlace(buf, SP.sit, BASE_Y, 0, dip, { eyeFill: !happy, eyeMode: happy ? 'happy' : 'open', look: 2 });
    drawFish(buf, W / 2 + 48, BASE_Y - 3);
    if (happy) for (let k = 0; k < 2; k++) { const ph = ((t - 0.30) / 0.70 + k / 2) % 1; drawHeart(buf, W / 2 + 24 + k * 14, p.oy - 2 - ph * 32, 4, [255, 110, 140], 1 - ph * 0.85); }
    push(frames, buf, 95);
  }
}
// sings: an open mouth on a rhythm with music notes rising and fading
function sceneSing(frames, o = {}) {
  const n = o.n || 28, cols = [[139, 191, 90], [255, 215, 107], [127, 214, 255]];
  for (let i = 0; i < n; i++) {
    const buf = newFrame();
    caption(buf, o.caption, 2);
    const bob = Math.round(Math.sin(i / 3) * 2);
    const p = shadowAndPlace(buf, SP.sit, BASE_Y, 0, bob, { eyeFill: true, eyeMode: blinkAt(i, 16, 'open') });
    const openA = 0.5 + 0.5 * Math.abs(Math.sin(i / 2.2)), mx = W / 2, my = p.oy + p.h * 0.40;
    fillEllipse(buf, mx, my, 3.0, 1.8 + openA * 2.4, [34, 22, 28], 0.96);
    fillEllipse(buf, mx, my + openA * 1.6, 1.9, 1.1, [214, 122, 138], 0.9);
    for (let k = 0; k < 3; k++) { const ph = (i / n + k / 3) % 1; drawNote(buf, mx + 22 + k * 15, p.oy + 6 - ph * 42, cols[k], 1 - ph * 0.85); }
    push(frames, buf, 90);
  }
}

// ---- encoders ---------------------------------------------------------------
const ROOT = path.join(__dirname, '..');
const A = (...segs) => path.join(ROOT, 'assets', ...segs);
const rel = (p) => path.relative(ROOT, p);

function encodeGif(frames, outAbs) {
  const gif = GIFEncoder();
  frames.forEach((f, idx) => {
    const palette = quantize(f.buf, 256);
    const index = applyPalette(f.buf, palette);
    gif.writeFrame(index, W, H, { palette, delay: f.delay, repeat: 0, first: idx === 0 });
  });
  gif.finish();
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, Buffer.from(gif.bytes()));
  console.log(`wrote ${rel(outAbs)} - ${W}x${H}, ${frames.length} frames, ${(gif.bytes().length / 1024).toFixed(0)} KB`);
}

// H.264 MP4 (phones / inline players): re-times to a constant ~12fps and pipes
// raw RGB to the bundled static ffmpeg. yuv420p + even dims so it plays anywhere.
function encodeMp4(frames, outAbs) {
  const { spawnSync } = require('child_process');
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
  const FPS = 12, chunks = [];
  for (const f of frames) {
    const reps = Math.max(1, Math.round((f.delay / 1000) * FPS));
    const rgb = Buffer.alloc(W * H * 3);
    for (let p = 0, q = 0; p < f.buf.length; p += 4, q += 3) { rgb[q] = f.buf[p]; rgb[q + 1] = f.buf[p + 1]; rgb[q + 2] = f.buf[p + 2]; }
    for (let k = 0; k < reps; k++) chunks.push(rgb);
  }
  const r = spawnSync(ffmpeg, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS),
    '-i', 'pipe:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-crf', '20', outAbs],
    { input: Buffer.concat(chunks), stdio: ['pipe', 'ignore', 'inherit'] });
  if (r.status === 0) console.log(`wrote ${rel(outAbs)} - ${(fs.statSync(outAbs).size / 1024).toFixed(0)} KB`);
  else console.error('ffmpeg failed', r.status);
}

// DUMP=<dir> writes a handful of individual frames as PNG so a GIF's motion can
// be spot-checked (the Read tool only renders a GIF's first frame).
function maybeDump(frames, tag) {
  if (!process.env.DUMP) return;
  const dir = process.env.DUMP;
  fs.mkdirSync(dir, { recursive: true });
  const zlib = require('zlib');
  const crc = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const b = Buffer.concat([Buffer.from(ty), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(b), 0); return Buffer.concat([l, b, cc]); };
  const png = (rgba) => { const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6; const raw = Buffer.alloc(H * (W * 4 + 1)); for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; for (let x = 0; x < W * 4; x++) raw[y * (W * 4 + 1) + 1 + x] = rgba[y * W * 4 + x]; } return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
  const N = frames.length;
  [...new Set([0, Math.floor(N * 0.35), Math.floor(N * 0.6), N - 1])].forEach((i) => fs.writeFileSync(path.join(dir, `${tag}-${i}.png`), png(frames[i].buf)));
  console.log(`dumped frames of ${tag} to ${dir}`);
}

// ---- recipes ----------------------------------------------------------------
function setCanvas(w, h, px, baseY) { W = w; H = h; PX = px; BASE_Y = baseY; }

// the original 5-scene desktop demo (480x340) -> assets/pixelpets-demo.{gif,mp4}.
// Not README media (the hero, gallery and carousel below are), so `all` leaves it out.
function recipeDemo(wantMp4) {
  setCanvas(480, 340, 6, 250); SP = buildPoses(0); PAL = paletteFor(S.PATTERNS[0]);
  const frames = [];
  sceneIntro(frames, { title: true, titleScale: 5, caption: 'A CAT OR A DOG THAT LIVES ON YOUR DESKTOP', capScale: 2 });
  sceneNap(frames, { caption: 'NAPS WHEN IDLE' });
  sceneType(frames, { caption: 'TAPS ITS PAWS WHEN YOU TYPE' });
  sceneHunt(frames, { caption: 'POUNCES TO HUNT' });
  scenePet(frames, { caption: 'PURRS WHEN YOU PET IT' });
  maybeDump(frames, 'demo');
  encodeGif(frames, A('pixelpets-demo.gif'));
  if (wantMp4) encodeMp4(frames, A('pixelpets-demo.mp4'));
}

// wide cinematic banner (960x360) -> assets/hero-banner.{gif,mp4}
function recipeHero(wantMp4) {
  setCanvas(960, 360, 8, 316); SP = buildPoses(TUX); PAL = paletteFor(S.PATTERNS[TUX]);
  const frames = [];
  sceneIntro(frames, { title: true, titleScale: 9, caption: 'A CAT OR A DOG THAT LIVES ON YOUR DESKTOP', capScale: 3, n: 30 });
  sceneType(frames, { n: 22 });
  scenePet(frames, { n: 26 });
  maybeDump(frames, 'hero');
  encodeGif(frames, A('hero-banner.gif'));
  if (wantMp4) encodeMp4(frames, A('hero-banner.mp4'));
}

// six looping micro-GIFs (340x260) -> assets/gallery/<name>.gif (+ .mp4 with `mp4`)
function recipeGallery(wantMp4) {
  const items = [
    ['climb', (f) => sceneClimb(f)],
    ['type', (f) => sceneType(f, { n: 24 })],
    ['butterfly', (f) => sceneButterfly(f, { n: 34 })],
    ['eat', (f) => sceneEat(f, { n: 30 })],
    ['sing', (f) => sceneSing(f, { n: 28 })],
    ['pet', (f) => scenePet(f, { n: 26 })],
    ['mochi', (f) => sceneMochi(f, { n: 30 })],
    ['hunt', (f) => sceneHunt(f, { n: 24 })],
  ];
  for (const [name, build] of items) {
    setCanvas(340, 260, 6, 214); SP = buildPoses(TUX); PAL = paletteFor(S.PATTERNS[TUX]);
    const frames = [];
    build(frames);
    maybeDump(frames, name);
    encodeGif(frames, A('gallery', `${name}.gif`));
    if (wantMp4) encodeMp4(frames, A('gallery', `${name}.mp4`));
  }
}

// all 14 coats cycling on one sitting cat (320x340) -> assets/coat-carousel.gif
function recipeCarousel() {
  setCanvas(320, 340, 8, 300);
  const frames = [];
  for (let ci = 0; ci < S.PATTERNS.length; ci++) {
    PAL = paletteFor(S.PATTERNS[ci]);
    const sp = sitFor(ci);
    for (let f = 0; f < 6; f++) {
      const buf = newFrame();
      drawText(buf, S.PATTERNS[ci].name, H - 34, 3, [206, 212, 226]);
      const bob = Math.round(Math.sin(f / 2.5) * 1.5);
      const look = Math.round(Math.sin(f / 3) * 2);
      shadowAndPlace(buf, sp, BASE_Y, 0, bob, { eyeFill: true, eyeMode: 'open', look });
      push(frames, buf, f === 0 ? 520 : 100);
    }
  }
  maybeDump(frames, 'carousel');
  encodeGif(frames, A('coat-carousel.gif'));
}

// ---- dispatch ---------------------------------------------------------------
//   node scripts/make-demo-gif.js [demo|hero|gallery|carousel|all] [mp4]
const arg = process.argv[2];
const recipe = (arg && arg !== 'mp4') ? arg : 'demo';
const wantMp4 = process.argv.includes('mp4');
const RECIPES = {
  demo: () => recipeDemo(wantMp4),
  hero: () => recipeHero(wantMp4),
  gallery: () => recipeGallery(wantMp4),
  carousel: () => recipeCarousel(),
  all: () => { recipeHero(wantMp4); recipeGallery(wantMp4); recipeCarousel(); },
};
if (!RECIPES[recipe]) { console.error(`unknown recipe: ${recipe} (expected demo|hero|gallery|carousel|all)`); process.exit(1); }
RECIPES[recipe]();
