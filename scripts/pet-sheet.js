// Headless QA contact sheet: renders every breed x pose for a species straight to
// a PNG, with no Electron and no canvas dependency. This is how the dog poses get
// checked while they are being drawn - reading grid code cannot tell you whether a
// silhouette actually reads as a dog.
//   node scripts/pet-sheet.js dog   -> previews/dog-sheet.png
//   node scripts/pet-sheet.js cat   -> previews/cat-sheet.png
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const cat = require('../src/cat-sprite.js');
const dog = require('../src/dog-sprite.js');
dog.attach(cat);   // the dog module composes with cat-sprite's grid primitives

const SCALE = 3;                 // px per sprite cell in the sheet
const PAD = 10;
const BG = [24, 26, 34, 255];

const SPECIES = {
  cat: {
    patterns: cat.PATTERNS,
    build: cat.PATTERN_BUILD,
    builds: cat.BUILDS,
    extra: (i) => ({ tabby: cat.TABBY[i] }),
    poses: [
      ['sit', 24, 30, (B) => cat.composeSit(B)],
    ],
  },
  dog: {
    patterns: dog.DOG_PATTERNS,
    build: dog.DOG_PATTERN_BUILD,
    builds: dog.DOG_BUILDS,
    extra: () => ({}),
    poses: [
      ['sit', 24, 30, (B) => dog.composeSitDog(B)],
      ['bow', 30, 22, (B) => dog.composeBowDog(B)],
      ['type', 24, 24, (B) => dog.composeTypeDog(B)],
      ['curl', 24, 30, (B) => dog.composeCurlDog(B)],
      ['beg', 24, 30, (B) => dog.composeBegDog(B)],
    ],
  },
};

// role char -> palette key
const ROLE = { C: 'coat', K: 'mark', W: 'white', X: 'patch', I: 'inner', N: 'nose', E: 'eye', O: 'outline', T: 'tongue' };

function hexToRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function blitSprite(buf, W, sp, ox, oy, pal) {
  for (let r = 0; r < sp.ROWS; r++) for (let c = 0; c < sp.COLS; c++) {
    const ch = sp.grid[r][c];
    if (ch === '.') continue;
    let rgb, a = 255;
    if (ch === 'H') { rgb = [251, 253, 255]; a = 110; }
    else {
      const key = ROLE[ch];
      if (!key || !pal[key]) continue;
      rgb = hexToRgb(pal[key]);
      // same top-lit body shading the renderer uses, so the sheet matches the app
      if ('CKWXI'.includes(ch)) { const f = Math.max(0.82, 1.12 - (r / sp.ROWS) * 0.34); rgb = rgb.map((v) => Math.min(255, Math.round(v * f))); }
      else if (ch === 'O') { const f = 1.16 - (r / sp.ROWS) * 0.30; rgb = rgb.map((v) => Math.min(255, Math.round(v * f))); }
    }
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
      const X = ox + c * SCALE + dx, Y = oy + r * SCALE + dy;
      const i = (Y * W + X) * 4, al = a / 255;
      buf[i] = Math.round(rgb[0] * al + buf[i] * (1 - al));
      buf[i + 1] = Math.round(rgb[1] * al + buf[i + 1] * (1 - al));
      buf[i + 2] = Math.round(rgb[2] * al + buf[i + 2] * (1 - al));
      buf[i + 3] = 255;
    }
  }
}

function crc(b) { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const b = Buffer.concat([Buffer.from(t), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(b), 0); return Buffer.concat([l, b, cc]); }
function encodePng(rgba, w, h) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --all: every ACTIVITY, not just the poses this script can compose directly.
//
// The dog's composers live in a module, but the cat's live inside the overlay,
// which is Electron-coupled and cannot be required. Rather than move working code
// out of the renderer, this reaches the composers where they are: scripts/overlay-vm.js
// loads the whole overlay script stack in a vm with a mocked browser, and the pose
// caches (pawSpriteFor / batSpriteFor) hand back real sprite grids.
// So one command now covers every activity x every coat, for either species.
const ALL_POSES = [
  ['sit', (i) => `sprites[${i}]`],
  ['type', (i) => `typeSprites[${i}]`],
  ['loaf', (i) => `loafSprites[${i}]`],
  ['rear', (i) => `rearSprites[${i}]`],
  ['hunt', (i) => `huntSpriteFor(${i})`],
  ['groom', (i) => `pawSpriteFor(${i}, 1, 0)`],
  ['ponder', (i) => `pawSpriteFor(${i}, 0.75, 0.1)`],
  ['play', (i) => `pawSpriteFor(${i}, 0.6, 0.7)`],
  ['bat', (i) => `batSpriteFor(${i}, -1, 1)`],
];

function allPoses(which) {
  const species = which === 'dog' ? 'dog' : 'cat';
  const { loadOverlay } = require('./overlay-vm.js');
  const h = loadOverlay();
  h.run(`setSpecies(${JSON.stringify(species)})`);
  const pals = h.run('PATTERNS.map((p) => ({ name: p.name, coat: p.coat, mark: p.mark, white: p.white, patch: p.patch, inner: p.inner, nose: p.nose, eye: p.eye, outline: p.outline, tongue: p.tongue }))');

  // Pull every grid first so the layout can size itself to what actually came back.
  const cells = pals.map((_, i) => ALL_POSES.map(([, expr]) => {
    const sp = h.run(`(() => { const s = ${expr(i)}; return s ? { grid: s.grid.map((r) => r.join('')), COLS: s.COLS, ROWS: s.ROWS } : null; })()`);
    return sp ? { grid: sp.grid.map((r) => r.split('')), COLS: sp.COLS, ROWS: sp.ROWS } : null;
  }));

  const flat = cells.flat().filter(Boolean);
  const maxW = Math.max(...flat.map((s) => s.COLS)) * SCALE;
  const maxH = Math.max(...flat.map((s) => s.ROWS)) * SCALE;
  const cellW = maxW + PAD, cellH = maxH + PAD;
  const W = ALL_POSES.length * cellW + PAD, H = pals.length * cellH + PAD;

  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = BG[0]; buf[i * 4 + 1] = BG[1]; buf[i * 4 + 2] = BG[2]; buf[i * 4 + 3] = 255; }

  cells.forEach((row, i) => row.forEach((sp, j) => {
    if (!sp) return;
    const ox = PAD + j * cellW + Math.floor((maxW - sp.COLS * SCALE) / 2);
    const oy = PAD + i * cellH + (maxH - sp.ROWS * SCALE);   // bottom-align: every pet stands on one floor line
    blitSprite(buf, W, sp, ox, oy, pals[i]);
  }));

  const out = path.join(__dirname, '..', 'previews', `${species}-poses.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(buf, W, H));
  console.log(`${out}  (${W}x${H})  ${pals.length} coats x ${ALL_POSES.length} activities`);
  console.log(`  columns: ${ALL_POSES.map((p) => p[0]).join(', ')}`);
}

function main() {
  const which = (process.argv[2] || 'dog').toLowerCase();
  if (process.argv.includes('--all')) return allPoses(which);
  const S = SPECIES[which];
  if (!S) { console.error(`unknown species "${which}" (expected cat|dog)`); process.exit(1); }

  const maxW = Math.max(...S.poses.map((p) => p[1])) * SCALE;
  const maxH = Math.max(...S.poses.map((p) => p[2])) * SCALE;
  const cellW = maxW + PAD, cellH = maxH + PAD;
  const W = S.poses.length * cellW + PAD, H = S.patterns.length * cellH + PAD;

  const buf = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = BG[0]; buf[i * 4 + 1] = BG[1]; buf[i * 4 + 2] = BG[2]; buf[i * 4 + 3] = 255; }

  S.patterns.forEach((pal, i) => {
    const B = { ...S.builds[S.build[i]], ...S.extra(i) };
    S.poses.forEach(([, cols, rows, compose], j) => {
      const sp = cat.buildSprite(cols, rows, () => compose(B));
      const ox = PAD + j * cellW + Math.floor((maxW - cols * SCALE) / 2);
      const oy = PAD + i * cellH + (maxH - rows * SCALE);
      blitSprite(buf, W, sp, ox, oy, pal);
    });
  });

  const out = path.join(__dirname, '..', 'previews', `${which}-sheet.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(buf, W, H));
  console.log(`${out}  (${W}x${H})  ${S.patterns.length} breeds x ${S.poses.length} poses`);
  S.patterns.forEach((p, i) => console.log(`  ${String(i).padStart(2)} ${p.name.padEnd(22)} ${S.build[i]}`));
}

main();
