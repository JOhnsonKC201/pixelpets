// Shared cat-sprite core - the single source of truth for the sit sprite geometry,
// grid primitives, coat palettes, and colour helpers. Loaded as a classic script
// by the overlay (index.html) and the settings window (settings.html) - its
// top-level const/function declarations live in the shared global lexical scope,
// so the overlay / cat-preview.js use them as bare identifiers - and required as a
// CommonJS module by scripts/pet-sheet.js (Node). Pose-specific composers
// (hunt/type/sleep) and the animated drawCat stay in the overlay.
const CELL = 4;   // px per sprite cell - sets the cat's overall size (was 5; 4 ≈ 20% smaller)

// ---- sprite builder (writes to current target G/GC/GR) ----------------------
let G, GC, GR;
const inb = (c, r) => c >= 0 && c < GC && r >= 0 && r < GR;
function setCell(c, r, role) { if (inb(c, r)) G[r][c] = role; }
function ellipse(cx, cy, rx, ry, role, onlyOn) {
  for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) {
    for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
      const dx = (c - cx) / rx, dy = (r - cy) / ry;
      if (dx * dx + dy * dy <= 1 && inb(c, r)) { if (!onlyOn || onlyOn.includes(G[r][c])) G[r][c] = role; }
    }
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
  return { cx: ((minC + maxC + 1) / 2) * CELL, cy: ((minR + maxR + 1) / 2) * CELL,
    w: (maxC - minC + 1) * CELL, h: (maxR - minR + 1) * CELL };
}
function muzzlePt() {
  let sx = 0, sy = 0, n = 0;
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) if (G[r][c] === 'N') { sx += c; sy += r; n++; }
  n = n || 1; return { x: (sx / n + 0.5) * CELL, y: (sy / n + 0.5) * CELL };
}
function buildSprite(cols, rows, compose) {
  G = Array.from({ length: rows }, () => Array(cols).fill('.')); GC = cols; GR = rows;
  compose();
  outlineHalo();
  return { grid: G, COLS: cols, ROWS: rows, SW: cols * CELL, SH: rows * CELL,
    eyes: [eyeBox('L'), eyeBox('R')], muzzle: muzzlePt() };
}

// --- sitting cat (upright, two planted paws) --------------------------------
// Parametric: a build descriptor B varies the silhouette (body width, head/ear
// size, eye shape, fluff) so different coats are different breeds, not recolours.
//   B = { bodyW, headRx, headRy, earApexY, earHalf, eyeRx, eyeRy, cheek, fluff }
function composeSit(B) {
  B = B || {};
  const CX = 12;
  const bw = B.bodyW || 1;
  const headRx = B.headRx || 6.3, headRy = B.headRy || 5.8;
  const earY = B.earApexY == null ? 1 : B.earApexY, ew = B.earW || 2.4, eo = B.earOut || 4;
  const eRx = B.eyeRx || 2, eRy = B.eyeRy || 2.4, fluff = !!B.fluff, cheek = B.cheek || 0;
  // body: wide lower haunch (gives a sitting base), mid body, head
  ellipse(CX, 24, 7.6 * bw, 5 + (fluff ? 0.4 : 0), 'C');
  ellipse(CX, 16, 5.2 * bw, 7.5, 'C');
  ellipse(CX, 8, headRx, headRy, 'C');
  if (cheek) { ellipse(CX - headRx * 0.7, 9.6, 1.7, 2.2, 'C'); ellipse(CX + headRx * 0.7, 9.6, 1.7, 2.2, 'C'); }
  if (fluff) { ellipse(5.4, 10.4, 1.9, 2.4, 'C'); ellipse(18.6, 10.4, 1.9, 2.4, 'C'); } // cheek ruff
  // ears - proper cat triangles on top of the head, slight outward tilt
  triangle(CX - eo - 0.5, earY, CX - eo - ew, 7.6, CX - eo + ew, 6.4, 'K');
  triangle(CX + eo + 0.5, earY, CX + eo + ew, 7.6, CX + eo - ew, 6.4, 'K');
  const iw = ew * 0.55;
  triangle(CX - eo - 0.3, earY + 2, CX - eo - iw, 7.2, CX - eo + iw, 6.6, 'I');
  triangle(CX + eo + 0.3, earY + 2, CX + eo + iw, 7.2, CX + eo - iw, 6.6, 'I');
  if (fluff) { ellipse(CX - eo, 6.0, 0.9, 1.4, 'W', ['C', 'K']); ellipse(CX + eo, 6.0, 0.9, 1.4, 'W', ['C', 'K']); } // ear tufts
  // muzzle + chest (fuller chest when fluffy)
  ellipse(CX, 12, 3, 2, 'W', ['C']); ellipse(CX, 17, fluff ? 3.4 : 2.7, 7, 'W', ['C']);
  // two front legs (narrow columns down the front) + planted paws
  ellipse(10, 23, 1.6, 5.2, 'C'); ellipse(14, 23, 1.6, 5.2, 'C');
  ellipse(10, 27.4, 2, 1.7, 'W', ['C']); ellipse(14, 27.4, 2, 1.7, 'W', ['C']);
  // eyes + nose
  ellipse(9, 8.2, eRx, eRy, 'E'); ellipse(15, 8.2, eRx, eRy, 'E');
  setCell(12, 11, 'N'); setCell(11, 11, 'N');
  // tabby markings ONLY on real tabbies (stripes look wrong on calico/solid coats)
  if (B.tabby) {
    [[11, 6], [12, 7], [13, 6]].forEach(([c, r]) => { if (G[r][c] === 'C') setCell(c, r, 'K'); }); // forehead M
    for (let r = 0; r < GR; r++) for (let c = 17; c < GC; c++) if (G[r][c] === 'C' && r % 2 === 0) G[r][c] = 'K';
    [8, 10, 14, 16].forEach((sc) => { for (let r = 13; r < 26; r += 2) { if (G[r][sc] === 'C') setCell(sc, r, 'K'); } });
  }
  // tortie/calico colour patches (invisible on coats where patch == coat)
  ellipse(8, 19, 2.2, 3, 'X', ['C', 'K']); ellipse(15, 23, 2.2, 2.3, 'X', ['C', 'K']);
  // carve sitting-leg outlines LAST so the halo draws them on ANY colour.
  // These run to row 29, the LAST row: outlineHalo() can only write into cells that
  // exist, so anything solid on row 29 gets no outline beneath it. Stopping at 28
  // left the bottom of both paws as one unbroken slab with no dark edge, which is
  // where the pet meets the desktop and needs one most.
  for (let r = 19; r <= 29; r++) setCell(12, r, '.');                          // between the front legs
  for (let r = 22; r <= 29; r++) { setCell(8, r, '.'); setCell(16, r, '.'); }  // each front leg vs haunch
  // toe split on each planted paw -> the halo draws a dark notch, so the toes read
  // even on solid coats where the paw is the same colour as the leg (Black/Gray/Slate/Tortie)
  setCell(10, 27, '.'); setCell(10, 28, '.'); setCell(10, 29, '.');
  setCell(14, 27, '.'); setCell(14, 28, '.'); setCell(14, 29, '.');
}

// ---- coat patterns ----------------------------------------------------------
const PATTERNS = [
  { name: 'Orange Tabby', coat: '#e8943c', mark: '#b5641d', white: '#f7f1e6', patch: '#e8943c', eye: '#8bbf5a', nose: '#e0888f', inner: '#f0b6a0', outline: '#5a3514' },
  { name: 'Mackerel Tabby', coat: '#9aa3b0', mark: '#5c6470', white: '#f2f4f7', patch: '#9aa3b0', eye: '#9ccf6a', nose: '#e3a0a6', inner: '#f0c4c4', outline: '#2f343d' },
  { name: 'Brown Tabby', coat: '#a07d52', mark: '#5f4528', white: '#efe6d4', patch: '#a07d52', eye: '#c9a23c', nose: '#c98b85', inner: '#e6bda6', outline: '#352718' },
  { name: 'Siamese', coat: '#e8dcc4', mark: '#5a4636', white: '#f3ecdd', patch: '#e8dcc4', eye: '#6db4d6', nose: '#d6a3a8', inner: '#e3b9bd', outline: '#3a2f26' },
  { name: 'Tuxedo', coat: '#2b2d33', mark: '#2b2d33', white: '#f7f8fb', patch: '#2b2d33', eye: '#8bbf5a', nose: '#e6a6ac', inner: '#caa0a6', outline: '#0e0f13' },
  { name: 'Black', coat: '#2b2d33', mark: '#212329', white: '#2b2d33', patch: '#2b2d33', eye: '#d8b13a', nose: '#b06b72', inner: '#6b4a52', outline: '#141519' },
  { name: 'Gray', coat: '#8b94a3', mark: '#8b94a3', white: '#8b94a3', patch: '#8b94a3', eye: '#c9a23c', nose: '#d99fa5', inner: '#e9c2c2', outline: '#2f343d' },
  { name: 'White', coat: '#f2f1ec', mark: '#f2f1ec', white: '#ffffff', patch: '#f2f1ec', eye: '#6db4d6', nose: '#f0b4ba', inner: '#f7d4d4', outline: '#9b948a' },
  { name: 'Cream', coat: '#ecd6ab', mark: '#ecd6ab', white: '#f7eed6', patch: '#ecd6ab', eye: '#c9a23c', nose: '#e2a7ab', inner: '#f2cbcb', outline: '#b59a6a' },
  { name: 'Tortoiseshell', coat: '#2b2d33', mark: '#1f2024', white: '#2b2d33', patch: '#c9762a', eye: '#c9a23c', nose: '#b06b72', inner: '#7a5560', outline: '#141519' },
  { name: 'Calico', coat: '#f3f1ec', mark: '#2b2d33', white: '#ffffff', patch: '#d6802f', eye: '#c9a23c', nose: '#d98f95', inner: '#f0cccc', outline: '#6f6a62' },
  { name: 'Slate', coat: '#8d97ac', mark: '#6f7892', white: '#8d97ac', patch: '#8d97ac', eye: '#ffffff', nose: '#ff9aa2', inner: '#ff9aa2', outline: '#2e323d' },
  // Chocolate (Havana Brown): a solid warm-brown coat with vivid green eyes - fills the
  // gap left by the striped Brown Tabby. Solid coat (white/mark/patch == coat: no bib,
  // no dark ears, no stripes), like Black/Gray/Slate. Slightly warmer inner ear so it reads.
  { name: 'Chocolate', coat: '#6b4a34', mark: '#6b4a34', white: '#6b4a34', patch: '#6b4a34', eye: '#8bbf5a', nose: '#c98b85', inner: '#a5786e', outline: '#2c1d13' },
  // Russian Blue: a cool, slightly darker blue-grey solid with the breed's signature
  // vivid green eyes and a mauve nose - distinct from Gray (gold eyes) and Slate (white eyes).
  { name: 'Russian Blue', coat: '#6f8196', mark: '#6f8196', white: '#6f8196', patch: '#6f8196', eye: '#8bbf5a', nose: '#b98d97', inner: '#cdb4c2', outline: '#2b323c' },
];

// Body-build archetypes - different breeds get different silhouettes.
const BUILDS = {
  standard: { earApexY: 1, earW: 2.4, earOut: 4 },
  // earApexY 0, not -1: row -1 is off the top of the 30-row grid, so slender ear
  // tips were sliced flat AND got no halo (outlineHalo cannot write out of bounds).
  // That hit Mackerel Tabby, Siamese, Black, Slate and Russian Blue - and Mackerel
  // Tabby is the default coat.
  slender: { bodyW: 0.85, headRx: 5.7, headRy: 5.4, earApexY: 0, earW: 2.3, earOut: 4.2, eyeRx: 2.1, eyeRy: 2.0 },
  stocky: { bodyW: 1.16, headRx: 6.8, headRy: 6.0, earApexY: 1.4, earW: 2.7, earOut: 3.9, cheek: 1, eyeRx: 2.0, eyeRy: 2.2 },
  fluffy: { bodyW: 1.08, headRx: 6.4, headRy: 5.9, earApexY: 0.8, earW: 2.5, earOut: 4, fluff: true, eyeRx: 2.0, eyeRy: 2.3 },
};
//  Orange    Mackerel  Brown    Siamese   Tuxedo    Black     Gray     White    Cream    Tortie   Calico   Slate     Chocolate  Russian Blue
const PATTERN_BUILD = ['standard', 'slender', 'fluffy', 'slender', 'standard', 'slender', 'stocky', 'fluffy', 'stocky', 'fluffy', 'fluffy', 'slender', 'standard', 'slender'];
const TABBY = [true, true, true, false, false, false, false, false, false, false, false, false, false, false]; // only Orange/Mackerel/Brown get stripes

// ---- colour helpers ---------------------------------------------------------
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lerpHex(a, b, t) { const ca = hexToRgb(a), cb = hexToRgb(b), m = (i) => Math.round(ca[i] + (cb[i] - ca[i]) * t); return `rgb(${m(0)},${m(1)},${m(2)})`; }
function toRgb(s) { if (s[0] === '#') return hexToRgb(s); const m = s.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
function rgbStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function shadeStr(rgb, f) { const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`; }
const HALO = '#fbfdff';
const BODY = new Set(['C', 'K', 'W', 'X', 'I']);

// CommonJS export (Node, for scripts/pet-sheet.js). In a browser classic
// script `module` is undefined, so this is skipped and the declarations above
// remain available in the shared global scope.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CELL, inb, setCell, ellipse, triangle, outlineHalo, eyeBox, muzzlePt, buildSprite, composeSit, PATTERNS, BUILDS, PATTERN_BUILD, TABBY, hexToRgb, lerpHex, toRgb, rgbStr, shadeStr, HALO, BODY };
}
