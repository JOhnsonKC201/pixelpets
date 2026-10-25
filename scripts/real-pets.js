// The pet as the app draws it, for still images made without Electron.
//
// The README sheet and the link-preview card used to come from make-demo-gif.js,
// which carried its own copy of the cat. That copy drifted from the real one, so
// the first picture anyone saw of the project was a pet nobody could install.
// This runs the overlay's own drawCat in scripts/overlay-vm.js against a context
// that records fillRect calls, and rasterizes them here. Same sprites, same
// shading, same eyes and whiskers as the app, as long as the pose only paints
// rectangles (open eyes, no strokes), which every pose used below does.
'use strict';
const zlib = require('zlib');
const { loadOverlay } = require('./overlay-vm.js');

// RGBA to PNG, no dependencies (the same encoder the other generators carry).
function encodePng(rgba, w, h) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    let crc = -1; for (const byte of body) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    const crcB = Buffer.alloc(4); crcB.writeInt32BE((crc ^ -1) | 0);
    return Buffer.concat([len, body, crcB]);
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- pets -------------------------------------------------------------------
const POSES = {
  sit: { expr: (i) => `sprites[${i}]`, opts: {} },
  type: { expr: (i) => `typeSprites[${i}]`, opts: { typing: true, look: { x: 0, y: 0.6 } } },
  hunt: { expr: (i) => `huntSpriteFor(${i})`, opts: { dilate: 1.32 } },
  loaf: { expr: (i) => `loafSprites[${i}]`, opts: {} },
};

function loadPets() {
  const out = {};
  for (const species of ['cat', 'dog']) {
    const h = loadOverlay();
    h.run(`setSpecies(${JSON.stringify(species)})`);
    out[species] = { h, names: h.run('PATTERNS.map((p) => p.name)') };
  }
  return out;
}

// Records what drawCat paints, inside the vm, and hands back plain data.
function recordPose(h, pose, coat) {
  const P = POSES[pose];
  return h.run(`(() => {
    const sp = ${P.expr(coat)};
    const p = PATTERNS[${coat}];
    const pal = { O: toRgb(p.outline), C: toRgb(p.coat), K: toRgb(p.mark), W: toRgb(p.white), X: toRgb(p.patch),
      I: toRgb(p.inner), N: toRgb(p.nose), E: toRgb(p.eye), H: toRgb(HALO) };
    if (p.tongue) pal.T = toRgb(p.tongue);
    const ops = [];
    let style = '#000', alpha = 1;
    const g = new Proxy({}, {
      get(_t, k) {
        if (k === 'fillRect') return (x, y, w, hh) => ops.push([x, y, w, hh, style, alpha]);
        if (k === 'fillStyle') return style;
        if (k === 'globalAlpha') return alpha;
        return () => {};
      },
      set(_t, k, v) { if (k === 'fillStyle') style = v; if (k === 'globalAlpha') alpha = v; return true; },
    });
    drawCat(g, sp, 0, pal, Object.assign({ bob: 0, eyeMode: 'open' }, ${JSON.stringify(P.opts)}));
    return { ops, w: sp.SW, h: sp.SH };
  })()`);
}

function parseColour(s) {
  const str = String(s);
  if (str[0] === '#') {
    const n = parseInt(str.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = str.match(/[\d.]+/g).map(Number);
  return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
}

// Source-over onto an RGBA buffer, every op scaled by an integer so a pixel of
// the sprite stays a crisp block.
function paint(buf, bw, bh, x, y, w, h, rgba) {
  const [r, g, b, a] = rgba;
  for (let yy = Math.max(0, y); yy < Math.min(bh, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(bw, x + w); xx++) {
      const i = (yy * bw + xx) * 4, da = buf[i + 3] / 255, oa = a + da * (1 - a);
      if (oa <= 0) continue;
      buf[i] = Math.round((r * a + buf[i] * da * (1 - a)) / oa);
      buf[i + 1] = Math.round((g * a + buf[i + 1] * da * (1 - a)) / oa);
      buf[i + 2] = Math.round((b * a + buf[i + 2] * da * (1 - a)) / oa);
      buf[i + 3] = Math.round(oa * 255);
    }
  }
}

const WHISKER = 'rgb(245,245,245)';

function renderPet(pets, { species, pose, coat, scale }) {
  const rec = recordPose(pets[species].h, pose, coat);
  const w = rec.w * scale, h = rec.h * scale;
  const rgba = new Uint8ClampedArray(w * h * 4);
  let whiskerPixels = 0;
  for (const [x, y, ow, oh, style, alpha] of rec.ops) {
    const c = parseColour(style);
    c[3] *= alpha;
    if (style === WHISKER && ow === 1 && oh === 1) whiskerPixels += 1;
    paint(rgba, w, h, Math.round(x) * scale, Math.round(y) * scale, Math.round(ow) * scale, Math.round(oh) * scale, c);
  }
  return { rgba, w, h, whiskerPixels };
}

// The painted bounds of a rendered pet, so layouts stand it on its real feet.
function bounds(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.rgba[(y * img.w + x) * 4 + 3] < 8) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---- pixel type ---------------------------------------------------------------
// 3x5 capitals: the face the README wordmark and the old card already used, now
// with the whole alphabet so a tagline can say "dog".
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 6, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 5, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7], ' ': [0, 0, 0, 0, 0],
};
const textWidth = (text, scale) => text.length * 4 * scale - scale;

function drawText(buf, bw, bh, text, x, y, scale, rgb) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r] & (1 << (2 - c))) paint(buf, bw, bh, cx + c * scale, y + r * scale, scale, scale, [...rgb, 1]);
    }
    cx += 4 * scale;
  }
}

function blit(dst, dw, dh, img, x, y) {
  for (let yy = 0; yy < img.h; yy++) for (let xx = 0; xx < img.w; xx++) {
    const i = (yy * img.w + xx) * 4, a = img.rgba[i + 3] / 255;
    if (a > 0) paint(dst, dw, dh, x + xx, y + yy, 1, 1, [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], a]);
  }
}

// ---- palette (site/index.html :root) ------------------------------------------
const BG = [21, 22, 29], PANEL = [35, 38, 47], TASKBAR = [14, 16, 22];
const ORANGE = [232, 148, 60], MUTED = [154, 160, 173], INK = [238, 240, 245];

// ---- the link-preview card ----------------------------------------------------
const CARD = {
  w: 1280, h: 640, floor: 560,
  word: 'PIXELPETS', wordScale: 12,
  tagline: ['A CAT OR A DOG THAT', 'LIVES ON YOUR DESKTOP'], tagScale: 5,
  hero: { species: 'cat', pose: 'sit', coat: 4, scale: 3 },          // Tuxedo: the pet the reel films
  crew: [
    { species: 'cat', pose: 'sit', coat: 0, scale: 1 },               // Orange Tabby
    { species: 'cat', pose: 'loaf', coat: 3, scale: 1 },              // Siamese
    { species: 'dog', pose: 'sit', coat: 0, scale: 1 },               // Black Lab
    { species: 'cat', pose: 'sit', coat: 10, scale: 1 },              // Calico
    { species: 'cat', pose: 'sit', coat: 7, scale: 1 },               // White
  ],
};

// Every element as a box, so the layout can be checked before a pixel is drawn.
function cardLayout(pets) {
  const L = 88;
  const items = [{ id: 'taskbar', layer: 'floor', x: 0, y: CARD.floor, w: CARD.w, h: CARD.h - CARD.floor }];
  const wordH = 5 * CARD.wordScale;
  items.push({ id: 'wordmark', layer: 'text', x: L, y: 96, w: textWidth(CARD.word, CARD.wordScale), h: wordH });
  items.push({ id: 'rule', layer: 'text', x: L, y: 96 + wordH + 28, w: 72, h: 6 });
  CARD.tagline.forEach((line, i) => items.push({
    id: `tag${i}`, layer: 'text', x: L, y: 96 + wordH + 62 + i * 44, w: textWidth(line, CARD.tagScale), h: 5 * CARD.tagScale,
  }));

  const place = (id, spec, x) => {
    const img = renderPet(pets, spec), b = bounds(img);
    return { id, layer: 'pet', species: spec.species, spec, img, b, x, y: CARD.floor - b.h, w: b.w, h: b.h };
  };
  const hero = place('hero', CARD.hero, 0);
  hero.x = CARD.w - 96 - hero.w;
  let x = L;
  const crew = CARD.crew.map((spec, i) => {
    const it = place(`crew${i}`, spec, x);
    x += it.w + 18;
    return it;
  });
  return [...items, ...crew, hero];
}

function composeCard(pets) {
  const { w, h } = CARD;
  const buf = new Uint8ClampedArray(w * h * 4);
  paint(buf, w, h, 0, 0, w, h, [...BG, 1]);
  const items = cardLayout(pets);
  for (const it of items) {
    if (it.id === 'taskbar') {
      paint(buf, w, h, it.x, it.y, it.w, it.h, [...TASKBAR, 1]);
      paint(buf, w, h, it.x, it.y, it.w, 2, [...PANEL, 1]);
    } else if (it.id === 'wordmark') drawText(buf, w, h, CARD.word, it.x, it.y, CARD.wordScale, ORANGE);
    else if (it.id === 'rule') paint(buf, w, h, it.x, it.y, it.w, it.h, [...ORANGE, 1]);
    else if (it.id.startsWith('tag')) drawText(buf, w, h, CARD.tagline[Number(it.id.slice(3))], it.x, it.y, CARD.tagScale, MUTED);
    else if (it.layer === 'pet') blit(buf, w, h, it.img, it.x - it.b.x, it.y - it.b.y);
  }
  return { rgba: buf, w, h };
}

// ---- the showcase sheet: every coat in four poses -------------------------------
const SHEET = { poses: ['sit', 'type', 'hunt', 'loaf'], gap: 12, labelH: 34, pad: 14, scale: 1 };

function composeShowcase(pets) {
  const names = pets.cat.names;
  const rows = SHEET.poses.map((pose) => names.map((_, i) => renderPet(pets, { species: 'cat', pose, coat: i, scale: SHEET.scale })));
  const rowH = rows.map((r) => Math.max(...r.map((img) => bounds(img).h)) + SHEET.pad);
  // Columns are as wide as the widest pose (the hunt crouch), so no two pets touch.
  const col = Math.max(...rows.flat().map((img) => bounds(img).w)) + SHEET.gap;
  const w = names.length * col + 10, h = SHEET.labelH + rowH.reduce((a, b) => a + b, 0) + 6;
  const buf = new Uint8ClampedArray(w * h * 4);
  paint(buf, w, h, 0, 0, w, h, [...BG, 1]);
  names.forEach((name, i) => {
    // Two-word names stack, so every label fits its column at a readable size.
    const words = name.toUpperCase().split(' ');
    const lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [words[0]];
    lines.forEach((line, k) => {
      const tw = textWidth(line, 2);
      drawText(buf, w, h, line, 5 + i * col + Math.round((col - tw) / 2), 6 + k * 13, 2, k === lines.length - 1 ? INK : MUTED);
    });
  });
  let y = SHEET.labelH;
  rows.forEach((row, r) => {
    if (r % 2 === 1) paint(buf, w, h, 0, y, w, rowH[r], [...PANEL, 0.45]);
    const floor = y + rowH[r] - SHEET.pad / 2;
    row.forEach((img, i) => {
      const b = bounds(img);
      blit(buf, w, h, img, 5 + i * col + Math.round((col - b.w) / 2) - b.x, floor - b.h - b.y);
    });
    y += rowH[r];
  });
  return { rgba: buf, w, h };
}

module.exports = { loadPets, renderPet, bounds, textWidth, drawText, encodePng, CARD, cardLayout, composeCard, SHEET, composeShowcase };
