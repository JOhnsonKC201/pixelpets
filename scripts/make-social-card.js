#!/usr/bin/env node
// Renders the two stills strangers see first, from the app's own pet renderer
// (scripts/real-pets.js), with no Electron and no GPU:
//   assets/social-card.png   1280x640 GitHub social preview, also the site's link card
//   assets/showcase.png      every coat in four poses, for the README and the site
// The site deploys on its own, so each file is copied under site/assets too, and
// the showcase gets the WebP the site's <picture> serves first.
// Usage: node scripts/make-social-card.js  (or: npm run social)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { loadPets, composeCard, composeShowcase } = require('./real-pets.js');

const ROOT = path.join(__dirname, '..');

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
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function write(rel, img) {
  const png = encodePng(img.rgba, img.w, img.h);
  for (const dir of ['assets', path.join('site', 'assets')]) {
    const out = path.join(ROOT, dir, rel);
    fs.writeFileSync(out, png);
    console.log(`wrote ${path.relative(ROOT, out)} (${img.w}x${img.h}, ${(png.length / 1024).toFixed(0)} KB)`);
  }
}

function webp(rel) {
  const src = path.join(ROOT, 'site', 'assets', rel);
  const out = src.replace(/\.png$/, '.webp');
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', src, '-c:v', 'libwebp', '-lossless', '1', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg could not write ${out}`);
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

const pets = loadPets();
write('social-card.png', composeCard(pets));
const sheet = composeShowcase(pets);
write('showcase.png', sheet);
webp('showcase.png');
console.log(`showcase is ${sheet.w}x${sheet.h}: keep the width/height on the site's <img> in step`);
